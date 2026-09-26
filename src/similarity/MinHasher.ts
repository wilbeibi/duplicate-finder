import { DEFAULT_SHINGLE_SIZE, DEFAULT_NUM_HASHES, DEFAULT_MINHASH_SEED } from './constants';

export class MinHasher {
  private readonly shingleSize: number;
  private readonly numHashes: number;
  private readonly hashCoefficients: { a: number; b: number }[];

  constructor(
    shingleSize: number = DEFAULT_SHINGLE_SIZE,
    numHashes: number = DEFAULT_NUM_HASHES,
    seed: number = DEFAULT_MINHASH_SEED
  ) {
    this.shingleSize = shingleSize;
    this.numHashes = numHashes;
    
    // Fixed seed keeps signatures reproducible and comparable across instances.
    const nextUint32 = this.mulberry32(seed);
    this.hashCoefficients = [];
    for (let i = 0; i < numHashes; i++) {
      this.hashCoefficients.push({
        a: nextUint32(),
        b: nextUint32(),
      });
    }
  }

  getShingles(content: string): Set<string> {
    return this.createShingles(content);
  }

  compute(content: string, filteredShingles?: Set<string>): number[] {
    const shingles = filteredShingles ?? this.createShingles(content);
    
    if (shingles.size === 0) {
      return new Array<number>(this.numHashes).fill(0xFFFFFFFF);
    }
    
    const shingleHashes = Array.from(shingles).map(s => this.fnv1aHash(s));
    
    const signature: number[] = [];
    
    for (let i = 0; i < this.numHashes; i++) {
      const { a, b } = this.hashCoefficients[i]!;
      let minHash = 0xFFFFFFFF;
      
      for (const h of shingleHashes) {
        const hashValue = this.linearHash(h, a, b);
        if (hashValue < minHash) {
          minHash = hashValue;
        }
      }
      
      signature.push(minHash);
    }
    
    return signature;
  }

  estimateSimilarity(sigA: number[], sigB: number[]): number {
    if (sigA.length !== sigB.length) {
      throw new Error(`Signature length mismatch: ${sigA.length} vs ${sigB.length}`);
    }
    
    let matches = 0;
    for (let i = 0; i < sigA.length; i++) {
      if (sigA[i] === sigB[i]) {
        matches++;
      }
    }
    
    return matches / sigA.length;
  }

  getNumHashes(): number {
    return this.numHashes;
  }

  private createShingles(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    const shingles = new Set<string>();
    
    for (let i = 0; i <= words.length - this.shingleSize; i++) {
      const shingle = words.slice(i, i + this.shingleSize).join(' ');
      shingles.add(shingle);
    }
    
    if (shingles.size === 0 && words.length > 0) {
      shingles.add(words.join(' '));
    }
    
    return shingles;
  }

  private fnv1aHash(str: string): number {
    let hash = 0x811c9dc5;
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    
    return hash >>> 0;
  }

  private linearHash(x: number, a: number, b: number): number {
    const result = (BigInt(a) * BigInt(x) + BigInt(b)) % BigInt(0x100000000);
    return Number(result);
  }

  private mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
}