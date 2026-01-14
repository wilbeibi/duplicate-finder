import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { DuplicatePair } from '../types';
import { ResultStore, SortField, SortOrder } from '../core/ResultStore';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import type DuplicateFinderPlugin from '../main';

export const RESULTS_VIEW_TYPE = 'duplicate-finder-results';

export class ResultsView extends ItemView {
  private plugin: DuplicateFinderPlugin;
  private resultStore: ResultStore;
  
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

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'df-header' });
    
    const titleRow = header.createDiv({ cls: 'df-title-row' });
    titleRow.createEl('h4', { text: 'Duplicate Finder' });
    
    const scanBtn = titleRow.createEl('button', { 
      cls: 'df-scan-btn',
      text: 'Scan Vault' 
    });
    scanBtn.addEventListener('click', () => this.plugin.runScan());
    
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
      
      // Display detailed timing if available
      if (result.timing) {
        const timingRow = header.createDiv({ cls: 'df-timing-row' });
        
        const scanTime = (result.timing.signatureComputingMs / 1000).toFixed(2);
        const compareTime = (result.timing.duplicateComparingMs / 1000).toFixed(2);
        const avgFileTime = result.timing.averageFileProcessingMs.toFixed(2);
        const avgCompTime = (result.timing.averageComparisonMs * 1000).toFixed(2);
        
        timingRow.createSpan({ 
          text: `Scan: ${scanTime}s (${avgFileTime}ms/file)`,
          cls: 'df-timing-stat'
        });
        timingRow.createSpan({ 
          text: `Compare: ${compareTime}s (${avgCompTime}μs/comp)`,
          cls: 'df-timing-stat'
        });
        timingRow.createSpan({ 
          text: `${result.timing.totalComparisons.toLocaleString()} comparisons`,
          cls: 'df-timing-stat'
        });
      }
      
      this.renderSortControls(header);
    }
  }

  private renderSortControls(header: HTMLElement): void {
    const sortRow = header.createDiv({ cls: 'df-sort-row' });
    
    sortRow.createSpan({ text: 'Sort by: ', cls: 'df-sort-label' });
    
    const sortSelect = sortRow.createEl('select', { cls: 'df-sort-select' });
    
    const options: { value: SortField; label: string }[] = [
      { value: 'similarity', label: 'Similarity' },
      { value: 'created', label: 'Created date' },
      { value: 'modified', label: 'Modified date' },
      { value: 'size', label: 'File size' },
    ];
    
    for (const opt of options) {
      const optEl = sortSelect.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.sortField) {
        optEl.selected = true;
      }
    }
    
    sortSelect.addEventListener('change', () => {
      this.sortField = sortSelect.value as SortField;
      this.render();
    });
    
    const orderBtn = sortRow.createEl('button', {
      cls: 'df-order-btn',
      text: this.sortOrder === 'desc' ? '↓' : '↑',
    });
    orderBtn.setAttribute('aria-label', this.sortOrder === 'desc' ? 'Descending' : 'Ascending');
    
    orderBtn.addEventListener('click', () => {
      this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
      this.render();
    });
  }

  private renderEmptyState(container: HTMLElement): void {
    const empty = container.createDiv({ cls: 'df-empty-state' });
    
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
    
    const cardHeader = card.createDiv({ cls: 'df-card-header' });
    
    const badge = cardHeader.createDiv({ cls: 'df-badge' });
    const pct = Math.round(pair.similarity * 100);
    badge.setText(`${pct}%`);
    badge.addClass(pair.method === 'exact' ? 'df-badge-exact' : 'df-badge-similar');
    
    const methodLabel = cardHeader.createSpan({ cls: 'df-method-label' });
    methodLabel.setText(pair.method === 'exact' ? 'Exact match' : 'Similar content');
    
    const filesContainer = card.createDiv({ cls: 'df-files' });
    
    this.renderFileEntry(filesContainer, pair, 'A');
    this.renderFileEntry(filesContainer, pair, 'B');
  }

  private renderFileEntry(container: HTMLElement, pair: DuplicatePair, label: 'A' | 'B'): void {
    const file = label === 'A' ? pair.fileA : pair.fileB;
    const otherFile = label === 'A' ? pair.fileB : pair.fileA;
    const created = label === 'A' ? pair.metadata.fileACreated : pair.metadata.fileBCreated;
    const otherCreated = label === 'A' ? pair.metadata.fileBCreated : pair.metadata.fileACreated;
    const size = label === 'A' ? pair.metadata.fileASize : pair.metadata.fileBSize;
    
    const entry = container.createDiv({ cls: 'df-file-entry' });
    
    const info = entry.createDiv({ cls: 'df-file-info' });
    
    const nameLink = info.createEl('a', {
      text: file.basename,
      cls: 'df-file-name',
      href: '#'
    });
    nameLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.workspace.openLinkText(file.path, '', false);
    });
    
    const meta = info.createDiv({ cls: 'df-file-meta' });
    
    const folderPath = meta.createEl('a', { 
      text: file.parent?.path ?? '/', 
      cls: 'df-file-path df-folder-link',
      href: '#'
    });
    folderPath.addEventListener('click', (e) => {
      e.preventDefault();
      // Reveal the file in the file explorer
      this.app.workspace.trigger('reveal-file', file);
    });
    
    meta.createSpan({ text: ` • ${this.formatSize(size)}` });
    meta.createSpan({ text: ` • ${this.formatDate(created)}` });
    
    if (created < otherCreated) {
      meta.createSpan({ text: ' (older)', cls: 'df-age-older' });
    } else if (created > otherCreated) {
      meta.createSpan({ text: ' (newer)', cls: 'df-age-newer' });
    }
    
    const actions = entry.createDiv({ cls: 'df-file-actions' });
    const deleteBtn = actions.createEl('button', {
      cls: 'df-delete-btn',
      attr: { 'aria-label': 'Move to trash' }
    });
    deleteBtn.setText('🗑️');
    deleteBtn.addEventListener('click', () => {
      this.confirmDelete(file, otherFile);
    });
  }

  private confirmDelete(file: TFile, otherFile: TFile): void {
    new ConfirmDeleteModal(this.app, file, otherFile, async () => {
      try {
        await this.app.vault.trash(file, true);
        this.resultStore.removeByPath(file.path);
        new Notice(`Moved "${file.basename}" to trash`);
        this.render();
      } catch (error) {
        console.error('Failed to delete file:', error);
        new Notice('Failed to move file to trash');
      }
    }).open();
  }

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