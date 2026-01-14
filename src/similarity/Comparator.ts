import { TFile } from 'obsidian';
import { 
  NoteSignature, 
  DuplicatePair, 
  PairMetadata,
  ScanProgress,
  ScanProgressCallback 
} from '../types';
import { MinHasher } from './MinHasher';

export class Comparator {
  private threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
  }

  async findDuplicates(
    signatures: Map<string, NoteSignature>,
    getFileByPath: (path: string) => TFile | null,
    abortSignal: AbortSignal,
    onProgress?: ScanProgressCallback
  ): Promise<DuplicatePair[]> {
    const duplicates: DuplicatePair[] = [];
    const entries = Array.from(signatures.entries());
    
    const byHash = new Map<string, string[]>();
    for (const [path, sig] of entries) {
      const paths = byHash.get(sig.contentHash) ?? [];
      paths.push(path);
      byHash.set(sig.contentHash, paths);
    }
    
    const exactPairKeys = new Set<string>();
    
    for (const paths of byHash.values()) {
      if (paths.length > 1) {
        for (let i = 0; i < paths.length; i++) {
          for (let j = i + 1; j < paths.length; j++) {
            const pair = this.createPair(
              paths[i]!,
              paths[j]!,
              1.0,
              'exact',
              signatures,
              getFileByPath
            );
            
            if (pair) {
              duplicates.push(pair);
              exactPairKeys.add(this.pairKey(paths[i]!, paths[j]!));
            }
          }
        }
      }
    }
    
    const minHasher = new MinHasher();
    let comparisons = 0;
    const totalComparisons = (entries.length * (entries.length - 1)) / 2;
    
    for (let i = 0; i < entries.length; i++) {
      if (abortSignal.aborted) {
        break;
      }
      
      const [pathA, sigA] = entries[i]!;
      
      for (let j = i + 1; j < entries.length; j++) {
        const [pathB, sigB] = entries[j]!;
        comparisons++;
        
        const key = this.pairKey(pathA, pathB);
        if (exactPairKeys.has(key)) {
          continue;
        }
        
        const similarity = minHasher.estimateSimilarity(
          sigA.minhash,
          sigB.minhash
        );
        
        if (similarity >= this.threshold) {
          const pair = this.createPair(
            pathA,
            pathB,
            similarity,
            'minhash',
            signatures,
            getFileByPath
          );
          
          if (pair) {
            duplicates.push(pair);
          }
        }
      }
      
      if (i % 50 === 0 && onProgress) {
        onProgress({
          phase: 'comparing',
          current: comparisons,
          total: totalComparisons,
        });
      }
    }
    
    return duplicates;
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  private createPair(
    pathA: string,
    pathB: string,
    similarity: number,
    method: 'exact' | 'minhash',
    signatures: Map<string, NoteSignature>,
    getFileByPath: (path: string) => TFile | null
  ): DuplicatePair | null {
    const fileA = getFileByPath(pathA);
    const fileB = getFileByPath(pathB);
    
    if (!fileA || !fileB) {
      return null;
    }
    
    const metadata = this.buildMetadata(fileA, fileB);
    
    return {
      id: this.pairKey(pathA, pathB),
      fileA,
      fileB,
      similarity,
      method,
      metadata,
    };
  }

  private buildMetadata(fileA: TFile, fileB: TFile): PairMetadata {
    return {
      fileACreated: fileA.stat.ctime,
      fileBCreated: fileB.stat.ctime,
      fileAModified: fileA.stat.mtime,
      fileBModified: fileB.stat.mtime,
      fileALines: 0,
      fileBLines: 0,
      fileASize: fileA.stat.size,
      fileBSize: fileB.stat.size,
    };
  }

  private pairKey(pathA: string, pathB: string): string {
    return pathA < pathB ? `${pathA}::${pathB}` : `${pathB}::${pathA}`;
  }
}