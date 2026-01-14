import { Plugin, Notice } from 'obsidian';
import { DuplicateFinderSettings, DEFAULT_SETTINGS } from './types';
import { DuplicateFinderSettingsTab } from './settings';
import { ScanService } from './core/ScanService';
import { ResultStore } from './core/ResultStore';
import { ResultsView, RESULTS_VIEW_TYPE } from './ui/ResultsView';
import { ProgressModal } from './ui/ProgressModal';

export default class DuplicateFinderPlugin extends Plugin {
	settings: DuplicateFinderSettings;
	
	private scanService: ScanService;
	resultStore: ResultStore;

	async onload() {
		console.log('Loading Duplicate Finder plugin');
		
		await this.loadSettings();
		
		this.resultStore = new ResultStore();
		this.scanService = new ScanService(this.app, this.settings);
		
		this.registerView(
			RESULTS_VIEW_TYPE,
			(leaf) => new ResultsView(leaf, this)
		);
		
		this.addCommand({
			id: 'scan-vault',
			name: 'Scan vault for duplicates',
			callback: () => this.runScan(),
		});
		
		this.addCommand({
			id: 'show-results',
			name: 'Show duplicate finder results',
			callback: () => this.activateView(),
		});
		
		this.addSettingTab(new DuplicateFinderSettingsTab(this.app, this));
		
		this.addRibbonIcon('copy', 'Scan for duplicates', () => this.runScan());
	}

	onunload() {
		console.log('Unloading Duplicate Finder plugin');
		this.app.workspace.detachLeavesOfType(RESULTS_VIEW_TYPE);
	}

	async runScan(): Promise<void> {
		if (this.scanService.isRunning()) {
			new Notice('A scan is already in progress');
			return;
		}
		
		const progressModal = new ProgressModal(this.app, () => {
			this.scanService.cancel();
		});
		progressModal.open();
		
		try {
			const result = await this.scanService.scan((progress) => {
				progressModal.updateProgress(progress);
			});
			
			this.resultStore.setResult(result);
			
			await this.activateView();
			
			if (result.duplicates.length > 0) {
				new Notice(`Found ${result.duplicates.length} duplicate pairs`);
			} else {
				new Notice('No duplicates found!');
			}
		} catch (error) {
			progressModal.close();
			console.error('Scan failed:', error);
			new Notice('Scan failed. Check console for details.');
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		
		let leaf = workspace.getLeavesOfType(RESULTS_VIEW_TYPE)[0];
		
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: RESULTS_VIEW_TYPE, active: true });
			}
		}
		
		if (leaf) {
			workspace.revealLeaf(leaf);
			const view = leaf.view as ResultsView;
			view.render();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.scanService?.updateSettings(this.settings);
	}
}