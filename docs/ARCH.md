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
│  │   ScanService   │  │   ResultStore   │  │ ContentExtractor  │   │
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
│   └── ContentExtractor.ts  # Extracts comparable content from notes
├── similarity/
│   ├── Comparator.ts    # Finds duplicate pairs from signatures
│   ├── ExactHasher.ts   # SHA-256 hashing for exact matches
│   ├── MinHasher.ts     # MinHash algorithm for fuzzy matching
│   └── constants.ts     # Algorithm defaults and cache constants
└── ui/
    ├── ResultsView.ts   # Sidebar view displaying results
    ├── ProgressModal.ts # Progress dialog during scan
    └── ConfirmDeleteModal.ts  # Deletion confirmation dialog
```

## Data flow

### Scan workflow

1. User triggers scan via ribbon icon or command palette
2. `DuplicateFinderPlugin.runScan()` opens `ProgressModal` and calls `ScanService.scan()`
3. `ScanService`:
   - collects markdown files
   - applies folder and regex exclusions
   - reads content and stores it in an in-memory map
4. For each file:
   - `ContentExtractor.extract()` removes frontmatter and normalizes whitespace
   - `ContentExtractor.countLines()` enforces `minContentLines`
   - `ExactHasher.hash()` + `MinHasher.compute()` generate signatures
5. `Comparator.findDuplicates()`:
   - groups exact matches by content hash
   - performs O(n²) MinHash comparisons for fuzzy matches
6. Results stored in `ResultStore`, `ResultsView` renders

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
│  1. ContentExtractor.extract()      │
│  2. Count lines and filter          │
│  3. ExactHasher.hash()              │
│  4. MinHasher.compute()             │
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
- Manages lifecycle (`onload`, `onunload`)
- Registers commands and ribbon icon
- Instantiates core services (`ScanService`, `ResultStore`)
- Registers the custom view (`ResultsView`)

Key responsibilities:
- `loadSettings()` / `saveSettings()`
- `runScan()` orchestrates scanning with `ProgressModal`
- `activateView()` opens or reveals the results panel
- `openSettings()` navigates to the plugin settings tab

### Type definitions (`src/types.ts`)

Central type definitions used across the codebase:

| Type | Purpose |
|------|---------|
| `DuplicateFinderSettings` | User configuration schema |
| `DuplicatePair` | A detected duplicate pair with metadata |
| `ScanProgress` | Progress callback payload |
| `ScanResult` | Final scan output |

### ScanService (`src/core/ScanService.ts`)

Orchestrates the entire scan process:
- Filters files by `excludeFolders` and `excludePatterns`
- Manages cancel flow via `AbortController`
- Coordinates content extraction, hashing, and comparison
- Reports progress and timing via callback

```typescript
class ScanService {
  scan(onProgress?: ScanProgressCallback): Promise<ScanResult>
  cancel(): void
  isRunning(): boolean
  updateSettings(settings: DuplicateFinderSettings): void
}
```

### ResultStore (`src/core/ResultStore.ts`)

In-memory store for scan results:
- Sort by similarity, created date, modified date, or file size
- Filter support by similarity range, method, and folder (UI currently uses sorting only)

```typescript
class ResultStore {
  setResult(result: ScanResult): void
  getDuplicates(sortField, sortOrder, filters?): DuplicatePair[]
  removeByPath(path: string): void
}
```

### ContentExtractor (`src/core/ContentExtractor.ts`)

Prepares note content for comparison:
- Removes YAML frontmatter
- Normalizes line endings and whitespace
- Counts lines for `minContentLines`

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
- Splits content into word-based shingles (default: 5 words)
- Computes MinHash signature (default: 64 hash functions)
- Uses FNV-1a for shingle hashing + linear hash family

```typescript
class MinHasher {
  compute(content: string): number[]  // Returns signature array
  estimateSimilarity(sigA: number[], sigB: number[]): number
}
```

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
- Header with scan button and stats
- Sort controls (field + order toggle)
- Card-based display of duplicate pairs
- Folder link to reveal items in file explorer
- Optional hint to hide a dominant folder from results
- Delete button per file (triggers confirmation)

#### ProgressModal

Modal dialog during scan:
- Phase indicator (reading/hashing/comparing)
- Progress bar with percentage and current file
- Elapsed and estimated remaining time
- Cancel and "Open settings" actions

#### ConfirmDeleteModal

Confirmation dialog before file deletion:
- Shows file to delete and file to keep
- Cancel and "Move to Trash" buttons

## Settings

Defined in `DuplicateFinderSettings`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `similarityThreshold` | number | 0.9 | Minimum similarity (0-1) |
| `minContentLines` | number | 100 | Skip notes shorter than this |
| `excludeFolders` | string[] | [] | Folders to skip |
| `excludePatterns` | string[] | [] | Regex patterns to exclude |

## Performance considerations

- **O(n²) comparison**: `Comparator` compares all pairs. Large vaults can be slow.
- **No persistent cache**: Signatures are recomputed every scan.
- **In-memory content map**: File contents are read once and reused for hashing.
- **Progress reporting**: Emits progress every 50 comparisons to keep UI responsive.
- **Abort support**: `AbortController` allows cancellation at any point.

## Extension points

### Adding a new detection method

1. Create a new hasher in `src/similarity/`
2. Add detection method to `DetectionMethod` type in `types.ts`
3. Integrate into `ScanService.computeSignature()` and `Comparator.findDuplicates()`

### Adding result filters

1. Extend `FilterOptions` in `ResultStore.ts`
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
