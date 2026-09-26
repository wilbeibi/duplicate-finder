// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { ScanService } from '../src/core/ScanService';
import { DEFAULT_SETTINGS, type DuplicateFinderSettings, type DuplicatePair } from '../src/types';

function fakeApp(notes: Record<string, string>): App {
  const files = Object.entries(notes).map(([path, text]) => ({
    path,
    stat: { ctime: 0, mtime: 0, size: text.length },
  }));
  const byPath = new Map(files.map(f => [f.path, f]));
  return {
    vault: {
      getMarkdownFiles: () => files,
      cachedRead: async (file: { path: string }) => notes[file.path],
      getAbstractFileByPath: (path: string) => byPath.get(path) ?? null,
    },
  } as unknown as App;
}

// 200 words, 10 per line.
function note(prefix: string, replace: Record<number, string> = {}): string {
  const words = Array.from({ length: 200 }, (_, i) => replace[i] ?? `${prefix}${i}`);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 10) {
    lines.push(words.slice(i, i + 10).join(' '));
  }
  return lines.join('\n');
}

function settings(overrides: Partial<DuplicateFinderSettings> = {}): DuplicateFinderSettings {
  return { ...DEFAULT_SETTINGS, minContentLines: 3, similarityThreshold: 0.7, ...overrides };
}

function pairPaths(pairs: DuplicatePair[]): string[][] {
  return pairs.map(p => [p.fileA.path, p.fileB.path].sort());
}

describe('scanning a vault', () => {
  it('reports notes that differ only in frontmatter and blank lines as one exact duplicate', async () => {
    const body = note('alpha');
    const service = new ScanService(fakeApp({
      'a.md': body,
      'b.md': `---\ntags: [copy]\n---\n\n\n${body}\n\n\n`,
      'c.md': note('other'),
    }), settings());

    const result = await service.scan();

    expect(pairPaths(result.duplicates)).toEqual([['a.md', 'b.md']]);
    expect(result.duplicates[0]).toMatchObject({ method: 'exact', similarity: 1 });
  });

  it('reports a lightly edited copy as a fuzzy duplicate', async () => {
    const service = new ScanService(fakeApp({
      'a.md': note('alpha'),
      'b.md': note('alpha', { 100: 'edited' }),
      'c.md': note('other'),
    }), settings());

    const result = await service.scan();

    expect(pairPaths(result.duplicates)).toEqual([['a.md', 'b.md']]);
    expect(result.duplicates[0]!.method).toBe('minhash');
    expect(result.duplicates[0]!.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('skips excluded folders but not folders that only share a name prefix', async () => {
    const body = note('alpha');
    const service = new ScanService(fakeApp({
      'arch/a.md': body,
      'archive/b.md': body,
      'notes/c.md': body,
    }), settings({ excludeFolders: ['arch'] }));

    const result = await service.scan();

    expect(pairPaths(result.duplicates)).toEqual([['archive/b.md', 'notes/c.md']]);
  });

  it('skips notes matching an exclude pattern', async () => {
    const body = note('alpha');
    const service = new ScanService(fakeApp({
      'daily/2026-01-01.md': body,
      'notes/a.md': body,
      'notes/b.md': body,
    }), settings({ excludePatterns: ['^daily/'] }));

    const result = await service.scan();

    expect(pairPaths(result.duplicates)).toEqual([['notes/a.md', 'notes/b.md']]);
  });

  it('skips notes below the minimum line count, not counting frontmatter', async () => {
    const frontmatter = '---\n' + Array.from({ length: 10 }, (_, i) => `key${i}: v`).join('\n') + '\n---\n';
    const shortNote = frontmatter + 'line one\nline two';
    const service = new ScanService(fakeApp({
      'a.md': shortNote,
      'b.md': shortNote,
    }), settings({ minContentLines: 5 }));

    const result = await service.scan();

    expect(result.duplicates).toEqual([]);
    expect(result.skippedCount).toBe(2);
  });

  it('stops without reporting duplicates when cancelled', async () => {
    const body = note('alpha');
    const service = new ScanService(fakeApp({ 'a.md': body, 'b.md': body }), settings());

    const result = await service.scan(() => service.cancel());

    expect(result.duplicates).toEqual([]);
    expect(service.isRunning()).toBe(false);
  });
});
