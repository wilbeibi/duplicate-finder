import { App, Plugin, Notice } from 'obsidian';
import { DuplicateFinderSettings, DEFAULT_SETTINGS } from './types';
import { DuplicateFinderSettingsTab } from './settings';
import { ScanService } from './core/ScanService';
import { ResultStore } from './core/ResultStore';
import { ResultsView, RESULTS_VIEW_TYPE } from './ui/ResultsView';
import { ProgressModal } from './ui/ProgressModal';

type AppWithSettings = App & {
	setting: {
		open: () => void;
		openTabById: (id: string) => void;
	};
};

export default class DuplicateFinderPlugin extends Plugin {
	settings: DuplicateFinderSettings;
	
	private scanService: ScanService;
	resultStore: ResultStore;

	async onload() {
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
			name: 'Show results',
			callback: () => this.activateView(),
		});
		
		this.addSettingTab(new DuplicateFinderSettingsTab(this.app, this));
		
		this.addRibbonIcon('copy', 'Scan for duplicates', () => this.runScan());
	}

	async runScan(): Promise<void> {
		if (this.scanService.isRunning()) {
			new Notice('A scan is already in progress');
			return;
		}
		
		const progressModal = new ProgressModal(
			this.app,
			() => {
				this.scanService.cancel();
			},
			() => {
				this.openSettings();
			}
		);
		progressModal.open();
		
		try {
			const result = await this.scanService.scan((progress) => {
				progressModal.updateProgress(progress);
			});
			
			this.resultStore.setResult(result);
			progressModal.close();

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
			// revealLeaf loads a deferred view; before that, leaf.view is a placeholder.
			await workspace.revealLeaf(leaf);
			if (leaf.view instanceof ResultsView) {
				leaf.view.render();
			}
		}
	}

	openSettings(): void {
		const appWithSettings = this.app as AppWithSettings;
		appWithSettings.setting.open();
		appWithSettings.setting.openTabById(this.manifest.id);
	}

	async loadSettings() {
		const saved = await this.loadData() as Partial<DuplicateFinderSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.scanService?.updateSettings(this.settings);
	}
}