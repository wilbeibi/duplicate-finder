import { TFile } from 'obsidian';

// ============================================
// Configuration
// ============================================

export interface DuplicateFinderSettings {
  // Scan scope
  excludeFolders: string[];        // Folders to skip (e.g., "templates")
  excludePatterns: string[];       // Regex patterns (e.g., "^daily/.*")
  minContentLines: number;         // Skip tiny notes (default: 5 lines)
  
  // Similarity tuning
  similarityThreshold: number;     // 0.0 - 1.0 (default: 0.7)
}

export const DEFAULT_SETTINGS: DuplicateFinderSettings = {
  excludeFolders: [],
  excludePatterns: [],
  minContentLines: 100,
  similarityThreshold: 0.9,
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