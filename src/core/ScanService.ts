import { App, TFile } from 'obsidian';
import type {
  DuplicateFinderSettings,
  DuplicatePair,
  ScanResult,
  ScanProgressCallback
} from '../types';
import { ContentExtractor } from './ContentExtractor';
import { ExactHasher } from '../similarity/ExactHasher';
import { MinHasher } from '../similarity/MinHasher';
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
      const readingStartTime = Date.now();
      
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
          phaseStartTime: readingStartTime,
          totalElapsed: 0,
        },
      });
      
      const contentCache = new Map<string, string>();
      
      for (let i = 0; i < files.length; i++) {
        if (this.abortController.signal.aborted) {
          return this.buildResult([], 0, 0, startTime, true);
        }

        const file = files[i]!;

        // Progress updates for large vaults; keep UI responsive without spamming.
        if (i === 0 || i % 20 === 0 || i === files.length - 1) {
          const elapsed = Date.now() - startTime;
          onProgress?.({
            phase: 'reading',
            current: i,
            total: files.length,
            currentFile: file.path,
            timing: {
              phaseStartTime: readingStartTime,
              totalElapsed: elapsed,
              estimatedRemaining: this.estimateRemainingTime(i, files.length, elapsed),
            },
          });
        }

        try {
          const rawContent = await this.app.vault.cachedRead(file);
          const content = this.extractor.extract(rawContent);
          contentCache.set(file.path, content);
        } catch (error) {
          console.error(`Error reading ${file.path}:`, error);
          skippedCount++;
        }
      }
      contentReadingMs = Date.now() - readingStartTime;
      
      const signatures = new Map<string, { contentHash: string; minhash: number[]; }>;
      
      for (let i = 0; i < files.length; i++) {
        // Hashing is synchronous; yield so the progress modal repaints and Cancel is handled.
        if (i % 20 === 0) {
          await new Promise(resolve => window.setTimeout(resolve, 0));
        }
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
          const signature = await this.computeSignature(file, contentCache);
          const fileProcessTime = Date.now() - fileProcessStart;
          
          if (signature) {
            signatures.set(file.path, signature);
            signatureComputingMs += fileProcessTime;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`Error processing ${file.path}:`, error);
          skippedCount++;
        }
      }
      

      
      const comparingStart = Date.now();
      const compareTotal = (signatures.size * (signatures.size - 1)) / 2;
      onProgress?.({
        phase: 'comparing',
        current: 0,
        total: compareTotal,
        timing: {
          phaseStartTime: comparingStart,
          totalElapsed: Date.now() - startTime,
        },
      });
      
      const duplicates = await this.comparator.findDuplicates(
        signatures,
        (path: string) => this.app.vault.getAbstractFileByPath(path) as TFile | null,
        this.abortController.signal,
        onProgress
      );
      if (this.abortController.signal.aborted) {
        return this.buildResult([], signatures.size, skippedCount, startTime, true);
      }
      
      const duplicateComparingMs = Date.now() - comparingStart;
      
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
      
      return this.buildResult(duplicates, signatures.size, skippedCount, startTime, false, timing);
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  // A cancelled scan still counts as running until it has unwound, so a new
  // scan cannot start and share the abort controller with it.
  isRunning(): boolean {
    return this.abortController !== null;
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

  private async computeSignature(
    file: TFile,
    contentCache: Map<string, string>
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
    const minhash = this.minHasher.compute(content);
    
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
    duplicates: DuplicatePair[],
    scannedCount: number,
    skippedCount: number,
    startTime: number,
    cancelled: boolean,
    timing?: ScanResult['timing']
  ): ScanResult {
    return {
      duplicates: cancelled ? [] : duplicates,
      scannedCount,
      skippedCount,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
      cancelled,
      timing,
    };
  }
}
