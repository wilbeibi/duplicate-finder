import { TFile } from 'obsidian';
import type {
  DuplicatePair,
  PairMetadata,
  ScanProgressCallback
} from '../types';
import { MinHasher } from './MinHasher';

export class Comparator {
  private threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
  }

  async findDuplicates(
    signatures: Map<string, { contentHash: string; minhash: number[]; }>,
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
    const comparisonStartTime = Date.now();
    let lastYield = Date.now();
    
    for (let i = 0; i < entries.length; i++) {
      // Yield periodically so the progress modal repaints and Cancel is handled.
      if (Date.now() - lastYield > 50) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        lastYield = Date.now();
      }
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
              getFileByPath
            );

          
          if (pair) {
            duplicates.push(pair);
          }
        }
      }
      
      if (i % 50 === 0 && onProgress) {
        const elapsed = Date.now() - comparisonStartTime;
        const estimatedRemaining = comparisons > 0 ? Math.round((elapsed / comparisons) * (totalComparisons - comparisons)) : 0;
        
        onProgress({
          phase: 'comparing',
          current: comparisons,
          total: totalComparisons,
          timing: {
            phaseStartTime: comparisonStartTime,
            totalElapsed: elapsed,
            estimatedRemaining,
          },
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