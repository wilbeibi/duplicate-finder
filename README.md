# Duplicate Finder for Obsidian

Duplicate Finder helps you quickly spot and clean up duplicate notes in your Obsidian vault. It finds exact matches with SHA-256 and near-duplicates with MinHash similarity, then shows results in a dedicated sidebar so you can decide what to keep. Everything runs locally.

Use it when you import notes, merge folders, or notice repeated content. You can scan the whole vault, sort results, and remove extra copies with a confirmation step.


<img width="519" height="438" alt="Screenshot 2026-01-22 at 8 56 05 AM" src="https://github.com/user-attachments/assets/00065b5b-51a6-4eb7-8d8d-1a1ec0f2f097" />

## Highlights

- Exact and similar match detection in one scan
- Sidebar results with sorting and clear match labels
- Folder and pattern exclusions to keep scans focused
- Safe deletion with a confirmation dialog

## Trust and privacy

- Runs locally inside Obsidian; no network calls
- No telemetry or data collection
- Scans only Markdown files in your vault

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create `<vault>/.obsidian/plugins/duplicate-finder/`.
3. Copy the files into that folder.
4. Reload Obsidian.
5. Enable the plugin in **Settings → Community plugins**.

### Install with BRAT

1. Install **BRAT** in **Settings → Community plugins**.
2. Open the command palette and run **BRAT: Add a beta plugin for testing**.
3. Enter the repository in the format `owner/repo` (for example, `wilbeibi/duplicate-finder`).
4. Select **Add plugin** and wait for BRAT to finish.
5. Refresh the plugin list in **Settings → Community plugins**.
6. Enable **Duplicate Finder**.

## Use

1. Click the ribbon icon (copy icon), or run **Duplicate Finder: Scan vault for duplicates**.
2. Open **Duplicate Finder: Show duplicate finder results** to review matches.
3. Select the trash icon to remove a duplicate.

## WARNING: deletion risk

**WARNING**: Moving a note to trash can cause data loss if you delete the wrong file. Confirm the file name and path before you delete.

## Settings

- **Similarity threshold**: Minimum similarity to treat notes as duplicates (50-100%).
- **Minimum content lines**: Skip short notes.
- **Excluded folders**: Skip entire folders.
- **Excluded patterns**: Skip files that match regex patterns.

## Terms

- **Frontmatter**: The YAML block between `---` lines at the top of a note. It is removed before comparison.
- **Exact match**: Notes with identical content after cleanup.
- **Similar match**: Notes with high MinHash similarity.
