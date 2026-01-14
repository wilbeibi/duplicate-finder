import { Modal, App } from 'obsidian';
import { ScanProgress } from '../types';

export class ProgressModal extends Modal {
  private progressEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private fileEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private onCancel: () => void;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-progress-modal');

    contentEl.createEl('h3', { text: 'Scanning for duplicates...' });

    this.phaseEl = contentEl.createDiv({ cls: 'df-progress-phase' });
    this.phaseEl.setText('Preparing...');

    const barContainer = contentEl.createDiv({ cls: 'df-progress-bar-container' });
    this.barEl = barContainer.createDiv({ cls: 'df-progress-bar' });

    this.progressEl = contentEl.createDiv({ cls: 'df-progress-text' });
    this.progressEl.setText('0 / 0');

    this.fileEl = contentEl.createDiv({ cls: 'df-progress-file' });

    const cancelBtn = contentEl.createEl('button', {
      text: 'Cancel',
      cls: 'df-cancel-btn',
    });
    cancelBtn.addEventListener('click', () => {
      this.onCancel();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  updateProgress(progress: ScanProgress): void {
    if (!this.progressEl || !this.phaseEl || !this.barEl) return;

    const phaseLabels: Record<string, string> = {
      reading: 'Reading files...',
      hashing: 'Computing signatures...',
      comparing: 'Finding duplicates...',
      complete: 'Complete!',
      cancelled: 'Cancelled',
    };

    this.phaseEl.setText(phaseLabels[progress.phase] ?? progress.phase);
    this.progressEl.setText(`${progress.current} / ${progress.total}`);

    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    this.barEl.style.width = `${pct}%`;

    if (progress.currentFile && this.fileEl) {
      this.fileEl.setText(progress.currentFile);
    }

    if (progress.phase === 'complete' || progress.phase === 'cancelled') {
      setTimeout(() => this.close(), 500);
    }
  }
}
