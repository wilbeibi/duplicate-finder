# Architecture

This document describes the architecture and code organization of the Duplicate Finder plugin.

## High-level overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User Interface                            │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────────┐ │
│  │ ResultsView  │  │ ProgressModal │  │ ConfirmDeleteModal        │ │
│  └──────────────┘  └───────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Core Services                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │   ScanService   │  │   ResultStore   │  │   CacheService    │   │
│  └─────────────────┘  └─────────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Similarity Detection                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │   ExactHasher   │  │    MinHasher    │  │    Comparator     │   │
│  └─────────────────┘  └─────────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Content Processing                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     ContentExtractor                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory structure

```
src/
├── main.ts              # Plugin entry point, lifecycle management
├── settings.ts          # Settings tab UI
├── types.ts             # TypeScript interfaces and types
├── core/
│   ├── ScanService.ts   # Orchestrates the scan workflow
│   ├── ResultStore.ts   # In-memory result storage with sort/filter
│   ├── CacheService.ts  # IndexedDB persistence for signatures
│   └── ContentExtractor.ts  # Extracts comparable content from notes
├── similarity/
│   ├── Comparator.ts    # Finds duplicate pairs from signatures
│   ├── ExactHasher.ts   # SHA-256 hashing for exact matches
│   ├── MinHasher.ts     # MinHash algorithm for fuzzy matching
│   └── constants.ts     # Default algorithm parameters
└── ui/
    ├── ResultsView.ts   # Sidebar view displaying results
    ├── ProgressModal.ts # Progress dialog during scan
    └── ConfirmDeleteModal.ts  # Deletion confirmation dialog
```

## Data flow

### Scan workflow

1. User triggers scan via ribbon icon or command palette
2. `DuplicateFinderPlugin.runScan()` opens `ProgressModal` and calls `ScanService.scan()`
3. `ScanService` filters files by exclusion rules and iterates:
   - Check `CacheService` for fresh cached signature
   - If cache miss: read file → `ContentExtractor.extract()` → `ExactHasher.hash()` + `MinHasher.compute()`
   - Store new signatures in cache
4. `Comparator.findDuplicates()` performs:
   - Group by `contentHash` for exact matches
   - O(n²) MinHash comparison for fuzzy matches above threshold
5. Results stored in `ResultStore`, `ResultsView` renders

```
User Action
    │
    ▼
┌───────────────────┐
│  ScanService.scan │
└─────────┬─────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  For each file:                     │
│  1. CacheService.getIfFresh(path)   │
│  2. If miss: computeSignature()     │
│     - ContentExtractor.extract()    │
│     - ExactHasher.hash()            │
│     - MinHasher.compute()           │
│  3. CacheService.setMany()          │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Comparator.findDuplicates()        │
│  - Group exact matches by hash      │
│  - O(n²) MinHash similarity check   │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  ResultStore.setResult()            │
│  ResultsView.render()               │
└─────────────────────────────────────┘
```

## Key components

### Plugin entry (`src/main.ts`)

The `DuplicateFinderPlugin` class:
- Manages plugin lifecycle (`onload`, `onunload`)
- Registers commands and ribbon icon
- Instantiates core services (`ScanService`, `ResultStore`)
- Registers the custom view (`ResultsView`)

```typescript
// Key responsibilities
- loadSettings() / saveSettings()
- runScan() - orchestrates scan with progress modal
- activateView() - opens/reveals results panel
```

### Type definitions (`src/types.ts`)

Central type definitions used across the codebase:

| Type | Purpose |
|------|---------|
| `DuplicateFinderSettings` | User configuration schema |
| `DuplicatePair` | A detected duplicate pair with metadata |
| `NoteSignature` | Cached signature (hash + minhash) for a note |
| `ScanProgress` | Progress callback payload |
| `ScanResult` | Final scan output |

### ScanService (`src/core/ScanService.ts`)

Orchestrates the entire scan process:
- Filters files by `excludeFolders` and `excludePatterns`
- Manages abort/cancel via `AbortController`
- Coordinates caching, hashing, and comparison
- Reports progress via callback

```typescript
class ScanService {
  scan(onProgress?: ScanProgressCallback): Promise<ScanResult>
  cancel(): void
  isRunning(): boolean
  updateSettings(settings: DuplicateFinderSettings): void
}
```

### CacheService (`src/core/CacheService.ts`)

IndexedDB-backed persistence for signatures:
- Database: `duplicate-finder-cache`
- Object store: `signatures` (keyed by file path)
- Invalidation: compares stored `mtime` with current file `mtime`

```typescript
class CacheService {
  getIfFresh(path: string, currentMtime: number): Promise<NoteSignature | null>
  setMany(signatures: NoteSignature[]): Promise<void>
  clear(): Promise<void>
}
```

### ResultStore (`src/core/ResultStore.ts`)

In-memory store for scan results with query capabilities:
- Sort by: similarity, created date, modified date, file size
- Filter by: similarity range, detection method, folder

```typescript
class ResultStore {
  setResult(result: ScanResult): void
  getDuplicates(sortField, sortOrder, filters?): DuplicatePair[]
  removeByPath(path: string): void  // Used after deletion
}
```

### ContentExtractor (`src/core/ContentExtractor.ts`)

Prepares note content for comparison:
- Removes YAML frontmatter
- Normalizes line endings and whitespace
- Returns clean content for hashing

### Similarity algorithms (`src/similarity/`)

#### ExactHasher

SHA-256 hashing via Web Crypto API:
```typescript
class ExactHasher {
  hash(content: string): Promise<string>  // Returns hex string
}
```

#### MinHasher

Locality-sensitive hashing for fuzzy matching:
- Splits content into word-based shingles (default: 3 words)
- Computes MinHash signature (default: 128 hash functions)
- Uses FNV-1a for shingle hashing + linear hash family

```typescript
class MinHasher {
  compute(content: string): number[]  // Returns signature array
  estimateSimilarity(sigA: number[], sigB: number[]): number  // Jaccard estimate
}
```

**Algorithm parameters** (configurable in settings):
- `shingleSize`: Words per shingle (default: 3)
- `numHashFunctions`: Signature length (default: 128)

#### Comparator

Finds duplicate pairs from a map of signatures:
1. Groups by `contentHash` for O(1) exact match detection
2. Performs O(n²) pairwise MinHash comparison for fuzzy matches
3. Respects `similarityThreshold` setting

```typescript
class Comparator {
  findDuplicates(
    signatures: Map<string, NoteSignature>,
    getFileByPath: (path: string) => TFile | null,
    abortSignal: AbortSignal,
    onProgress?: ScanProgressCallback
  ): Promise<DuplicatePair[]>
}
```

### UI components (`src/ui/`)

#### ResultsView

Custom Obsidian `ItemView` for the results panel:
- Header with scan button and statistics
- Sort controls (field + order toggle)
- Card-based display of duplicate pairs
- File links, metadata, age indicators
- Delete button per file (triggers confirmation)

#### ProgressModal

Modal dialog during scan:
- Phase indicator (reading/hashing/comparing)
- Progress bar with percentage
- Current file path
- Cancel button

#### ConfirmDeleteModal

Confirmation dialog before file deletion:
- Shows file to delete and file to keep
- Cancel and "Move to Trash" buttons

## Settings

Defined in `DuplicateFinderSettings` interface:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `similarityThreshold` | number | 0.9 | Minimum similarity (0-1) |
| `minContentLength` | number | 50 | Skip notes shorter than this |
| `excludeFolders` | string[] | [] | Folders to skip |
| `excludePatterns` | string[] | [] | Regex patterns to exclude |
| `cacheEnabled` | boolean | true | Enable IndexedDB caching |
| `shingleSize` | number | 3 | Words per shingle |
| `numHashFunctions` | number | 128 | MinHash signature size |

## Performance considerations

- **O(n²) comparison**: The `Comparator` must compare all pairs. For large vaults (>10k notes), this can be slow.
- **Caching**: Signatures are cached in IndexedDB and reused if file `mtime` unchanged.
- **Progress reporting**: Reports every 50 comparisons to avoid UI blocking.
- **Abort support**: `AbortController` allows cancellation at any point.

## Extension points

### Adding a new detection method

1. Create new hasher in `src/similarity/` implementing signature generation
2. Add detection method to `DetectionMethod` type in `types.ts`
3. Integrate into `ScanService.computeSignature()` and `Comparator.findDuplicates()`

### Adding result filters

1. Extend `FilterOptions` interface in `ResultStore.ts`
2. Implement filter logic in `ResultStore.applyFilters()`
3. Add UI controls in `ResultsView.renderSortControls()`

### Adding new UI panels

1. Create new `ItemView` subclass in `src/ui/`
2. Register view type in `main.ts` via `registerView()`
3. Add command to activate the view

## Testing

Tests are located in `tests/` using Vitest:
- `MinHasher.test.ts` - Shingle creation and similarity estimation
- `ExactHasher.test.ts` - SHA-256 hashing
- `ContentExtractor.test.ts` - Frontmatter removal and normalization

Run tests:
```bash
npm test
```

## Build artifacts

The build produces:
- `main.js` - Bundled JavaScript (esbuild)
- `manifest.json` - Plugin metadata
- `styles.css` - UI styles

These must be placed in `<vault>/.obsidian/plugins/duplicate-finder/` for Obsidian to load the plugin.
