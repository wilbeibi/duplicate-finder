import { App, PluginSettingTab, Setting } from "obsidian";
import { DuplicateFinderSettings, DEFAULT_SETTINGS } from "./types";
import type DuplicateFinderPlugin from "./main";

export class DuplicateFinderSettingsTab extends PluginSettingTab {
	plugin: DuplicateFinderPlugin;

	constructor(app: App, plugin: DuplicateFinderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Duplicate Finder Settings' });

		new Setting(containerEl)
			.setName('Similarity threshold')
			.setDesc('Minimum similarity percentage to consider as duplicate (50-100%)')
			.addSlider(slider => slider
				.setLimits(50, 100, 5)
				.setValue(this.plugin.settings.similarityThreshold * 100)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.similarityThreshold = value / 100;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Minimum content length')
			.setDesc('Skip notes with content shorter than this (characters)')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.plugin.settings.minContentLength))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.minContentLength = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Folders to skip when scanning (one per line)')
			.addTextArea(text => text
				.setPlaceholder('templates\narchive\ndaily')
				.setValue(this.plugin.settings.excludeFolders.join('\n'))
				.onChange(async (value) => {
					this.plugin.settings.excludeFolders = value
						.split('\n')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Excluded patterns')
			.setDesc('Regex patterns to exclude (one per line)')
			.addTextArea(text => text
				.setPlaceholder('^daily/.*\n\\.excalidraw$')
				.setValue(this.plugin.settings.excludePatterns.join('\n'))
				.onChange(async (value) => {
					this.plugin.settings.excludePatterns = value
						.split('\n')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Enable cache')
			.setDesc('Cache signatures for faster rescans (recommended)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cacheEnabled)
				.onChange(async (value) => {
					this.plugin.settings.cacheEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl('h3', { text: 'Advanced' });

		new Setting(containerEl)
			.setName('Shingle size')
			.setDesc('Words per shingle for fuzzy matching (default: 3)')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.shingleSize))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1 && num <= 10) {
						this.plugin.settings.shingleSize = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('Number of hash functions')
			.setDesc('MinHash signature size (default: 128, higher = more accurate but slower)')
			.addText(text => text
				.setPlaceholder('128')
				.setValue(String(this.plugin.settings.numHashFunctions))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 32 && num <= 512) {
						this.plugin.settings.numHashFunctions = num;
						await this.plugin.saveSettings();
					}
				})
			);
	}
}

export { DEFAULT_SETTINGS } from './types';
export type { DuplicateFinderSettings } from './types';