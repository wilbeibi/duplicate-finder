import { DuplicatePair, ScanResult } from '../types';

export type SortField = 'similarity' | 'created' | 'modified' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
  minSimilarity?: number;
  maxSimilarity?: number;
  folderFilter?: string;
  methodFilter?: 'exact' | 'minhash' | 'all';
}

export class ResultStore {
  private result: ScanResult | null = null;

  setResult(result: ScanResult): void {
    this.result = result;
  }

  getResult(): ScanResult | null {
    return this.result;
  }

  hasResults(): boolean {
    return this.result !== null && this.result.duplicates.length > 0;
  }

  getCount(): number {
    return this.result?.duplicates.length ?? 0;
  }

  getDuplicates(
    sortField: SortField = 'similarity',
    sortOrder: SortOrder = 'desc',
    filters?: FilterOptions
  ): DuplicatePair[] {
    if (!this.result) return [];
    
    let pairs = [...this.result.duplicates];
    
    if (filters) {
      pairs = this.applyFilters(pairs, filters);
    }
    
    pairs = this.applySorting(pairs, sortField, sortOrder);
    
    return pairs;
  }

  removePair(pairId: string): void {
    if (!this.result) return;
    
    this.result.duplicates = this.result.duplicates.filter(p => p.id !== pairId);
  }

  removeByPath(path: string): void {
    if (!this.result) return;
    
    this.result.duplicates = this.result.duplicates.filter(
      p => p.fileA.path !== path && p.fileB.path !== path
    );
  }

  clear(): void {
    this.result = null;
  }

  private applyFilters(pairs: DuplicatePair[], filters: FilterOptions): DuplicatePair[] {
    return pairs.filter(pair => {
      if (filters.minSimilarity !== undefined && pair.similarity < filters.minSimilarity) {
        return false;
      }
      if (filters.maxSimilarity !== undefined && pair.similarity > filters.maxSimilarity) {
        return false;
      }
      
      if (filters.methodFilter && filters.methodFilter !== 'all') {
        if (pair.method !== filters.methodFilter) {
          return false;
        }
      }
      
      if (filters.folderFilter) {
        const inFolder = 
          pair.fileA.path.startsWith(filters.folderFilter + '/') ||
          pair.fileB.path.startsWith(filters.folderFilter + '/');
        if (!inFolder) {
          return false;
        }
      }
      
      return true;
    });
  }

  private applySorting(
    pairs: DuplicatePair[],
    field: SortField,
    order: SortOrder
  ): DuplicatePair[] {
    const multiplier = order === 'desc' ? -1 : 1;
    
    return pairs.sort((a, b) => {
      let comparison = 0;
      
      switch (field) {
        case 'similarity':
          comparison = a.similarity - b.similarity;
          break;
          
        case 'created': {
          const aOldest = Math.min(a.metadata.fileACreated, a.metadata.fileBCreated);
          const bOldest = Math.min(b.metadata.fileACreated, b.metadata.fileBCreated);
          comparison = aOldest - bOldest;
          break;
        }
          
        case 'modified': {
          const aNewest = Math.max(a.metadata.fileAModified, a.metadata.fileBModified);
          const bNewest = Math.max(b.metadata.fileAModified, b.metadata.fileBModified);
          comparison = aNewest - bNewest;
          break;
        }
          
        case 'size': {
          const aSize = a.metadata.fileASize + a.metadata.fileBSize;
          const bSize = b.metadata.fileASize + b.metadata.fileBSize;
          comparison = aSize - bSize;
          break;
        }
      }
      
      return comparison * multiplier;
    });
  }
}