import { App, PluginSettingTab, Setting } from "obsidian";
import { DuplicateFinderSettings, DEFAULT_SETTINGS } from "./types";
import type DuplicateFinderPlugin from "./main";

export class DuplicateFinderSettingsTab extends PluginSettingTab {
	plugin: DuplicateFinderPlugin;
	private saveTimer: number | null = null;

	constructor(app: App, plugin: DuplicateFinderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}, 400);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Duplicate Finder Settings' });

		new Setting(containerEl)
			.setName('Scan for duplicates')
			.setDesc('Run a scan with current settings to find duplicate files')
			.addButton(button => button
				.setButtonText('Scan now')
				.setCta()
				.onClick(async () => {
					await this.plugin.runScan();
				})
			);

		new Setting(containerEl)
			.setName('Similarity threshold')
			.setDesc('Minimum similarity percentage to consider as duplicate (50-100%, default: 90%)')
			.addSlider(slider => slider
				.setLimits(50, 100, 5)
				.setValue(this.plugin.settings.similarityThreshold * 100)
				.setDynamicTooltip()
				.onChange((value) => {
					this.plugin.settings.similarityThreshold = value / 100;
					this.scheduleSave();
				})
			);

		new Setting(containerEl)
			.setName('Minimum content lines')
			.setDesc('Skip notes with fewer lines than this (default: 100)')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(this.plugin.settings.minContentLines))
				.onChange((value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.minContentLines = num;
						this.scheduleSave();
					}
				})
			);

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Folders to skip when scanning (one per line)')
			.addTextArea(text => text
				.setPlaceholder('templates\narchive\ndaily')
				.setValue(this.plugin.settings.excludeFolders.join('\n'))
				.onChange((value) => {
					this.plugin.settings.excludeFolders = value
						.split('\n')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					this.scheduleSave();
				})
			);

		new Setting(containerEl)
			.setName('Excluded patterns')
			.setDesc('Regex patterns to exclude (one per line)')
			.addTextArea(text => text
				.setPlaceholder('^daily/.*\n\\.excalidraw$')
				.setValue(this.plugin.settings.excludePatterns.join('\n'))
				.onChange((value) => {
					this.plugin.settings.excludePatterns = value
						.split('\n')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					this.scheduleSave();
				})
			);
	}
}

export { DEFAULT_SETTINGS } from './types';
export type { DuplicateFinderSettings } from './types';
