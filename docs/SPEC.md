# Obsidian Duplicate Finder — Technical Specification

> **Version:** 0.1.0  
> **Status:** Draft  
> **Last Updated:** 2025-01-13

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Architecture](#3-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Core Types](#5-core-types)
6. [Algorithm Design](#6-algorithm-design)
7. [Core Services](#7-core-services)
8. [UI Components](#8-ui-components)
9. [Plugin Entry Point](#9-plugin-entry-point)
10. [Settings](#10-settings)
11. [Styling](#11-styling)
12. [Testing Strategy](#12-testing-strategy)
13. [Future Enhancements](#13-future-enhancements)
14. [Development Setup](#14-development-setup)
15. [Contributing Guidelines](#15-contributing-guidelines)

---

## 1. Overview

### 1.1 Problem Statement

Obsidian users accumulate duplicate and near-duplicate notes over time through:
- Copy-pasting content across notes
- Importing from multiple sources
- Creating notes without remembering existing ones
- Syncing issues creating duplicates

There is no robust, built-in solution for detecting and managing these duplicates.

### 1.2 Solution

A plugin that scans the vault for duplicate content using:
1. **Exact matching** via content hashing (SHA-256)
2. **Fuzzy matching** via MinHash similarity estimation

Users can review detected duplicates, compare them side-by-side, and delete unwanted copies.

### 1.3 Target Users

- Users with large vaults (1k-10k+ notes)
- Users who import content from external sources
- Users migrating from other note-taking apps
- Anyone wanting to declutter their vault

---

## 2. Goals & Non-Goals

### 2.1 Goals (v0.1.0)

- [x] Detect exact duplicate notes (identical content)
- [x] Detect near-duplicate notes (>70% similar by default)
- [x] Exclude folders/patterns from scanning
- [x] Show results in a dedicated panel
- [x] Display which file is older/newer
- [x] Allow user to delete one of the duplicates
- [x] Cache signatures for faster rescans
- [x] Command palette integration
- [x] Ribbon icon for quick access

### 2.2 Non-Goals (v0.1.0)

- [ ] Real-time/background scanning (manual "Scan Now" only)
- [ ] Frontmatter similarity detection (content only)
- [ ] Same-title detection (content-based only)
- [ ] File context menu integration
- [ ] Full merge editor (simple delete only)
- [ ] Status bar indicator
- [ ] Semantic/AI-based similarity
- [ ] Attachment/image duplicate detection

### 2.3 Future Considerations

- LSH (Locality Sensitive Hashing) for vaults >10k notes
- Batch operations (delete all older, keep all newer)
- Export results to CSV/JSON
- "Find duplicates of this note" context menu
- Merge strategies (concatenate, keep sections)

---

## 3. Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Plugin Entry                                  │
│                             (main.ts)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  Commands          │  Ribbon Icon       │  Settings Tab                 │
│  - scan-vault      │  - trigger scan    │  - configure thresholds       │
│  - show-results    │                    │  - exclude folders            │
│  - clear-cache     │                    │                               │
└────────┬───────────┴─────────┬──────────┴──────────────┬────────────────┘
         │                     │                         │
         ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Core Services                                  │
├──────────────────┬──────────────────┬───────────────────────────────────┤
│   ScanService    │   CacheService   │   ResultStore                     │
│   - orchestrate  │   - IndexedDB    │   - in-memory results             │
│   - progress     │   - invalidation │   - sorting/filtering             │
└────────┬─────────┴────────┬─────────┴──────────────┬────────────────────┘
         │                  │                        │
         ▼                  ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Similarity Engine                                 │
├──────────────────┬──────────────────┬───────────────────────────────────┤
│  ExactHasher     │  MinHasher       │  Comparator                       │
│  - SHA-256       │  - shingling     │  - pairwise comparison            │
│  - O(1) lookup   │  - 128 hashes    │  - candidate generation           │
└──────────────────┴──────────────────┴───────────────────────────────────┘
```

### 3.2 Data Flow

```
User clicks "Scan Vault"
        │
        ▼
┌───────────────────┐
│   ScanService     │
│   .scan()         │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌───────────────────┐
│  Get files to     │────▶│  Apply exclude    │
│  scan from vault  │     │  folders/patterns │
└────────┬──────────┘     └───────────────────┘
         │
         ▼
┌───────────────────┐     ┌───────────────────┐
│  For each file:   │────▶│  Check cache      │
│  get signature    │     │  (CacheService)   │
└────────┬──────────┘     └────────┬──────────┘
         │                         │
         │  cache miss             │ cache hit
         ▼                         │
┌───────────────────┐              │
│  Extract content  │              │
│  (strip YAML)     │              │
└────────┬──────────┘              │
         │                         │
         ▼                         │
┌───────────────────┐              │
│  Compute hashes:  │              │
│  - SHA-256        │              │
│  - MinHash        │              │
└────────┬──────────┘              │
         │                         │
         ▼                         │
┌───────────────────┐              │
│  Store in cache   │◀─────────────┘
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Comparator:      │
│  find duplicates  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  ResultStore:     │
│  store results    │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  ResultsView:     │
│  render UI        │
└───────────────────┘
```

### 3.3 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Manual scan only | Avoids performance impact; users control when to scan |
| Content-only comparison | Frontmatter varies; content is what matters for duplicates |
| SHA-256 for exact | Fast, collision-resistant, widely understood |
| MinHash for fuzzy | O(n) signature generation, O(1) similarity estimation |
| IndexedDB cache | Persists across sessions; survives plugin reload |
| Trash instead of delete | Safe; user can recover if needed |
| No Web Workers (v0.1) | Simpler; vault operations already async |

---

## 4. Directory Structure

```
obsidian-duplicate-finder/
├── src/
│   ├── main.ts                    # Plugin lifecycle, commands, ribbon
│   ├── types.ts                   # Shared type definitions
│   │
│   ├── core/
│   │   ├── ScanService.ts         # Orchestrates scanning pipeline
│   │   ├── CacheService.ts        # Signature persistence (IndexedDB)
│   │   ├── ResultStore.ts         # Holds scan results, filtering
│   │   └── ContentExtractor.ts    # Strip frontmatter, normalize text
│   │
│   ├── similarity/
│   │   ├── ExactHasher.ts         # SHA-256 content hashing
│   │   ├── MinHasher.ts           # MinHash signature generation
│   │   ├── Comparator.ts          # Pairwise comparison logic
│   │   └── constants.ts           # Default shingle size, hash count
│   │
│   ├── ui/
│   │   ├── ResultsView.ts         # Main ItemView panel
│   │   ├── ProgressModal.ts       # Scan progress indicator
│   │   ├── ConfirmDeleteModal.ts  # Delete confirmation
│   │   └── SettingsTab.ts         # Plugin settings UI
│   │
│   └── utils/
│       ├── diff.ts                # Line diff calculation (future)
│       └── helpers.ts             # Misc utility functions
│
├── tests/
│   ├── MinHasher.test.ts
│   ├── Comparator.test.ts
│   ├── ContentExtractor.test.ts
│   └── fixtures/
│       ├── exact-duplicates/
│       ├── near-duplicates/
│       └── no-duplicates/
│
├── styles.css                     # Plugin styles
├── manifest.json                  # Obsidian plugin manifest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── .gitignore
├── README.md
├── CHANGELOG.md
├── LICENSE
└── SPEC.md                        # This document
```

---

## 5. Core Types

### 5.1 `src/types.ts`

```typescript
import { TFile } from 'obsidian';

// ============================================
// Configuration
// ============================================

export interface DuplicateFinderSettings {
  // Scan scope
  excludeFolders: string[];        // Folders to skip (e.g., "templates")
  excludePatterns: string[];       // Regex patterns (e.g., "^daily/.*")
  minContentLength: number;        // Skip tiny notes (default: 50 chars)
  
  // Similarity tuning
  similarityThreshold: number;     // 0.0 - 1.0 (default: 0.7)
  shingleSize: number;             // Words per shingle (default: 3)
  numHashFunctions: number;        // MinHash size (default: 128)
  
  // Behavior
  cacheEnabled: boolean;           // Persist signatures across sessions
}

export const DEFAULT_SETTINGS: DuplicateFinderSettings = {
  excludeFolders: [],
  excludePatterns: [],
  minContentLength: 50,
  similarityThreshold: 0.7,
  shingleSize: 3,
  numHashFunctions: 128,
  cacheEnabled: true,
};

// ============================================
// Scan Results
// ============================================

export type DetectionMethod = 'exact' | 'minhash';

export interface DuplicatePair {
  id: string;                      // Unique ID for this pair (pathA::pathB)
  fileA: TFile;
  fileB: TFile;
  similarity: number;              // 0.0 - 1.0 (1.0 = exact match)
  method: DetectionMethod;
  metadata: PairMetadata;
}

export interface PairMetadata {
  fileACreated: number;            // Unix timestamp (ms)
  fileBCreated: number;
  fileAModified: number;
  fileBModified: number;
  fileALines: number;
  fileBLines: number;
  fileASize: number;               // Bytes
  fileBSize: number;
}

// ============================================
// Signatures (for caching)
// ============================================

export interface NoteSignature {
  path: string;
  mtime: number;                   // File modification time (for cache invalidation)
  contentHash: string;             // SHA-256 hex string
  minhash: number[];               // MinHash signature (array of 32-bit integers)
}

// ============================================
// Scan Progress
// ============================================

export type ScanPhase = 'reading' | 'hashing' | 'comparing' | 'complete' | 'cancelled';

export interface ScanProgress {
  phase: ScanPhase;
  current: number;
  total: number;
  currentFile?: string;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

// ============================================
// Scan Result Summary
// ============================================

export interface ScanResult {
  duplicates: DuplicatePair[];
  scannedCount: number;
  skippedCount: number;
  durationMs: number;
  timestamp: number;
}
```

---

## 6. Algorithm Design

### 6.1 Why MinHash?

**Problem:** Comparing N notes pairwise requires N×(N-1)/2 comparisons.
- 1,000 notes → 499,500 comparisons
- 10,000 notes → 49,995,000 comparisons

**Solution:** MinHash reduces each document to a fixed-size signature. Comparing signatures is O(1).

**How it works:**

1. **Shingling:** Convert text to overlapping word n-grams
   ```
   "the quick brown fox" (shingle size 2)
   → {"the quick", "quick brown", "brown fox"}
   ```

2. **Hashing:** For each shingle, compute k hash values (k = numHashFunctions)

3. **MinHash Signature:** For each hash function, keep only the minimum value across all shingles

4. **Similarity Estimation:** Jaccard similarity ≈ fraction of matching signature values

**Mathematical basis:**
```
Pr[min(h(A)) = min(h(B))] = |A ∩ B| / |A ∪ B| = Jaccard(A, B)
```

### 6.2 Algorithm Parameters

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `shingleSize` | 3 | 2-5 | Higher = stricter matching, fewer false positives |
| `numHashFunctions` | 128 | 64-256 | Higher = more accurate, but slower |
| `similarityThreshold` | 0.7 | 0.5-1.0 | Higher = only very similar notes flagged |

**Accuracy vs. numHashFunctions:**
- 64 hashes: ±12% error
- 128 hashes: ±9% error
- 256 hashes: ±6% error

### 6.3 `src/similarity/constants.ts`

```typescript
// Default algorithm parameters
export const DEFAULT_SHINGLE_SIZE = 3;
export const DEFAULT_NUM_HASHES = 128;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

// Hash function constants
export const HASH_PRIME = 0x01000193;  // FNV prime
export const HASH_OFFSET = 0x811c9dc5; // FNV offset basis

// Cache constants
export const CACHE_DB_NAME = 'duplicate-finder-cache';
export const CACHE_DB_VERSION = 1;
export const CACHE_STORE_NAME = 'signatures';
```

### 6.4 `src/similarity/ExactHasher.ts`

```typescript
/**
 * SHA-256 content hashing for exact duplicate detection.
 */
export class ExactHasher {
  /**
   * Compute SHA-256 hash of content.
   * Returns hex string.
   */
  async hash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

### 6.5 `src/similarity/MinHasher.ts`

```typescript
import { DEFAULT_SHINGLE_SIZE, DEFAULT_NUM_HASHES } from './constants';

/**
 * MinHash implementation for estimating Jaccard similarity.
 * 
 * Algorithm:
 * 1. Convert text to shingles (overlapping word n-grams)
 * 2. Hash each shingle with k different hash functions
 * 3. For each hash function, keep only the minimum hash value
 * 4. The resulting signature is an array of k minimum values
 * 
 * Similarity estimation:
 * Jaccard(A, B) ≈ (number of matching signature values) / k
 */
export class MinHasher {
  private readonly shingleSize: number;
  private readonly numHashes: number;
  private readonly hashCoefficients: { a: number; b: number }[];

  constructor(
    shingleSize: number = DEFAULT_SHINGLE_SIZE,
    numHashes: number = DEFAULT_NUM_HASHES
  ) {
    this.shingleSize = shingleSize;
    this.numHashes = numHashes;
    
    // Pre-generate random coefficients for hash functions
    // Using linear hash: h(x) = (a * x + b) mod p
    this.hashCoefficients = [];
    for (let i = 0; i < numHashes; i++) {
      this.hashCoefficients.push({
        a: this.randomUint32(),
        b: this.randomUint32(),
      });
    }
  }

  /**
   * Compute MinHash signature for a document.
   * @param content - The text content to hash
   * @returns Array of k minimum hash values
   */
  compute(content: string): number[] {
    const shingles = this.createShingles(content);
    
    if (shingles.size === 0) {
      // Return max values for empty content (won't match anything)
      return new Array(this.numHashes).fill(0xFFFFFFFF);
    }
    
    // Convert shingles to hash values
    const shingleHashes = Array.from(shingles).map(s => this.fnv1aHash(s));
    
    // Compute MinHash signature
    const signature: number[] = [];
    
    for (let i = 0; i < this.numHashes; i++) {
      const { a, b } = this.hashCoefficients[i];
      let minHash = 0xFFFFFFFF;
      
      for (const h of shingleHashes) {
        // Apply linear hash transformation
        const hashValue = this.linearHash(h, a, b);
        if (hashValue < minHash) {
          minHash = hashValue;
        }
      }
      
      signature.push(minHash);
    }
    
    return signature;
  }

  /**
   * Estimate Jaccard similarity between two signatures.
   * @returns Similarity value between 0.0 and 1.0
   */
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

  /**
   * Get the number of hash functions used.
   */
  getNumHashes(): number {
    return this.numHashes;
  }

  // ========================================
  // Private Methods
  // ========================================

  /**
   * Create word-based shingles from text.
   */
  private createShingles(text: string): Set<string> {
    // Normalize: lowercase, split on whitespace
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    const shingles = new Set<string>();
    
    // Create overlapping n-grams
    for (let i = 0; i <= words.length - this.shingleSize; i++) {
      const shingle = words.slice(i, i + this.shingleSize).join(' ');
      shingles.add(shingle);
    }
    
    // Handle short documents (fewer words than shingle size)
    if (shingles.size === 0 && words.length > 0) {
      shingles.add(words.join(' '));
    }
    
    return shingles;
  }

  /**
   * FNV-1a hash function (32-bit).
   */
  private fnv1aHash(str: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    
    return hash >>> 0; // Ensure unsigned 32-bit
  }

  /**
   * Linear hash transformation: h(x) = (a * x + b) mod 2^32
   */
  private linearHash(x: number, a: number, b: number): number {
    // Use BigInt to avoid overflow
    const result = (BigInt(a) * BigInt(x) + BigInt(b)) % BigInt(0x100000000);
    return Number(result);
  }

  /**
   * Generate random 32-bit unsigned integer.
   */
  private randomUint32(): number {
    return Math.floor(Math.random() * 0x100000000);
  }
}
```

### 6.6 `src/similarity/Comparator.ts`

```typescript
import { App, TFile } from 'obsidian';
import { 
  NoteSignature, 
  DuplicatePair, 
  PairMetadata,
  ScanProgress,
  ScanProgressCallback 
} from '../types';
import { MinHasher } from './MinHasher';

/**
 * Finds duplicate pairs from a set of note signatures.
 * 
 * Strategy:
 * 1. Group by exact content hash → O(n)
 * 2. Compare MinHash signatures for remaining → O(n²) worst case
 * 
 * For vaults <10k notes, this is acceptable without LSH.
 */
export class Comparator {
  private threshold: number;

  constructor(threshold: number) {
    this.threshold = threshold;
  }

  /**
   * Find all duplicate pairs above threshold.
   */
  async findDuplicates(
    signatures: Map<string, NoteSignature>,
    app: App,
    abortSignal: AbortSignal,
    onProgress?: ScanProgressCallback
  ): Promise<DuplicatePair[]> {
    const duplicates: DuplicatePair[] = [];
    const entries = Array.from(signatures.entries());
    
    // ========================================
    // Phase 1: Find exact duplicates via content hash
    // ========================================
    
    const byHash = new Map<string, string[]>();
    for (const [path, sig] of entries) {
      const paths = byHash.get(sig.contentHash) ?? [];
      paths.push(path);
      byHash.set(sig.contentHash, paths);
    }
    
    // Create pairs for exact matches
    const exactPairKeys = new Set<string>();
    
    for (const paths of byHash.values()) {
      if (paths.length > 1) {
        // All combinations of paths with same hash
        for (let i = 0; i < paths.length; i++) {
          for (let j = i + 1; j < paths.length; j++) {
            const pair = await this.createPair(
              paths[i],
              paths[j],
              1.0,
              'exact',
              signatures,
              app
            );
            
            if (pair) {
              duplicates.push(pair);
              exactPairKeys.add(this.pairKey(paths[i], paths[j]));
            }
          }
        }
      }
    }
    
    // ========================================
    // Phase 2: MinHash comparison for near-duplicates
    // ========================================
    
    const minHasher = new MinHasher(); // Just for similarity calculation
    let comparisons = 0;
    const totalComparisons = (entries.length * (entries.length - 1)) / 2;
    
    for (let i = 0; i < entries.length; i++) {
      if (abortSignal.aborted) {
        break;
      }
      
      const [pathA, sigA] = entries[i];
      
      for (let j = i + 1; j < entries.length; j++) {
        const [pathB, sigB] = entries[j];
        comparisons++;
        
        // Skip if already found as exact duplicate
        const key = this.pairKey(pathA, pathB);
        if (exactPairKeys.has(key)) {
          continue;
        }
        
        // Compare MinHash signatures
        const similarity = minHasher.estimateSimilarity(
          sigA.minhash,
          sigB.minhash
        );
        
        if (similarity >= this.threshold) {
          const pair = await this.createPair(
            pathA,
            pathB,
            similarity,
            'minhash',
            signatures,
            app
          );
          
          if (pair) {
            duplicates.push(pair);
          }
        }
      }
      
      // Progress update every 50 files
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

  /**
   * Update similarity threshold.
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  // ========================================
  // Private Methods
  // ========================================

  private async createPair(
    pathA: string,
    pathB: string,
    similarity: number,
    method: 'exact' | 'minhash',
    signatures: Map<string, NoteSignature>,
    app: App
  ): Promise<DuplicatePair | null> {
    const fileA = app.vault.getAbstractFileByPath(pathA);
    const fileB = app.vault.getAbstractFileByPath(pathB);
    
    if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) {
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
      fileALines: 0, // Will be computed lazily if needed
      fileBLines: 0,
      fileASize: fileA.stat.size,
      fileBSize: fileB.stat.size,
    };
  }

  /**
   * Generate consistent pair key (sorted paths).
   */
  private pairKey(pathA: string, pathB: string): string {
    return pathA < pathB ? `${pathA}::${pathB}` : `${pathB}::${pathA}`;
  }
}
```

---

## 7. Core Services

### 7.1 `src/core/ContentExtractor.ts`

```typescript
/**
 * Extracts comparable content from raw markdown.
 * - Removes YAML frontmatter
 * - Normalizes whitespace
 */
export class ContentExtractor {
  /**
   * Extract content for similarity comparison.
   */
  extract(raw: string): string {
    let content = raw;
    
    // Remove YAML frontmatter
    content = this.removeFrontmatter(content);
    
    // Normalize whitespace
    content = this.normalizeWhitespace(content);
    
    return content;
  }

  /**
   * Count lines in content.
   */
  countLines(content: string): number {
    if (content.length === 0) return 0;
    return content.split('\n').length;
  }

  // ========================================
  // Private Methods
  // ========================================

  private removeFrontmatter(content: string): string {
    // Match YAML frontmatter: starts at beginning, delimited by ---
    const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
    return content.replace(frontmatterRegex, '');
  }

  private normalizeWhitespace(content: string): string {
    return content
      // Normalize line endings to \n
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Collapse multiple blank lines to single
      .replace(/\n{3,}/g, '\n\n')
      // Trim leading/trailing whitespace
      .trim();
  }
}
```

### 7.2 `src/core/CacheService.ts`

```typescript
import { NoteSignature } from '../types';
import { CACHE_DB_NAME, CACHE_DB_VERSION, CACHE_STORE_NAME } from '../similarity/constants';

/**
 * IndexedDB-backed signature cache.
 * Persists signatures across sessions for faster rescans.
 */
export class CacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection.
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open cache database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
          db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'path' });
        }
      };
    });
    
    return this.initPromise;
  }

  /**
   * Get cached signature by file path.
   */
  async get(path: string): Promise<NoteSignature | null> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.get(path);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  /**
   * Store signature in cache.
   */
  async set(path: string, signature: NoteSignature): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.put(signature);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Remove signature from cache.
   */
  async delete(path: string): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.delete(path);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear all cached signatures.
   */
  async clear(): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Remove signatures for files that no longer exist.
   * @param existingPaths - Set of paths that currently exist
   * @returns Number of pruned entries
   */
  async prune(existingPaths: Set<string>): Promise<number> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.getAllKeys();
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const keysToDelete = (request.result as string[])
          .filter(key => !existingPaths.has(key));
        
        let deleted = 0;
        for (const key of keysToDelete) {
          store.delete(key);
          deleted++;
        }
        
        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => reject(tx.error);
      };
    });
  }
}
```

### 7.3 `src/core/ResultStore.ts`

```typescript
import { DuplicatePair, ScanResult } from '../types';

export type SortField = 'similarity' | 'created' | 'modified' | 'size';
export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
  minSimilarity?: number;
  maxSimilarity?: number;
  folderFilter?: string;
  methodFilter?: 'exact' | 'minhash' | 'all';
}

/**
 * In-memory store for scan results with sorting/filtering.
 */
export class ResultStore {
  private result: ScanResult | null = null;

  /**
   * Store scan results.
   */
  setResult(result: ScanResult): void {
    this.result = result;
  }

  /**
   * Get raw scan result.
   */
  getResult(): ScanResult | null {
    return this.result;
  }

  /**
   * Check if results exist.
   */
  hasResults(): boolean {
    return this.result !== null && this.result.duplicates.length > 0;
  }

  /**
   * Get duplicate count.
   */
  getCount(): number {
    return this.result?.duplicates.length ?? 0;
  }

  /**
   * Get duplicates with sorting and filtering.
   */
  getDuplicates(
    sortField: SortField = 'similarity',
    sortOrder: SortOrder = 'desc',
    filters?: FilterOptions
  ): DuplicatePair[] {
    if (!this.result) return [];
    
    let pairs = [...this.result.duplicates];
    
    // Apply filters
    if (filters) {
      pairs = this.applyFilters(pairs, filters);
    }
    
    // Apply sorting
    pairs = this.applySorting(pairs, sortField, sortOrder);
    
    return pairs;
  }

  /**
   * Remove a pair from results (after user deletes a file).
   */
  removePair(pairId: string): void {
    if (!this.result) return;
    
    this.result.duplicates = this.result.duplicates.filter(p => p.id !== pairId);
  }

  /**
   * Remove all pairs involving a specific file path.
   */
  removeByPath(path: string): void {
    if (!this.result) return;
    
    this.result.duplicates = this.result.duplicates.filter(
      p => p.fileA.path !== path && p.fileB.path !== path
    );
  }

  /**
   * Clear all results.
   */
  clear(): void {
    this.result = null;
  }

  // ========================================
  // Private Methods
  // ========================================

  private applyFilters(pairs: DuplicatePair[], filters: FilterOptions): DuplicatePair[] {
    return pairs.filter(pair => {
      // Similarity range filter
      if (filters.minSimilarity !== undefined && pair.similarity < filters.minSimilarity) {
        return false;
      }
      if (filters.maxSimilarity !== undefined && pair.similarity > filters.maxSimilarity) {
        return false;
      }
      
      // Method filter
      if (filters.methodFilter && filters.methodFilter !== 'all') {
        if (pair.method !== filters.methodFilter) {
          return false;
        }
      }
      
      // Folder filter
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
          
        case 'created':
          // Sort by oldest file in pair
          const aOldest = Math.min(a.metadata.fileACreated, a.metadata.fileBCreated);
          const bOldest = Math.min(b.metadata.fileACreated, b.metadata.fileBCreated);
          comparison = aOldest - bOldest;
          break;
          
        case 'modified':
          // Sort by most recently modified file in pair
          const aNewest = Math.max(a.metadata.fileAModified, a.metadata.fileBModified);
          const bNewest = Math.max(b.metadata.fileAModified, b.metadata.fileBModified);
          comparison = aNewest - bNewest;
          break;
          
        case 'size':
          // Sort by total size of pair
          const aSize = a.metadata.fileASize + a.metadata.fileBSize;
          const bSize = b.metadata.fileASize + b.metadata.fileBSize;
          comparison = aSize - bSize;
          break;
      }
      
      return comparison * multiplier;
    });
  }
}
```

### 7.4 `src/core/ScanService.ts`

```typescript
import { App, TFile } from 'obsidian';
import { 
  DuplicateFinderSettings, 
  ScanResult, 
  ScanProgressCallback,
  NoteSignature,
  ScanProgress
} from '../types';
import { CacheService } from './CacheService';
import { ContentExtractor } from './ContentExtractor';
import { ExactHasher } from '../similarity/ExactHasher';
import { MinHasher } from '../similarity/MinHasher';
import { Comparator } from '../similarity/Comparator';

/**
 * Orchestrates the vault scanning pipeline.
 */
export class ScanService {
  private app: App;
  private settings: DuplicateFinderSettings;
  private cache: CacheService;
  
  private extractor: ContentExtractor;
  private exactHasher: ExactHasher;
  private minHasher: MinHasher;
  private comparator: Comparator;
  
  private abortController: AbortController | null = null;

  constructor(
    app: App,
    settings: DuplicateFinderSettings,
    cache: CacheService
  ) {
    this.app = app;
    this.settings = settings;
    this.cache = cache;
    
    this.extractor = new ContentExtractor();
    this.exactHasher = new ExactHasher();
    this.minHasher = new MinHasher(
      settings.shingleSize,
      settings.numHashFunctions
    );
    this.comparator = new Comparator(settings.similarityThreshold);
  }

  /**
   * Run a full vault scan for duplicates.
   */
  async scan(onProgress?: ScanProgressCallback): Promise<ScanResult> {
    this.abortController = new AbortController();
    const startTime = Date.now();
    
    // ========================================
    // Phase 1: Collect files to scan
    // ========================================
    
    const files = this.getFilesToScan();
    let skippedCount = 0;
    
    onProgress?.({
      phase: 'reading',
      current: 0,
      total: files.length,
    });
    
    // ========================================
    // Phase 2: Generate signatures
    // ========================================
    
    const signatures = new Map<string, NoteSignature>();
    
    for (let i = 0; i < files.length; i++) {
      // Check for cancellation
      if (this.abortController.signal.aborted) {
        return this.buildResult([], signatures.size, skippedCount, startTime, true);
      }
      
      const file = files[i];
      
      onProgress?.({
        phase: 'hashing',
        current: i + 1,
        total: files.length,
        currentFile: file.path,
      });
      
      try {
        const signature = await this.getOrComputeSignature(file);
        
        if (signature) {
          signatures.set(file.path, signature);
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`Error processing ${file.path}:`, error);
        skippedCount++;
      }
    }
    
    // ========================================
    // Phase 3: Find duplicates
    // ========================================
    
    onProgress?.({
      phase: 'comparing',
      current: 0,
      total: signatures.size,
    });
    
    const duplicates = await this.comparator.findDuplicates(
      signatures,
      this.app,
      this.abortController.signal,
      onProgress
    );
    
    // ========================================
    // Complete
    // ========================================
    
    onProgress?.({
      phase: 'complete',
      current: signatures.size,
      total: signatures.size,
    });
    
    return this.buildResult(duplicates, signatures.size, skippedCount, startTime, false);
  }

  /**
   * Cancel an in-progress scan.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Check if a scan is currently running.
   */
  isRunning(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  /**
   * Update settings (e.g., when user changes threshold).
   */
  updateSettings(settings: DuplicateFinderSettings): void {
    this.settings = settings;
    
    this.minHasher = new MinHasher(
      settings.shingleSize,
      settings.numHashFunctions
    );
    this.comparator = new Comparator(settings.similarityThreshold);
  }

  // ========================================
  // Private Methods
  // ========================================

  private getFilesToScan(): TFile[] {
    const allFiles = this.app.vault.getMarkdownFiles();
    return allFiles.filter(file => this.shouldIncludeFile(file));
  }

  private shouldIncludeFile(file: TFile): boolean {
    const path = file.path;
    
    // Check excluded folders
    for (const folder of this.settings.excludeFolders) {
      const normalizedFolder = folder.endsWith('/') ? folder : folder + '/';
      if (path.startsWith(normalizedFolder) || path === folder) {
        return false;
      }
    }
    
    // Check excluded patterns (regex)
    for (const pattern of this.settings.excludePatterns) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(path)) {
          return false;
        }
      } catch {
        // Invalid regex, skip this pattern
        console.warn(`Invalid exclude pattern: ${pattern}`);
      }
    }
    
    return true;
  }

  private async getOrComputeSignature(file: TFile): Promise<NoteSignature | null> {
    // Try cache first
    if (this.settings.cacheEnabled) {
      const cached = await this.cache.get(file.path);
      
      if (cached && cached.mtime === file.stat.mtime) {
        return cached;
      }
    }
    
    // Read file content
    const rawContent = await this.app.vault.cachedRead(file);
    
    // Extract content (strip frontmatter)
    const content = this.extractor.extract(rawContent);
    
    // Skip if content is too short
    if (content.length < this.settings.minContentLength) {
      return null;
    }
    
    // Compute signatures
    const contentHash = await this.exactHasher.hash(content);
    const minhash = this.minHasher.compute(content);
    
    const signature: NoteSignature = {
      path: file.path,
      mtime: file.stat.mtime,
      contentHash,
      minhash,
    };
    
    // Store in cache
    if (this.settings.cacheEnabled) {
      await this.cache.set(file.path, signature);
    }
    
    return signature;
  }

  private buildResult(
    duplicates: DuplicatePair[],
    scannedCount: number,
    skippedCount: number,
    startTime: number,
    cancelled: boolean
  ): ScanResult {
    return {
      duplicates: cancelled ? [] : duplicates,
      scannedCount,
      skippedCount,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
}
```

---

## 8. UI Components

### 8.1 `src/ui/ResultsView.ts`

```typescript
import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { DuplicatePair } from '../types';
import { ResultStore, SortField, SortOrder } from '../core/ResultStore';
import type DuplicateFinderPlugin from '../main';

export const RESULTS_VIEW_TYPE = 'duplicate-finder-results';

/**
 * Main results panel showing duplicate pairs.
 */
export class ResultsView extends ItemView {
  private plugin: DuplicateFinderPlugin;
  private resultStore: ResultStore;
  
  // UI state
  private sortField: SortField = 'similarity';
  private sortOrder: SortOrder = 'desc';

  constructor(leaf: WorkspaceLeaf, plugin: DuplicateFinderPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.resultStore = plugin.resultStore;
  }

  getViewType(): string {
    return RESULTS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Duplicate Finder';
  }

  getIcon(): string {
    return 'copy';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Re-render the view.
   */
  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('duplicate-finder-view');
    
    this.renderHeader(container);
    
    if (!this.resultStore.hasResults()) {
      this.renderEmptyState(container);
    } else {
      this.renderResults(container);
    }
  }

  // ========================================
  // Render Methods
  // ========================================

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'df-header' });
    
    // Title and scan button row
    const titleRow = header.createDiv({ cls: 'df-title-row' });
    titleRow.createEl('h4', { text: 'Duplicate Finder' });
    
    const scanBtn = titleRow.createEl('button', { 
      cls: 'df-scan-btn',
      text: 'Scan Vault' 
    });
    scanBtn.addEventListener('click', () => this.plugin.runScan());
    
    // Stats row (if results exist)
    const result = this.resultStore.getResult();
    if (result) {
      const statsRow = header.createDiv({ cls: 'df-stats-row' });
      
      statsRow.createSpan({ 
        text: `${result.duplicates.length} duplicate pairs found`,
        cls: 'df-stat'
      });
      statsRow.createSpan({ 
        text: `${result.scannedCount} notes scanned`,
        cls: 'df-stat'
      });
      statsRow.createSpan({ 
        text: `${(result.durationMs / 1000).toFixed(1)}s`,
        cls: 'df-stat'
      });
    }
    
    // Sort controls (if results exist)
    if (this.resultStore.hasResults()) {
      this.renderSortControls(header);
    }
  }

  private renderSortControls(header: HTMLElement): void {
    const controls = header.createDiv({ cls: 'df-sort-controls' });
    
    controls.createSpan({ text: 'Sort by: ', cls: 'df-sort-label' });
    
    const sortSelect = controls.createEl('select', { cls: 'df-sort-select' });
    
    const options: { value: SortField; label: string }[] = [
      { value: 'similarity', label: 'Similarity' },
      { value: 'created', label: 'Date Created' },
      { value: 'modified', label: 'Date Modified' },
      { value: 'size', label: 'File Size' },
    ];
    
    for (const opt of options) {
      const option = sortSelect.createEl('option', { 
        value: opt.value, 
        text: opt.label 
      });
      if (opt.value === this.sortField) {
        option.selected = true;
      }
    }
    
    sortSelect.addEventListener('change', () => {
      this.sortField = sortSelect.value as SortField;
      this.render();
    });
    
    // Sort order toggle
    const orderBtn = controls.createEl('button', { cls: 'df-order-btn' });
    setIcon(orderBtn, this.sortOrder === 'desc' ? 'arrow-down' : 'arrow-up');
    
    orderBtn.addEventListener('click', () => {
      this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
      this.render();
    });
  }

  private renderEmptyState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: 'df-empty-state' });
    
    const icon = empty.createDiv({ cls: 'df-empty-icon' });
    setIcon(icon, 'check-circle');
    
    empty.createEl('p', { 
      text: 'No duplicates found.',
      cls: 'df-empty-title'
    });
    empty.createEl('p', { 
      text: 'Click "Scan Vault" to search for duplicate notes.',
      cls: 'df-empty-hint'
    });
  }

  private renderResults(container: HTMLElement): void {
    const list = container.createDiv({ cls: 'df-results-list' });
    
    const duplicates = this.resultStore.getDuplicates(
      this.sortField,
      this.sortOrder
    );
    
    for (const pair of duplicates) {
      this.renderDuplicateCard(list, pair);
    }
  }

  private renderDuplicateCard(container: HTMLElement, pair: DuplicatePair): void {
    const card = container.createDiv({ cls: 'df-card' });
    
    // Header with similarity badge
    const cardHeader = card.createDiv({ cls: 'df-card-header' });
    
    const badge = cardHeader.createDiv({ cls: 'df-badge' });
    const pct = Math.round(pair.similarity * 100);
    badge.setText(`${pct}%`);
    badge.addClass(pair.method === 'exact' ? 'df-badge-exact' : 'df-badge-similar');
    
    const methodLabel = cardHeader.createSpan({ cls: 'df-method-label' });
    methodLabel.setText(pair.method === 'exact' ? 'Exact match' : 'Similar content');
    
    // File entries
    const filesContainer = card.createDiv({ cls: 'df-files' });
    
    this.renderFileEntry(filesContainer, pair.fileA, pair, 'A');
    this.renderFileEntry(filesContainer, pair.fileB, pair, 'B');
    
    // Actions
    const actions = card.createDiv({ cls: 'df-card-actions' });
    
    const compareBtn = actions.createEl('button', { 
      text: 'Compare',
      cls: 'df-btn df-btn-secondary'
    });
    compareBtn.addEventListener('click', () => this.openComparison(pair));
  }

  private renderFileEntry(
    container: HTMLElement,
    file: TFile,
    pair: DuplicatePair,
    label: 'A' | 'B'
  ): void {
    const entry = container.createDiv({ cls: 'df-file-entry' });
    
    // File info
    const info = entry.createDiv({ cls: 'df-file-info' });
    
    // Clickable filename
    const nameLink = info.createEl('a', {
      text: file.basename,
      cls: 'df-file-name',
      href: '#'
    });
    nameLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(file.path, '', false);
    });
    
    // Path and metadata
    const meta = info.createDiv({ cls: 'df-file-meta' });
    meta.createSpan({ text: file.parent?.path ?? '/', cls: 'df-file-path' });
    
    const created = label === 'A' ? pair.metadata.fileACreated : pair.metadata.fileBCreated;
    const otherCreated = label === 'A' ? pair.metadata.fileBCreated : pair.metadata.fileACreated;
    const size = label === 'A' ? pair.metadata.fileASize : pair.metadata.fileBSize;
    
    meta.createSpan({ text: ` • ${this.formatSize(size)}` });
    meta.createSpan({ text: ` • ${this.formatDate(created)}` });
    
    // Age indicator
    if (created < otherCreated) {
      const ageLabel = meta.createSpan({ text: ' (older)', cls: 'df-age-older' });
    } else if (created > otherCreated) {
      const ageLabel = meta.createSpan({ text: ' (newer)', cls: 'df-age-newer' });
    }
    
    // Delete button
    const deleteBtn = entry.createEl('button', {
      cls: 'df-btn df-btn-danger df-btn-small',
      attr: { 'aria-label': `Delete ${file.basename}` }
    });
    setIcon(deleteBtn, 'trash-2');
    
    deleteBtn.addEventListener('click', () => this.confirmDelete(pair, file));
  }

  // ========================================
  // Actions
  // ========================================

  private openComparison(pair: DuplicatePair): void {
    // Open both files in split view
    const leaf1 = this.app.workspace.getLeaf('split');
    leaf1.openFile(pair.fileA);
    
    const leaf2 = this.app.workspace.getLeaf('split');
    leaf2.openFile(pair.fileB);
  }

  private async confirmDelete(pair: DuplicatePair, file: TFile): Promise<void> {
    const confirmed = await this.plugin.showDeleteConfirmation(file);
    
    if (confirmed) {
      try {
        await this.app.vault.trash(file, true);
        this.resultStore.removeByPath(file.path);
        this.render();
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
  }

  // ========================================
  // Helpers
  // ========================================

  private formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
```

### 8.2 `src/ui/ProgressModal.ts`

```typescript
import { App, Modal, setIcon } from 'obsidian';
import { ScanProgress } from '../types';

/**
 * Modal showing scan progress with cancel option.
 */
export class ProgressModal extends Modal {
  private progressBar: HTMLElement | null = null;
  private statusText: HTMLElement | null = null;
  private fileText: HTMLElement | null = null;
  private cancelCallback: (() => void) | null = null;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this.cancelCallback = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-progress-modal');
    
    // Title
    contentEl.createEl('h3', { text: 'Scanning Vault...' });
    
    // Progress bar container
    const progressContainer = contentEl.createDiv({ cls: 'df-progress-container' });
    this.progressBar = progressContainer.createDiv({ cls: 'df-progress-bar' });
    
    // Status text
    this.statusText = contentEl.createDiv({ cls: 'df-progress-status' });
    this.statusText.setText('Preparing...');
    
    // Current file
    this.fileText = contentEl.createDiv({ cls: 'df-progress-file' });
    
    // Cancel button
    const cancelBtn = contentEl.createEl('button', {
      text: 'Cancel',
      cls: 'df-btn df-btn-secondary'
    });
    cancelBtn.addEventListener('click', () => {
      this.cancelCallback?.();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /**
   * Update progress display.
   */
  updateProgress(progress: ScanProgress): void {
    if (!this.progressBar || !this.statusText) return;
    
    const pct = progress.total > 0 
      ? Math.round((progress.current / progress.total) * 100) 
      : 0;
    
    this.progressBar.style.width = `${pct}%`;
    
    switch (progress.phase) {
      case 'reading':
        this.statusText.setText('Reading files...');
        break;
      case 'hashing':
        this.statusText.setText(`Analyzing: ${progress.current} / ${progress.total}`);
        break;
      case 'comparing':
        this.statusText.setText(`Comparing: ${progress.current} / ${progress.total}`);
        break;
      case 'complete':
        this.statusText.setText('Complete!');
        break;
      case 'cancelled':
        this.statusText.setText('Cancelled');
        break;
    }
    
    if (this.fileText && progress.currentFile) {
      this.fileText.setText(progress.currentFile);
    }
  }
}
```

### 8.3 `src/ui/ConfirmDeleteModal.ts`

```typescript
import { App, Modal, TFile, setIcon } from 'obsidian';

/**
 * Confirmation dialog for file deletion.
 */
export class ConfirmDeleteModal extends Modal {
  private file: TFile;
  private resolvePromise: ((confirmed: boolean) => void) | null = null;

  constructor(app: App, file: TFile) {
    super(app);
    this.file = file;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-confirm-modal');
    
    // Warning icon
    const iconContainer = contentEl.createDiv({ cls: 'df-confirm-icon' });
    setIcon(iconContainer, 'alert-triangle');
    
    // Title
    contentEl.createEl('h3', { text: 'Delete File?' });
    
    // File info
    const fileInfo = contentEl.createDiv({ cls: 'df-confirm-file' });
    fileInfo.createEl('strong', { text: this.file.basename });
    fileInfo.createEl('div', { text: this.file.path, cls: 'df-confirm-path' });
    
    // Warning text
    contentEl.createEl('p', { 
      text: 'This file will be moved to your vault\'s trash folder.',
      cls: 'df-confirm-warning'
    });
    
    // Buttons
    const buttons = contentEl.createDiv({ cls: 'df-confirm-buttons' });
    
    const cancelBtn = buttons.createEl('button', {
      text: 'Cancel',
      cls: 'df-btn df-btn-secondary'
    });
    cancelBtn.addEventListener('click', () => {
      this.resolvePromise?.(false);
      this.close();
    });
    
    const deleteBtn = buttons.createEl('button', {
      text: 'Delete',
      cls: 'df-btn df-btn-danger'
    });
    deleteBtn.addEventListener('click', () => {
      this.resolvePromise?.(true);
      this.close();
    });
    
    // Focus cancel by default (safer)
    cancelBtn.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    // Ensure promise resolves even if modal closed via escape
    this.resolvePromise?.(false);
  }

  /**
   * Show modal and wait for user response.
   */
  async waitForConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}
```

### 8.4 `src/ui/SettingsTab.ts`

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import type DuplicateFinderPlugin from '../main';

/**
 * Plugin settings tab.
 */
export class SettingsTab extends PluginSettingTab {
  plugin: DuplicateFinderPlugin;

  constructor(app: App, plugin: DuplicateFinderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h2', { text: 'Duplicate Finder Settings' });
    
    // ========================================
    // Scan Settings
    // ========================================
    
    containerEl.createEl('h3', { text: 'Scan Settings' });
    
    new Setting(containerEl)
      .setName('Similarity threshold')
      .setDesc('Minimum similarity percentage to consider as duplicate (50-100%)')
      .addSlider(slider => slider
        .setLimits(50, 100, 5)
        .setValue(this.plugin.settings.similarityThreshold * 100)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.similarityThreshold = value / 100;
          await this.plugin.saveSettings();
        })
      );
    
    new Setting(containerEl)
      .setName('Minimum content length')
      .setDesc('Skip notes with content shorter than this (characters)')
      .addText(text => text
        .setPlaceholder('50')
        .setValue(String(this.plugin.settings.minContentLength))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 0) {
            this.plugin.settings.minContentLength = num;
            await this.plugin.saveSettings();
          }
        })
      );
    
    // ========================================
    // Exclusions
    // ========================================
    
    containerEl.createEl('h3', { text: 'Exclusions' });
    
    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Folders to skip when scanning (one per line)')
      .addTextArea(text => text
        .setPlaceholder('templates\narchive\ndaily')
        .setValue(this.plugin.settings.excludeFolders.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.excludeFolders = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.plugin.saveSettings();
        })
      );
    
    new Setting(containerEl)
      .setName('Excluded patterns')
      .setDesc('Regex patterns to exclude (one per line)')
      .addTextArea(text => text
        .setPlaceholder('^daily/.*\n\\.excalidraw$')
        .setValue(this.plugin.settings.excludePatterns.join('\n'))
        .onChange(async (value) => {
          this.plugin.settings.excludePatterns = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.plugin.saveSettings();
        })
      );
    
    // ========================================
    // Performance
    // ========================================
    
    containerEl.createEl('h3', { text: 'Performance' });
    
    new Setting(containerEl)
      .setName('Enable cache')
      .setDesc('Cache signatures for faster rescans (recommended)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.cacheEnabled)
        .onChange(async (value) => {
          this.plugin.settings.cacheEnabled = value;
          await this.plugin.saveSettings();
        })
      );
    
    new Setting(containerEl)
      .setName('Clear cache')
      .setDesc('Remove all cached signatures')
      .addButton(button => button
        .setButtonText('Clear')
        .onClick(async () => {
          await this.plugin.clearCache();
        })
      );
    
    // ========================================
    // Advanced
    // ========================================
    
    containerEl.createEl('h3', { text: 'Advanced' });
    
    new Setting(containerEl)
      .setName('Shingle size')
      .setDesc('Words per shingle. Higher values are stricter.')
      .addDropdown(dropdown => dropdown
        .addOption('2', '2 words')
        .addOption('3', '3 words (default)')
        .addOption('4', '4 words')
        .addOption('5', '5 words')
        .setValue(String(this.plugin.settings.shingleSize))
        .onChange(async (value) => {
          this.plugin.settings.shingleSize = parseInt(value, 10);
          await this.plugin.saveSettings();
        })
      );
    
    new Setting(containerEl)
      .setName('Hash functions')
      .setDesc('Number of MinHash functions. More = accurate but slower.')
      .addDropdown(dropdown => dropdown
        .addOption('64', '64 (fast)')
        .addOption('128', '128 (default)')
        .addOption('256', '256 (accurate)')
        .setValue(String(this.plugin.settings.numHashFunctions))
        .onChange(async (value) => {
          this.plugin.settings.numHashFunctions = parseInt(value, 10);
          await this.plugin.saveSettings();
        })
      );
  }
}
```

---

## 9. Plugin Entry Point

### 9.1 `src/main.ts`

```typescript
import { App, Plugin, Notice, TFile } from 'obsidian';
import { 
  DuplicateFinderSettings, 
  DEFAULT_SETTINGS,
  ScanProgress 
} from './types';
import { ScanService } from './core/ScanService';
import { CacheService } from './core/CacheService';
import { ResultStore } from './core/ResultStore';
import { ResultsView, RESULTS_VIEW_TYPE } from './ui/ResultsView';
import { ProgressModal } from './ui/ProgressModal';
import { ConfirmDeleteModal } from './ui/ConfirmDeleteModal';
import { SettingsTab } from './ui/SettingsTab';

export default class DuplicateFinderPlugin extends Plugin {
  settings: DuplicateFinderSettings;
  
  // Services
  private cacheService: CacheService;
  private scanService: ScanService;
  resultStore: ResultStore;

  async onload(): Promise<void> {
    console.log('Loading Duplicate Finder plugin');
    
    // Load settings
    await this.loadSettings();
    
    // Initialize services
    this.cacheService = new CacheService();
    await this.cacheService.init();
    
    this.resultStore = new ResultStore();
    
    this.scanService = new ScanService(
      this.app,
      this.settings,
      this.cacheService
    );
    
    // Register view
    this.registerView(
      RESULTS_VIEW_TYPE,
      (leaf) => new ResultsView(leaf, this)
    );
    
    // Add ribbon icon
    this.addRibbonIcon('copy', 'Duplicate Finder', () => {
      this.activateView();
    });
    
    // Register commands
    this.addCommand({
      id: 'scan-vault',
      name: 'Scan vault for duplicates',
      callback: () => this.runScan(),
    });
    
    this.addCommand({
      id: 'show-results',
      name: 'Show duplicate finder results',
      callback: () => this.activateView(),
    });
    
    this.addCommand({
      id: 'clear-cache',
      name: 'Clear signature cache',
      callback: () => this.clearCache(),
    });
    
    // Add settings tab
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async onunload(): Promise<void> {
    console.log('Unloading Duplicate Finder plugin');
    this.app.workspace.detachLeavesOfType(RESULTS_VIEW_TYPE);
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Run a vault scan with progress modal.
   */
  async runScan(): Promise<void> {
    // Prevent multiple concurrent scans
    if (this.scanService.isRunning()) {
      new Notice('A scan is already in progress');
      return;
    }
    
    const progressModal = new ProgressModal(
      this.app,
      () => this.scanService.cancel()
    );
    progressModal.open();
    
    try {
      const result = await this.scanService.scan((progress: ScanProgress) => {
        progressModal.updateProgress(progress);
      });
      
      progressModal.close();
      
      if (result.duplicates.length > 0) {
        this.resultStore.setResult(result);
        await this.activateView();
        new Notice(`Found ${result.duplicates.length} duplicate pairs`);
      } else {
        new Notice('No duplicates found!');
      }
    } catch (error) {
      progressModal.close();
      console.error('Scan failed:', error);
      new Notice('Scan failed. Check console for details.');
    }
  }

  /**
   * Show delete confirmation and return result.
   */
  async showDeleteConfirmation(file: TFile): Promise<boolean> {
    const modal = new ConfirmDeleteModal(this.app, file);
    return modal.waitForConfirmation();
  }

  /**
   * Clear the signature cache.
   */
  async clearCache(): Promise<void> {
    await this.cacheService.clear();
    new Notice('Duplicate finder cache cleared');
  }

  // ========================================
  // Settings
  // ========================================

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.scanService?.updateSettings(this.settings);
  }

  // ========================================
  // Private Methods
  // ========================================

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(RESULTS_VIEW_TYPE);
    
    if (existing.length > 0) {
      // View exists, reveal and refresh
      this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view as ResultsView;
      view.render();
    } else {
      // Create new view in right sidebar
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: RESULTS_VIEW_TYPE,
          active: true,
        });
      }
    }
  }
}
```

---

## 10. Settings

### 10.1 Default Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `excludeFolders` | `[]` | Folders to skip |
| `excludePatterns` | `[]` | Regex patterns to skip |
| `minContentLength` | `50` | Minimum characters to consider |
| `similarityThreshold` | `0.7` | Minimum similarity (70%) |
| `shingleSize` | `3` | Words per shingle |
| `numHashFunctions` | `128` | MinHash signature size |
| `cacheEnabled` | `true` | Persist signatures |

### 10.2 Recommended Settings by Vault Size

| Vault Size | Threshold | Shingle Size | Hash Functions |
|------------|-----------|--------------|----------------|
| < 1,000 notes | 0.7 | 3 | 128 |
| 1,000 - 5,000 | 0.75 | 3 | 128 |
| 5,000 - 10,000 | 0.8 | 3 | 64 |
| > 10,000 | 0.85 | 4 | 64 |

---

## 11. Styling

### 11.1 `styles.css`

```css
/* ========================================
   Duplicate Finder Plugin Styles
   ======================================== */

/* Variables */
.duplicate-finder-view {
  --df-spacing-xs: 4px;
  --df-spacing-sm: 8px;
  --df-spacing-md: 16px;
  --df-spacing-lg: 24px;
  
  --df-color-success: #28a745;
  --df-color-warning: #ffc107;
  --df-color-danger: #dc3545;
  --df-color-muted: var(--text-muted);
}

/* ========================================
   Header
   ======================================== */

.df-header {
  padding: var(--df-spacing-md);
  border-bottom: 1px solid var(--background-modifier-border);
}

.df-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--df-spacing-sm);
}

.df-title-row h4 {
  margin: 0;
}

.df-scan-btn {
  /* Uses Obsidian default button styles */
}

.df-stats-row {
  display: flex;
  gap: var(--df-spacing-md);
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
  margin-bottom: var(--df-spacing-sm);
}

.df-sort-controls {
  display: flex;
  align-items: center;
  gap: var(--df-spacing-sm);
}

.df-sort-label {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
}

.df-sort-select {
  font-size: var(--font-ui-smaller);
}

.df-order-btn {
  padding: var(--df-spacing-xs);
  min-width: 28px;
}

/* ========================================
   Empty State
   ======================================== */

.df-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--df-spacing-lg);
  text-align: center;
  min-height: 200px;
}

.df-empty-icon {
  color: var(--df-color-success);
  margin-bottom: var(--df-spacing-md);
}

.df-empty-icon svg {
  width: 48px;
  height: 48px;
}

.df-empty-title {
  margin: 0 0 var(--df-spacing-xs) 0;
  font-weight: 600;
}

.df-empty-hint {
  margin: 0;
  color: var(--df-color-muted);
  font-size: var(--font-ui-smaller);
}

/* ========================================
   Results List
   ======================================== */

.df-results-list {
  padding: var(--df-spacing-sm);
}

/* ========================================
   Duplicate Card
   ======================================== */

.df-card {
  background: var(--background-secondary);
  border-radius: var(--radius-m);
  padding: var(--df-spacing-md);
  margin-bottom: var(--df-spacing-sm);
}

.df-card-header {
  display: flex;
  align-items: center;
  gap: var(--df-spacing-sm);
  margin-bottom: var(--df-spacing-md);
}

/* Similarity Badge */
.df-badge {
  padding: var(--df-spacing-xs) var(--df-spacing-sm);
  border-radius: var(--radius-s);
  font-size: var(--font-ui-smaller);
  font-weight: 600;
}

.df-badge-exact {
  background: var(--df-color-danger);
  color: white;
}

.df-badge-similar {
  background: var(--df-color-warning);
  color: black;
}

.df-method-label {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
}

/* File Entries */
.df-files {
  display: flex;
  flex-direction: column;
  gap: var(--df-spacing-sm);
}

.df-file-entry {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--df-spacing-sm);
  background: var(--background-primary);
  border-radius: var(--radius-s);
}

.df-file-info {
  flex: 1;
  min-width: 0; /* Allow text truncation */
}

.df-file-name {
  display: block;
  font-weight: 500;
  color: var(--text-normal);
  text-decoration: none;
  margin-bottom: var(--df-spacing-xs);
}

.df-file-name:hover {
  color: var(--text-accent);
  text-decoration: underline;
}

.df-file-meta {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
}

.df-file-path {
  word-break: break-all;
}

.df-age-older {
  color: var(--df-color-muted);
}

.df-age-newer {
  color: var(--df-color-success);
}

/* Card Actions */
.df-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--df-spacing-sm);
  margin-top: var(--df-spacing-md);
  padding-top: var(--df-spacing-md);
  border-top: 1px solid var(--background-modifier-border);
}

/* ========================================
   Buttons
   ======================================== */

.df-btn {
  padding: var(--df-spacing-xs) var(--df-spacing-sm);
  border-radius: var(--radius-s);
  font-size: var(--font-ui-smaller);
  cursor: pointer;
  border: none;
}

.df-btn-secondary {
  background: var(--interactive-normal);
  color: var(--text-normal);
}

.df-btn-secondary:hover {
  background: var(--interactive-hover);
}

.df-btn-danger {
  background: var(--df-color-danger);
  color: white;
}

.df-btn-danger:hover {
  background: #c82333;
}

.df-btn-small {
  padding: var(--df-spacing-xs);
  min-width: 28px;
}

/* ========================================
   Progress Modal
   ======================================== */

.df-progress-modal {
  padding: var(--df-spacing-md);
}

.df-progress-modal h3 {
  margin-top: 0;
}

.df-progress-container {
  width: 100%;
  height: 8px;
  background: var(--background-modifier-border);
  border-radius: var(--radius-s);
  overflow: hidden;
  margin-bottom: var(--df-spacing-md);
}

.df-progress-bar {
  height: 100%;
  background: var(--interactive-accent);
  width: 0%;
  transition: width 0.3s ease;
}

.df-progress-status {
  font-weight: 500;
  margin-bottom: var(--df-spacing-xs);
}

.df-progress-file {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
  word-break: break-all;
  min-height: 1.5em;
  margin-bottom: var(--df-spacing-md);
}

/* ========================================
   Confirm Modal
   ======================================== */

.df-confirm-modal {
  text-align: center;
  padding: var(--df-spacing-md);
}

.df-confirm-icon {
  color: var(--df-color-warning);
  margin-bottom: var(--df-spacing-sm);
}

.df-confirm-icon svg {
  width: 48px;
  height: 48px;
}

.df-confirm-file {
  background: var(--background-secondary);
  padding: var(--df-spacing-md);
  border-radius: var(--radius-s);
  margin-bottom: var(--df-spacing-md);
}

.df-confirm-path {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
  word-break: break-all;
  margin-top: var(--df-spacing-xs);
}

.df-confirm-warning {
  font-size: var(--font-ui-smaller);
  color: var(--df-color-muted);
}

.df-confirm-buttons {
  display: flex;
  justify-content: center;
  gap: var(--df-spacing-sm);
  margin-top: var(--df-spacing-md);
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

**`tests/MinHasher.test.ts`**

```typescript
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
      expect(similarity).toBeGreaterThan(0.7);
    });
    
    it('returns low similarity for different content', () => {
      const sigA = hasher.compute('the quick brown fox');
      const sigB = hasher.compute('completely different text about something else entirely');
      
      const similarity = hasher.estimateSimilarity(sigA, sigB);
      expect(similarity).toBeLessThan(0.3);
    });
    
    it('throws on mismatched signature lengths', () => {
      const hasher64 = new MinHasher(3, 64);
      const sigA = hasher.compute('test');
      const sigB = hasher64.compute('test');
      
      expect(() => hasher.estimateSimilarity(sigA, sigB)).toThrow();
    });
  });
});
```

**`tests/ContentExtractor.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { ContentExtractor } from '../src/core/ContentExtractor';

describe('ContentExtractor', () => {
  const extractor = new ContentExtractor();
  
  describe('extract', () => {
    it('removes YAML frontmatter', () => {
      const content = `---
title: Test
tags: [test]
---

This is the content.`;
      
      expect(extractor.extract(content)).toBe('This is the content.');
    });
    
    it('handles content without frontmatter', () => {
      const content = 'Just plain content.';
      expect(extractor.extract(content)).toBe('Just plain content.');
    });
    
    it('normalizes line endings', () => {
      const content = 'Line 1\r\nLine 2\rLine 3\nLine 4';
      const result = extractor.extract(content);
      
      expect(result).not.toContain('\r');
      expect(result.split('\n').length).toBe(4);
    });
    
    it('collapses multiple blank lines', () => {
      const content = 'Para 1\n\n\n\nPara 2';
      expect(extractor.extract(content)).toBe('Para 1\n\nPara 2');
    });
    
    it('trims whitespace', () => {
      const content = '  \n  Content  \n  ';
      expect(extractor.extract(content)).toBe('Content');
    });
  });
});
```

### 12.2 Integration Tests

**`tests/integration/scan.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// Mock Obsidian app for integration tests
// This would require a test harness setup

describe('Scan Integration', () => {
  it.todo('scans vault and finds exact duplicates');
  it.todo('scans vault and finds near duplicates');
  it.todo('respects excluded folders');
  it.todo('uses cache on rescan');
  it.todo('handles file deletion during scan');
});
```

### 12.3 Test Fixtures

```
tests/fixtures/
├── exact-duplicates/
│   ├── note-a.md       # "This is identical content."
│   └── note-b.md       # "This is identical content."
├── near-duplicates/
│   ├── original.md     # Long note with many paragraphs
│   └── modified.md     # Same note with minor changes
├── no-duplicates/
│   ├── unique-1.md
│   └── unique-2.md
└── with-frontmatter/
    ├── note-1.md       # Same content, different frontmatter
    └── note-2.md       # Same content, different frontmatter
```

---

## 13. Future Enhancements

### 13.1 v0.2.0 — Batch Operations

- [ ] "Delete all older" button
- [ ] "Keep all newer" button  
- [ ] Select multiple pairs for batch delete
- [ ] Undo last delete action

### 13.2 v0.3.0 — LSH for Large Vaults

- [ ] Locality Sensitive Hashing index
- [ ] Configurable bands/rows
- [ ] Automatic detection (enable LSH when vault > 5k notes)

### 13.3 v0.4.0 — Advanced Comparison

- [ ] Inline diff view
- [ ] Merge editor
- [ ] Line-by-line diff stats

### 13.4 v0.5.0 — Context Menu & Real-time

- [ ] "Find duplicates of this note" context menu
- [ ] Background scanning on file change (opt-in)
- [ ] Status bar indicator with duplicate count

### 13.5 Future Ideas

- Export results to CSV/JSON
- Integration with Obsidian Sync conflict detection
- Semantic similarity using embeddings
- Attachment (image) duplicate detection via perceptual hashing
- Custom similarity strategies (plugin API)

---

## 14. Development Setup

### 14.1 Prerequisites

- Node.js 18+
- npm or pnpm
- Git

### 14.2 Getting Started

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/obsidian-duplicate-finder.git
cd obsidian-duplicate-finder

# Install dependencies
npm install

# Start development build (with hot reload)
npm run dev

# Create a symlink in your Obsidian vault
# Linux/macOS:
ln -s /path/to/obsidian-duplicate-finder /path/to/vault/.obsidian/plugins/duplicate-finder

# Windows (PowerShell as Admin):
New-Item -ItemType Junction -Path "C:\path\to\vault\.obsidian\plugins\duplicate-finder" -Target "C:\path\to\obsidian-duplicate-finder"
```

### 14.3 Build Commands

```bash
npm run dev          # Development build with watch
npm run build        # Production build
npm run test         # Run tests
npm run test:coverage # Run tests with coverage
```

### 14.4 Project Configuration Files

**`.gitignore`**

```gitignore
# Build output
main.js
*.js.map

# Dependencies
node_modules/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test
coverage/
```

**`.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

## 15. Contributing Guidelines

### 15.1 Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Add JSDoc comments for public APIs
- Use meaningful variable/function names

### 15.2 Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add/update tests
5. Run `npm run test` and `npm run build`
6. Commit with conventional commits: `feat:`, `fix:`, `docs:`, etc.
7. Push and create a Pull Request

### 15.3 Commit Convention

```
feat: add batch delete functionality
fix: handle empty files in scanner
docs: update README with usage examples
refactor: extract common file utilities
test: add integration tests for cache
chore: update dependencies
```

### 15.4 Where to Add New Features

| Feature Type | Location | Notes |
|--------------|----------|-------|
| New similarity algorithm | `src/similarity/` | Implement same interface |
| New filter option | `src/core/ResultStore.ts` | Add to `applyFilters()` |
| New sort option | `src/core/ResultStore.ts` | Add to `applySorting()` |
| New UI component | `src/ui/` | Follow existing patterns |
| New command | `src/main.ts` | In `onload()` |
| New setting | `src/types.ts` + `src/ui/SettingsTab.ts` | Update both |

---

## Appendix A: Algorithm Reference

### A.1 Jaccard Similarity

$$
J(A, B) = \frac{|A \cap B|}{|A \cup B|}
$$

Where A and B are sets of shingles.

### A.2 MinHash Probability

$$
\Pr[\min(h(A)) = \min(h(B))] = J(A, B)
$$

### A.3 Estimation Error

For k hash functions:

$$
\text{Standard Error} = \sqrt{\frac{J(1-J)}{k}}
$$

| k (hashes) | Max Error (95% CI) |
|------------|-------------------|
| 64 | ±12.5% |
| 128 | ±8.8% |
| 256 | ±6.3% |

---

## Appendix B: Obsidian API Reference

### B.1 Key APIs Used

```typescript
// File operations
app.vault.getMarkdownFiles(): TFile[]
app.vault.cachedRead(file: TFile): Promise<string>
app.vault.trash(file: TFile, system: boolean): Promise<void>
app.vault.getAbstractFileByPath(path: string): TAbstractFile | null

// Workspace
app.workspace.getLeaf(split?: boolean | PaneType): WorkspaceLeaf
app.workspace.getLeavesOfType(type: string): WorkspaceLeaf[]
app.workspace.revealLeaf(leaf: WorkspaceLeaf): void
app.workspace.openLinkText(link: string, source: string, newLeaf?: boolean | PaneType): Promise<void>

// Plugin
plugin.addCommand(command: Command): Command
plugin.addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement
plugin.registerView(type: string, factory: ViewCreator): void
plugin.addSettingTab(tab: PluginSettingTab): void
plugin.loadData(): Promise<any>
plugin.saveData(data: any): Promise<void>
```

### B.2 Icon Names

Common Lucide icons available in Obsidian:

- `copy` - Duplicate/copy icon
- `trash-2` - Delete/trash
- `check-circle` - Success/complete
- `alert-triangle` - Warning
- `arrow-up` / `arrow-down` - Sort direction
- `search` - Search
- `settings` - Settings/gear
- `refresh-cw` - Refresh/reload

---

*End of Specification*
