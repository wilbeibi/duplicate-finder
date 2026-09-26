import { describe, it, expect } from 'vitest';
import type { TFile } from 'obsidian';
import { ResultStore } from '../src/core/ResultStore';
import type { DetectionMethod, DuplicatePair } from '../src/types';

function pair(pathA: string, pathB: string, similarity: number, method: DetectionMethod = 'minhash'): DuplicatePair {
  return {
    id: `${pathA}::${pathB}`,
    fileA: { path: pathA } as TFile,
    fileB: { path: pathB } as TFile,
    similarity,
    method,
    metadata: {
      fileACreated: 0, fileBCreated: 0, fileAModified: 0, fileBModified: 0,
      fileALines: 0, fileBLines: 0, fileASize: 0, fileBSize: 0,
    },
  };
}

function storeWith(duplicates: DuplicatePair[]): ResultStore {
  const store = new ResultStore();
  store.setResult({ duplicates, scannedCount: 3, skippedCount: 0, durationMs: 0, timestamp: 0 });
  return store;
}

describe('duplicate results', () => {
  it('drops every pair involving a deleted note', () => {
    const store = storeWith([pair('a.md', 'b.md', 0.9), pair('c.md', 'a.md', 0.8), pair('b.md', 'c.md', 0.95)]);

    store.removeByPath('a.md');

    expect(store.getDuplicates().map(p => p.id)).toEqual(['b.md::c.md']);
  });

  it('lists the most similar pairs first by default', () => {
    const store = storeWith([pair('a.md', 'b.md', 0.8), pair('c.md', 'd.md', 1, 'exact'), pair('e.md', 'f.md', 0.9)]);

    expect(store.getDuplicates().map(p => p.similarity)).toEqual([1, 0.9, 0.8]);
  });

  it('filters to one detection method', () => {
    const store = storeWith([pair('a.md', 'b.md', 0.8), pair('c.md', 'd.md', 1, 'exact')]);

    const exact = store.getDuplicates('similarity', 'desc', { methodFilter: 'exact' });

    expect(exact.map(p => p.id)).toEqual(['c.md::d.md']);
  });
});
