# Duplicate Finder for Obsidian

Find and manage duplicate notes in your Obsidian vault using exact matching and fuzzy similarity detection.

## Features

- **Exact duplicate detection**: Finds notes with identical content using SHA-256 hashing
- **Fuzzy duplicate detection**: Discovers similar notes using MinHash algorithm
- **Results panel**: Browse duplicate pairs in a dedicated sidebar view
- **Sort & filter**: Sort results by similarity, creation date, modified date, or file size
- **Safe deletion**: Move duplicates to trash with confirmation dialog
- **Progress tracking**: Visual progress bar with cancellation support
- **Signature caching**: IndexedDB caching for faster rescans

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder: `<vault>/.obsidian/plugins/duplicate-finder/`
3. Copy the downloaded files into the folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community plugins

## Usage

### Scan for duplicates

- Click the ribbon icon (copy icon) in the left sidebar, or
- Use command palette: "Duplicate Finder: Scan vault for duplicates"

### View results

Results appear in a sidebar panel showing:
- Similarity percentage badge
- Match type (exact or similar)
- File names with clickable links
- File path, size, and creation date
- Age indicator (older/newer)

### Delete duplicates

Click the trash icon next to any file to move it to trash. The other file in the pair will be kept.

### Settings

Configure the plugin in Settings → Duplicate Finder:

| Setting | Description | Default |
|---------|-------------|---------|
| Similarity threshold | Minimum similarity to consider as duplicate (50-100%) | 70% |
| Minimum content length | Skip notes shorter than this (characters) | 50 |
| Excluded folders | Folders to skip when scanning | (none) |
| Excluded patterns | Regex patterns to exclude | (none) |
| Enable cache | Cache signatures for faster rescans | Enabled |
| Shingle size | Words per shingle for fuzzy matching | 3 |
| Number of hash functions | MinHash signature size | 128 |

## How it works

### Exact matching
Notes are hashed using SHA-256. Identical hashes indicate exact duplicates.

### Fuzzy matching
The MinHash algorithm estimates Jaccard similarity between notes:
1. Content is split into word-based shingles
2. Each shingle is hashed using multiple hash functions
3. The minimum hash value for each function forms the signature
4. Signature overlap estimates content similarity

## Limitations

- Desktop only (v0.1)
- Performance: O(n²) comparison for n notes
- Recommended for vaults under 10,000 notes
- YAML frontmatter is excluded from comparison

## Development

```bash
npm install
npm run dev     # Watch mode
npm run build   # Production build
npm test        # Run tests
```

## License

MIT
