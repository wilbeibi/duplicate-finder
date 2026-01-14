import { Modal, App, TFile } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
  private file: TFile;
  private otherFile: TFile;
  private onConfirm: () => void;

  constructor(app: App, file: TFile, otherFile: TFile, onConfirm: () => void) {
    super(app);
    this.file = file;
    this.otherFile = otherFile;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('df-confirm-modal');

    contentEl.createEl('h3', { text: 'Move to Trash?' });

    const fileInfo = contentEl.createDiv({ cls: 'df-confirm-file' });
    fileInfo.createEl('strong', { text: this.file.basename });
    fileInfo.createDiv({ text: this.file.path, cls: 'df-confirm-path' });

    const warning = contentEl.createDiv({ cls: 'df-confirm-warning' });
    warning.setText(`This file will be moved to trash. The other file "${this.otherFile.basename}" will be kept.`);

    const buttons = contentEl.createDiv({ cls: 'df-confirm-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const deleteBtn = buttons.createEl('button', {
      text: 'Move to Trash',
      cls: 'mod-warning',
    });
    deleteBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
