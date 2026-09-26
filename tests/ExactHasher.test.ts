import { describe, it, expect } from 'vitest';
import { ExactHasher } from '../src/similarity/ExactHasher';

describe('ExactHasher', () => {
  const hasher = new ExactHasher();

  it('gives the same key for the same content', async () => {
    expect(await hasher.hash('test content')).toBe(await hasher.hash('test content'));
  });

  it('gives different keys for different content', async () => {
    expect(await hasher.hash('content 1')).not.toBe(await hasher.hash('content 2'));
  });

  it('matches the published cyrb53 reference value', async () => {
    // cyrb53('a') === 7929297801672961 per the algorithm author's reference.
    const hash = await hasher.hash('a');

    expect(parseInt(hash, 16)).toBe(7929297801672961);
  });
});
