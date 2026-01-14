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
      
      const files = this.getFilesToScan();
      let skippedCount = 0;
      
      onProgress?.({
        phase: 'reading',
        current: 0,
        total: files.length,
      });
      
      const signatures = new Map<string, { contentHash: string; minhash: number[]; }>;
      
      for (let i = 0; i < files.length; i++) {
        if (this.abortController.signal.aborted) {
          return this.buildResult([], signatures.size, skippedCount, startTime, true);
        }
        
        const file = files[i]!;
        
        onProgress?.({
          phase: 'hashing',
          current: i + 1,
          total: files.length,
          currentFile: file.path,
        });
        
        try {
          const signature = await this.computeSignature(file);
          
          if (signature) {
            signatures.set(file.path, signature);
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`Error processing ${file.path}:`, error);
          skippedCount++;
        }
      }
      

      
      onProgress?.({
        phase: 'comparing',
        current: 0,
        total: signatures.size,
      });
      
      const duplicates = await this.comparator.findDuplicates(
        signatures,
        (path: string) => this.app.vault.getAbstractFileByPath(path) as TFile | null,
        this.abortController.signal,
        onProgress
      );
      
      onProgress?.({
        phase: 'complete',
        current: signatures.size,
        total: signatures.size,
      });
      
      return this.buildResult(duplicates, signatures.size, skippedCount, startTime, false);
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

  private async computeSignature(file: TFile): Promise<{ contentHash: string; minhash: number[]; } | null> {
    const rawContent = await this.app.vault.cachedRead(file);
    const content = this.extractor.extract(rawContent);
    
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

  private buildResult(
    duplicates: any[],
    scannedCount: number,
    skippedCount: number,
    startTime: number,
    cancelled: boolean
  ): ScanResult {
    return {
      duplicates: cancelled ? [] : duplicates,
      scannedCount,
      skippedCount,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}