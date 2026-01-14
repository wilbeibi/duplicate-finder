import { App, TFile } from 'obsidian';
import { 
  DuplicateFinderSettings, 
  ScanResult, 
  ScanProgressCallback,
  NoteSignature,
  ScanProgress
} from '../types';
import { ContentExtractor } from './ContentExtractor';
import { ExactHasher } from '../similarity/ExactHasher';
import { MinHasher } from '../similarity/MinHasher';
import { Comparator } from '../similarity/Comparator';
import { CacheService } from './CacheService';

export class ScanService {
  private app: App;
  private settings: DuplicateFinderSettings;
  
  private extractor: ContentExtractor;
  private exactHasher: ExactHasher;
  private minHasher: MinHasher;
  private comparator: Comparator;
  private cacheService: CacheService;
  
  private abortController: AbortController | null = null;

  constructor(
    app: App,
    settings: DuplicateFinderSettings
  ) {
    this.app = app;
    this.settings = settings;
    
    this.extractor = new ContentExtractor();
    this.exactHasher = new ExactHasher();
    this.minHasher = new MinHasher(
      settings.shingleSize,
      settings.numHashFunctions
    );
    this.comparator = new Comparator(settings.similarityThreshold);
    this.cacheService = new CacheService();
  }

  async scan(onProgress?: ScanProgressCallback): Promise<ScanResult> {
    this.abortController = new AbortController();
    const startTime = Date.now();
    
    const files = this.getFilesToScan();
    let skippedCount = 0;
    
    onProgress?.({
      phase: 'reading',
      current: 0,
      total: files.length,
    });
    
    const signatures = new Map<string, NoteSignature>();
    const newSignatures: NoteSignature[] = [];
    
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
        let signature: NoteSignature | null = null;
        
        if (this.settings.cacheEnabled) {
          signature = await this.cacheService.getIfFresh(file.path, file.stat.mtime);
        }
        
        if (!signature) {
          signature = await this.computeSignature(file);
          if (signature && this.settings.cacheEnabled) {
            newSignatures.push(signature);
          }
        }
        
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
    
    if (this.settings.cacheEnabled && newSignatures.length > 0) {
      await this.cacheService.setMany(newSignatures).catch(err => {
        console.warn('Failed to cache signatures:', err);
      });
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
  }

  cancel(): void {
    this.abortController?.abort();
  }

  isRunning(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  updateSettings(settings: DuplicateFinderSettings): void {
    this.settings = settings;
    
    this.minHasher = new MinHasher(
      settings.shingleSize,
      settings.numHashFunctions
    );
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

  private async computeSignature(file: TFile): Promise<NoteSignature | null> {
    const rawContent = await this.app.vault.cachedRead(file);
    const content = this.extractor.extract(rawContent);
    
    if (content.length < this.settings.minContentLength) {
      return null;
    }
    
    const contentHash = await this.exactHasher.hash(content);
    const minhash = this.minHasher.compute(content);
    
    const signature: NoteSignature = {
      path: file.path,
      mtime: file.stat.mtime,
      contentHash,
      minhash,
    };
    
    return signature;
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