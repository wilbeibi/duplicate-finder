import { describe, it, expect } from 'vitest';
import { ExactHasher } from '../src/similarity/ExactHasher';

describe('ExactHasher', () => {
  const hasher = new ExactHasher();
  
  describe('hash', () => {
    it('returns consistent hash for same content', async () => {
      const content = 'test content';
      const hash1 = await hasher.hash(content);
      const hash2 = await hasher.hash(content);
      
      expect(hash1).toBe(hash2);
    });
    
    it('returns different hashes for different content', async () => {
      const hash1 = await hasher.hash('content 1');
      const hash2 = await hasher.hash('content 2');
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('returns valid SHA-256 hex string', async () => {
      const hash = await hasher.hash('test');
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash.length).toBe(64);
    });
    
    it('handles empty content', async () => {
      const hash = await hasher.hash('');
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash.length).toBe(64);
    });
    
    it('produces known hash for known input', async () => {
      const hash = await hasher.hash('hello world');
      
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });
  });
});