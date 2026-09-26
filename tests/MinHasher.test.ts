import { describe, it, expect } from 'vitest';
import { MinHasher } from '../src/similarity/MinHasher';

function tokens(from: number, to: number): string {
  return Array.from({ length: to - from }, (_, i) => `w${from + i}`).join(' ');
}

describe('MinHasher', () => {
  it('gives identical signatures from separate instances with the default seed', () => {
    const content = 'the quick brown fox jumps over the lazy dog';

    expect(new MinHasher().compute(content)).toEqual(new MinHasher().compute(content));
  });

  // With shingle size 1, shingles are words, so the true Jaccard similarity of
  // w0..w99 and w{s}..w{s+99} is (100 - s) / (100 + s).
  it.each([
    { shift: 0, jaccard: 1 },
    { shift: 25, jaccard: 0.6 },
    { shift: 50, jaccard: 1 / 3 },
    { shift: 100, jaccard: 0 },
  ])('estimates Jaccard similarity $jaccard within 0.1', ({ shift, jaccard }) => {
    const hasher = new MinHasher(1, 256);
    const sigA = hasher.compute(tokens(0, 100));
    const sigB = hasher.compute(tokens(shift, shift + 100));

    expect(Math.abs(hasher.estimateSimilarity(sigA, sigB) - jaccard)).toBeLessThanOrEqual(0.1);
  });

  it('uses shingle size to make word order matter', () => {
    const forward = 'alpha beta gamma delta epsilon zeta';
    const reversed = 'zeta epsilon delta gamma beta alpha';
    const words = new MinHasher(1, 128);
    const pairs = new MinHasher(2, 128);

    expect(words.estimateSimilarity(words.compute(forward), words.compute(reversed))).toBe(1);
    expect(pairs.estimateSimilarity(pairs.compute(forward), pairs.compute(reversed))).toBeLessThan(0.1);
  });

  it('ignores case and punctuation', () => {
    const hasher = new MinHasher(3, 128);

    const similarity = hasher.estimateSimilarity(
      hasher.compute('THE QUICK, BROWN FOX!'),
      hasher.compute('the quick brown fox')
    );

    expect(similarity).toBe(1);
  });

  it('compares notes shorter than the shingle size as whole texts', () => {
    const hasher = new MinHasher(5, 128);
    const sig = hasher.compute('hello world');

    expect(hasher.estimateSimilarity(sig, hasher.compute('hello world'))).toBe(1);
    expect(hasher.estimateSimilarity(sig, hasher.compute('goodbye moon'))).toBeLessThan(0.1);
  });

  it('rejects signatures of different lengths', () => {
    const sigA = new MinHasher(3, 128).compute('test');
    const sigB = new MinHasher(3, 64).compute('test');

    expect(() => new MinHasher(3, 128).estimateSimilarity(sigA, sigB)).toThrow();
  });
});
