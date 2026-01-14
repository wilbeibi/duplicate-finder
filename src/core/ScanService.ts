import { App, TFile } from 'obsidian';
import { 
  DuplicateFinderSettings, 
  ScanResult, 
  ScanProgressCallback,
  ScanProgress
} from '../types';
import { ContentExtractor } from './ContentExtractor';
import { ExactHasher } from '../similarity/ExactHasher';
import { MinHasher } from '../similarity/MinHasher';
import { ShingleFilter } from '../similarity/ShingleFilter';
import { Comparator } from '../similarity/Comparator';

export class ScanService {
  private app: App;
  private settings: DuplicateFinderSettings;
  
  private extractor: ContentExtractor;
  private exactHasher: ExactHasher;
  private minHasher: MinHasher;
  private comparator: Comparator;
  
  private abortController: AbortController | null = null;

  constructor(
    app: App,
    settings: DuplicateFinderSettings
  ) {
    this.app = app;
    this.settings = settings;
    
    this.extractor = new ContentExtractor();
    this.exactHasher = new ExactHasher();
    this.minHasher = new MinHasher();
    this.comparator = new Comparator(settings.similarityThreshold);
  }

  async scan(onProgress?: ScanProgressCallback): Promise<ScanResult> {
    this.abortController = new AbortController();
    try {
      const startTime = Date.now();
      
      // Phase 1: File Discovery
      const fileDiscoveryStart = Date.now();
      const files = this.getFilesToScan();
      const fileDiscoveryMs = Date.now() - fileDiscoveryStart;
      
      let skippedCount = 0;
      let contentReadingMs = 0;
      let signatureComputingMs = 0;
      
      onProgress?.({
      phase: 'reading',
      current: 0,
      total: files.length,
        timing: {
          phaseStartTime: Date.now(),
          totalElapsed: Date.now() - startTime,
        },
      });
      
      console.log(`📁 File Discovery: ${fileDiscoveryMs}ms for ${files.length} files`);
      
      const corpusScanStart = Date.now();
      const shingleFilter = new ShingleFilter(this.settings.shingleFilterThreshold);
      const contentCache = new Map<string, string>();
      
      for (const file of files) {
        if (this.abortController.signal.aborted) {
          return this.buildResult([], 0, 0, startTime, true);
        }
        const rawContent = await this.app.vault.cachedRead(file);
        const content = this.extractor.extract(rawContent);
        contentCache.set(file.path, content);
        const shingles = this.minHasher.getShingles(content);
        shingleFilter.addDocument(shingles);
      }
      
      const corpusScanMs = Date.now() - corpusScanStart;
      const filterStats = shingleFilter.getStats();
      console.log(`🔍 Corpus scan: ${corpusScanMs}ms - ${filterStats.totalShingles} unique shingles, ${filterStats.filteredShingles} filtered (>${this.settings.shingleFilterThreshold * 100}% frequency)`);
      
      const signatures = new Map<string, { contentHash: string; minhash: number[]; }>;
      
      for (let i = 0; i < files.length; i++) {
        if (this.abortController.signal.aborted) {
          return this.buildResult([], signatures.size, skippedCount, startTime, true);
        }
        
        const file = files[i]!;
        
        const phaseStart = Date.now();
        onProgress?.({
          phase: 'hashing',
          current: i + 1,
          total: files.length,
          currentFile: file.path,
          timing: {
            phaseStartTime: phaseStart,
            totalElapsed: Date.now() - startTime,
            estimatedRemaining: this.estimateRemainingTime(i + 1, files.length, Date.now() - startTime),
          },
        });
        
        try {
          const fileProcessStart = Date.now();
          const signature = await this.computeSignatureWithFilter(file, contentCache, shingleFilter);
          const fileProcessTime = Date.now() - fileProcessStart;
          
          if (signature) {
            signatures.set(file.path, signature);
            signatureComputingMs += fileProcessTime;
          } else {
            skippedCount++;
          }
          
          // Log slow files for analysis
          if (fileProcessTime > 100) {
            console.log(`⚠️ Slow file processing: ${file.path} took ${fileProcessTime}ms`);
          }
        } catch (error) {
          console.error(`Error processing ${file.path}:`, error);
          skippedCount++;
        }
      }
      

      
      const comparingStart = Date.now();
      onProgress?.({
        phase: 'comparing',
        current: 0,
        total: signatures.size,
        timing: {
          phaseStartTime: comparingStart,
          totalElapsed: Date.now() - startTime,
        },
      });
      
      console.log(`📊 Starting comparison phase: ${signatures.size} files to compare`);
      
      const duplicates = await this.comparator.findDuplicates(
        signatures,
        (path: string) => this.app.vault.getAbstractFileByPath(path) as TFile | null,
        this.abortController.signal,
        onProgress
      );
      
      const duplicateComparingMs = Date.now() - comparingStart;
      console.log(`⚙️ Comparison phase completed: ${duplicateComparingMs}ms for ${duplicates.length} duplicate pairs`);
      
      onProgress?.({
        phase: 'complete',
        current: signatures.size,
        total: signatures.size,
      });
      
      const totalComparisons = (signatures.size * (signatures.size - 1)) / 2;
      const averageFileProcessingMs = signatureComputingMs / Math.max(1, signatures.size);
      const averageComparisonMs = duplicateComparingMs / Math.max(1, totalComparisons);
      
      const timing = {
        fileDiscoveryMs,
        contentReadingMs,
        signatureComputingMs,
        duplicateComparingMs,
        averageFileProcessingMs,
        averageComparisonMs,
        totalComparisons,
      };
      
      console.log(`📊 Performance Summary:`);
      console.log(`  File Discovery: ${fileDiscoveryMs}ms`);
      console.log(`  Signature Computing: ${signatureComputingMs}ms (avg: ${averageFileProcessingMs.toFixed(2)}ms/file)`);
      console.log(`  Duplicate Comparing: ${duplicateComparingMs}ms (avg: ${averageComparisonMs.toFixed(4)}ms/comparison)`);
      console.log(`  Total Comparisons: ${totalComparisons.toLocaleString()}`);
      console.log(`  Files Processed: ${signatures.size}, Skipped: ${skippedCount}`);
      
      return this.buildResult(duplicates, signatures.size, skippedCount, startTime, false, timing);
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  isRunning(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  updateSettings(settings: DuplicateFinderSettings): void {
    this.settings = settings;
    this.comparator = new Comparator(settings.similarityThreshold);
  }

  private getFilesToScan(): TFile[] {
    const allFiles = this.app.vault.getMarkdownFiles();
    return allFiles.filter(file => this.shouldIncludeFile(file));
  }

  private shouldIncludeFile(file: TFile): boolean {
    const path = file.path;
    
    for (const folder of this.settings.excludeFolders) {
      const normalizedFolder = folder.endsWith('/') ? folder : folder + '/';
      if (path.startsWith(normalizedFolder) || path === folder) {
        return false;
      }
    }
    
    for (const pattern of this.settings.excludePatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(path)) {
          return false;
        }
      } catch {
        console.warn(`Invalid exclude pattern: ${pattern}`);
      }
    }
    
    return true;
  }

  private async computeSignatureWithFilter(
    file: TFile,
    contentCache: Map<string, string>,
    shingleFilter: ShingleFilter
  ): Promise<{ contentHash: string; minhash: number[]; } | null> {
    const content = contentCache.get(file.path);
    if (!content) {
      return null;
    }
    
    const lineCount = this.extractor.countLines(content);
    if (lineCount < this.settings.minContentLines) {
      return null;
    }
    
    const contentHash = await this.exactHasher.hash(content);
    const shingles = this.minHasher.getShingles(content);
    const filteredShingles = shingleFilter.filter(shingles);
    const minhash = this.minHasher.compute(content, filteredShingles);
    
    return {
      contentHash,
      minhash,
    };
  }

  private estimateRemainingTime(current: number, total: number, elapsed: number): number {
    if (current === 0) return 0;
    const rate = elapsed / current;
    return Math.round(rate * (total - current));
  }

  private buildResult(
    duplicates: any[],
    scannedCount: number,
    skippedCount: number,
    startTime: number,
    cancelled: boolean,
    timing?: any
  ): ScanResult {
    return {
      duplicates: cancelled ? [] : duplicates,
      scannedCount,
      skippedCount,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      timing,
    };
  }
}