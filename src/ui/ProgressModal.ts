import { Modal, App } from 'obsidian';
import { ScanProgress } from '../types';

export class ProgressModal extends Modal {
  private progressEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private fileEl: HTMLElement | null = null;
  private barEl: HTMLElement | null = null;
  private timingEl: HTMLElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private settingsBtn: HTMLButtonElement | null = null;
  private onCancel: () => void;
  private onOpenSettings: () => void;

  constructor(app: App, onCancel: () => void, onOpenSettings: () => void) {
    super(app);
    this.onCancel = onCancel;
    this.onOpenSettings = onOpenSettings;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-progress-modal');

    contentEl.createEl('h3', { text: 'Scanning Markdown files...' });

    this.phaseEl = contentEl.createDiv({ cls: 'df-progress-phase' });
    this.phaseEl.setText('Preparing...');

    const barContainer = contentEl.createDiv({ cls: 'df-progress-bar-container' });
    this.barEl = barContainer.createDiv({ cls: 'df-progress-bar' });

    this.progressEl = contentEl.createDiv({ cls: 'df-progress-text' });
    this.progressEl.setText('0 / 0');

    this.fileEl = contentEl.createDiv({ cls: 'df-progress-file' });
    
    this.timingEl = contentEl.createDiv({ cls: 'df-progress-timing' });

    this.cancelBtn = contentEl.createEl('button', {
      text: 'Cancel',
      cls: 'df-cancel-btn',
    });
    this.cancelBtn.addEventListener('click', () => {
      this.onCancel();
      this.close();
    });

    this.settingsBtn = contentEl.createEl('button', {
      text: 'Open settings',
      cls: 'df-open-settings-btn',
    });
    this.settingsBtn.style.display = 'none';
    this.settingsBtn.addEventListener('click', () => {
      this.onOpenSettings();
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
    
    // Display timing information
    if (progress.timing && this.timingEl) {
      const elapsed = this.formatTime(progress.timing.totalElapsed);
      let timingText = `Elapsed: ${elapsed}`;
      
      if (progress.timing.estimatedRemaining && progress.timing.estimatedRemaining > 0) {
        const remaining = this.formatTime(progress.timing.estimatedRemaining);
        timingText += ` | Remaining: ~${remaining}`;
      }
      
      this.timingEl.setText(timingText);
    }

    if (progress.phase === 'complete' || progress.phase === 'cancelled') {
      if (this.cancelBtn) {
        this.cancelBtn.style.display = 'none';
      }
      if (this.settingsBtn && progress.phase === 'complete') {
        this.settingsBtn.style.display = '';
      }
    }
  }
  
  private formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
