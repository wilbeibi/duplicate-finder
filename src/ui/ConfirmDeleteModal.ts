import { Modal, App, TFile } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
  private file: TFile;
  private otherFile: TFile;
  private onConfirm: () => Promise<void>;

  constructor(app: App, file: TFile, otherFile: TFile, onConfirm: () => Promise<void>) {
    super(app);
    this.file = file;
    this.otherFile = otherFile;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-confirm-modal');

    contentEl.createEl('h3', { text: 'Move to trash?' });

    const fileInfo = contentEl.createDiv({ cls: 'df-confirm-file' });
    fileInfo.createEl('strong', { text: this.file.basename });
    fileInfo.createDiv({ text: this.file.path, cls: 'df-confirm-path' });

    const warning = contentEl.createDiv({ cls: 'df-confirm-warning' });
    warning.setText(`This file will be moved to trash. The other file "${this.otherFile.basename}" will be kept.`);

    const buttons = contentEl.createDiv({ cls: 'df-confirm-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const deleteBtn = buttons.createEl('button', {
      text: 'Move to trash',
      cls: 'mod-warning',
    });
    deleteBtn.addEventListener('click', () => {
      void this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
