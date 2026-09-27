# Duplicate Finder for Obsidian

Imports, merged folders, and sync conflicts leave copies of the same note scattered around a vault. Duplicate Finder scans your Markdown notes, lists pairs that are identical or nearly identical, and lets you trash the extra copy from a sidebar. Everything runs locally.

<img width="519" height="438" alt="Duplicate Finder results sidebar" src="https://github.com/user-attachments/assets/00065b5b-51a6-4eb7-8d8d-1a1ec0f2f097" />

## Install

In Obsidian, open **Settings → Community plugins → Browse**, search for **Duplicate Finder**, then select **Install** and **Enable**.

<details>
<summary>Install a beta with BRAT, or install manually</summary>

With BRAT:

1. Install and enable **BRAT** from **Settings → Community plugins**.
2. Run **BRAT: Add a beta plugin for testing** from the command palette.
3. Enter `wilbeibi/duplicate-finder`, then select **Add plugin**.
4. Enable **Duplicate Finder** in **Settings → Community plugins**.

Manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/wilbeibi/duplicate-finder/releases/latest).
2. Copy them into `<vault>/.obsidian/plugins/duplicate-finder/`.
3. Reload Obsidian, then enable **Duplicate Finder** in **Settings → Community plugins**.

</details>

## Use

1. Select the ribbon icon, or run **Duplicate Finder: Scan vault for duplicates**. You can cancel a scan; the previous results stay.
2. Review the pairs in the sidebar. Reopen it later with **Duplicate Finder: Show results**.
3. For each pair, select the trash icon on the copy you don't want, or select **Ignore** to hide the pair from future scans.

Each note in a pair shows its folder, size, and created date, with the older copy marked. Sort by similarity, created date, modified date, or file size.

Deleted notes go wherever **Settings → Files and links → Deleted files** sends them (system trash by default), so you can restore a wrong deletion from there.

## How matching works

Frontmatter, line-ending differences, and extra blank lines are removed before comparison.

- **Exact match** (100%): the remaining text is identical.
- **Similar content**: the notes share most of their five-word phrases, ignoring case and punctuation. Chinese, Japanese, and Korean text is compared in five-character runs instead. The score is a MinHash estimate from 64 samples, so expect a few points of noise near your threshold.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Similarity threshold | 90% | Lowest score reported as similar content (50-100%). |
| Minimum content lines | 50 | Skips shorter notes. Lower it to include short notes. |
| Excluded folders | none | Skips these folders and everything inside them, one per line. |
| Excluded patterns | none | Skips paths matching these regular expressions, for example `^daily/`. |

## Limitations

- Desktop only.
- Only Markdown notes are compared; attachments and canvases are not.
- Every note is compared with every other note, so a 5,000-note vault means about 12.5 million comparisons. Large vaults take noticeably longer; exclude folders to speed up scans.
- Ignored pairs are stored by path. Renaming or moving either note shows the pair again.

## Privacy

The plugin makes no network requests and collects no data. It reads notes only to compare them and changes nothing until you select the trash icon.

## License

[0-BSD](LICENSE)
