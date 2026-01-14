import { describe, it, expect, beforeEach } from 'vitest';
import { MinHasher } from '../src/similarity/MinHasher';

describe('MinHasher', () => {
  let hasher: MinHasher;
  
  beforeEach(() => {
    hasher = new MinHasher(3, 128);
  });
  
  describe('compute', () => {
    it('returns consistent signature for same content', () => {
      const content = 'the quick brown fox jumps over the lazy dog';
      const sig1 = hasher.compute(content);
      const sig2 = hasher.compute(content);
      
      expect(sig1).toEqual(sig2);
    });
    
    it('returns signature of correct length', () => {
      const sig = hasher.compute('test content');
      expect(sig.length).toBe(128);
    });
    
    it('handles empty content', () => {
      const sig = hasher.compute('');
      expect(sig.length).toBe(128);
      expect(sig.every(v => v === 0xFFFFFFFF)).toBe(true);
    });
    
    it('handles content shorter than shingle size', () => {
      const sig = hasher.compute('hi');
      expect(sig.length).toBe(128);
    });

    it('handles single word', () => {
      const sig = hasher.compute('word');
      expect(sig.length).toBe(128);
      expect(sig.some(v => v !== 0xFFFFFFFF)).toBe(true);
    });
  });
  
  describe('estimateSimilarity', () => {
    it('returns 1.0 for identical content', () => {
      const content = 'the quick brown fox';
      const sig = hasher.compute(content);
      
      expect(hasher.estimateSimilarity(sig, sig)).toBe(1.0);
    });
    
    it('returns high similarity for near-identical content', () => {
      const sigA = hasher.compute('the quick brown fox jumps over the lazy dog');
      const sigB = hasher.compute('the quick brown fox jumps over the lazy cat');
      
      const similarity = hasher.estimateSimilarity(sigA, sigB);
      expect(similarity).toBeGreaterThan(0.5);
    });
    
    it('returns low similarity for different content', () => {
      const sigA = hasher.compute('the quick brown fox');
      const sigB = hasher.compute('completely different text about something else entirely');
      
      const similarity = hasher.estimateSimilarity(sigA, sigB);
      expect(similarity).toBeLessThan(0.5);
    });
    
    it('throws on mismatched signature lengths', () => {
      const hasher64 = new MinHasher(3, 64);
      const sigA = hasher.compute('test');
      const sigB = hasher64.compute('test');
      
      expect(() => hasher.estimateSimilarity(sigA, sigB)).toThrow();
    });

    it('returns 0.0 for completely different empty signatures', () => {
      const sigA = new Array(128).fill(1);
      const sigB = new Array(128).fill(2);
      
      expect(hasher.estimateSimilarity(sigA, sigB)).toBe(0.0);
    });
  });

  describe('getNumHashes', () => {
    it('returns correct number of hash functions', () => {
      expect(hasher.getNumHashes()).toBe(128);
      
      const hasher64 = new MinHasher(3, 64);
      expect(hasher64.getNumHashes()).toBe(64);
    });
  });

  describe('edge cases', () => {
    it('handles punctuation correctly', () => {
      const sigA = hasher.compute('Hello, world!');
      const sigB = hasher.compute('Hello world');
      
      const similarity = hasher.estimateSimilarity(sigA, sigB);
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('handles case differences', () => {
      const sigA = hasher.compute('THE QUICK BROWN FOX');
      const sigB = hasher.compute('the quick brown fox');
      
      const similarity = hasher.estimateSimilarity(sigA, sigB);
      expect(similarity).toBe(1.0);
    });

    it('different shingle sizes produce different results', () => {
      const hasher2 = new MinHasher(2, 128);
      const hasher4 = new MinHasher(4, 128);
      
      const content = 'the quick brown fox jumps over the lazy dog';
      const sig2 = hasher2.compute(content);
      const sig4 = hasher4.compute(content);
      
      expect(sig2).not.toEqual(sig4);
    });
  });
});