import MyPlugin from "./main";
import { App, PluginSettingTab, Setting, Notice, FileSystemAdapter, debounce } from "obsidian";
import { FolderSuggest } from "./suggesters/FolderSuggester"
import { t } from "./i18n";


export class SettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	private debouncedSave = debounce(
		async () => { await this.plugin.saveSettings(); },
		500,
		true
	);
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl, plugin } = this;
		const { settings } = plugin;

		containerEl.empty();
		const s = t();

		new Setting(containerEl).setName(s.pluginTitle).setHeading();
		new Setting(containerEl).setName(s.sectionImportLibrary).setHeading();

		new Setting(containerEl)
			.setName(s.zoteroDbPathName)
			.setDesc(s.zoteroDbPathDesc)
			.addText((text) =>
				text
					.setPlaceholder(s.zoteroDbPathPlaceholder)
					.setValue(settings.zoteroDbPath)
					.onChange(async (value) => {
						settings.zoteroDbPath = value;
						this.debouncedSave();
					})
			);

		new Setting(containerEl)
			.setName(s.cacheStatusName)
			.setDesc(s.cacheStatusDesc)
			.addExtraButton((button) => {
				button.setIcon("sync")
					.setTooltip(s.cacheRebuildTooltip)
					.onClick(async () => {
						if (!settings.zoteroDbPath) {
							new Notice(s.cacheSetPathFirst);
							return;
						}
						new Notice(s.cacheRebuilding);
						try {
							const { clearCacheManager, getCacheManager } = await import("./zotero-cache");
							const { readZoteroDatabase } = await import("./zotero-db");
							// Clear old cache
							clearCacheManager();
							const cacheManager = getCacheManager(this.app, settings.zoteroDbPath);
						await cacheManager.clearCache();
							// Get plugin directory path
							const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter ? this.app.vault.adapter.getBasePath() : "";
							const pluginDir = vaultBasePath && this.plugin.manifest.dir
							? vaultBasePath + "/" + this.plugin.manifest.dir
								: this.plugin.manifest.dir || "";
							// Full read from Zotero database
							const data = await readZoteroDatabase(settings.zoteroDbPath, pluginDir);
							cacheManager.updateCache(data.items, data.collections);
							await cacheManager.saveCache();
							new Notice(s.cacheRebuiltSuccess(data.items.length));
							this.display();
						} catch (e) {
							new Notice(s.cacheRebuildFailed + (e as Error).message);
							console.error("[BibNotes] Cache rebuild error:", e);
						}
					});
			})
			.addText((text) => {
				text.setDisabled(true);
				import("./zotero-cache").then(({ getCacheManager }) => {
					const cacheManager = getCacheManager(this.app, settings.zoteroDbPath);
					const stats = cacheManager.getCacheStats();
					if (stats.itemCount > 0) {
						text.setValue(s.cacheItemsCached(stats.itemCount));
					} else {
						text.setValue(s.cacheNone);
					}
				});
			});

		new Setting(containerEl).setName(s.sectionExportNotes).setHeading();

		new Setting(containerEl)
			.setName(s.exportPathName)
			.setDesc(s.exportPathDesc)
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder(s.exportPathPlaceholder)
					.setValue(this.plugin.settings.exportPath)
					.onChange(async (new_folder) => {
					settings.exportPath = new_folder;
						await plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName(s.noteTitleName)
			.setDesc(s.noteTitleDesc)
			.addText((text) =>
				text
					.setPlaceholder(s.noteTitlePlaceholder)
					.setValue(settings.exportTitle)
					.onChange(async (value) => {
						settings.exportTitle = value;
						this.debouncedSave();
					})
			);

		new Setting(containerEl)
			.setName(s.selectTemplateName)
			.setDesc(s.selectTemplateDesc)
			.addDropdown((d) => {
				d.addOption("Plain", s.templatePlain);
				d.addOption("Admonition", s.templateAdmonition);
				d.addOption("Custom", s.templateCustom);
				//d.addOption("Import from Note", "Import from Note");
				d.setValue(settings.templateType);
				d.onChange(
					async (
						v:
							| "Plain"
							| "Admonition"
							| "Custom"
					) => {
						settings.templateType = v;
						await plugin.saveSettings();
						this.display();
					}
				);
			});
		if (settings.templateType === "Custom") {
			new Setting(containerEl)
				.setName(s.customTemplateName)
				.addTextArea((text) => {
					text.inputEl.rows = 10;
					// this is not strictly necessary, but it makes it a lot easier to read long lines
					text.inputEl.setCssProps({ "width": "100%" });
					text.setValue(settings.templateContent).onChange(
						async (value) => {
							settings.templateContent = value;
							this.debouncedSave();
							//this.display();
						}
					);
				});
		}

		new Setting(containerEl)
			.setName(s.missingFieldsName)
			.setDesc(s.missingFieldsDesc)
			.addDropdown((d) => {
				d.addOption("Leave placeholder", s.missingFieldLeavePlaceholder);
				d.addOption("Remove (entire row)", s.missingFieldRemoveRow);
				d.addOption("Replace with custom text", s.missingFieldReplaceCustom);
				d.setValue(settings.missingfield);
				d.onChange(
					async (
						v:
							| "Leave placeholder"
							| "Remove (entire row)"
							| "Replace with custom text"
					) => {
						settings.missingfield = v;
						await plugin.saveSettings();
						this.display();
					}
				);
			});
		if (settings.missingfield === "Replace with custom text") {
			new Setting(containerEl)
				.setName(s.missingFieldReplacementName)
				.addText((text) =>
					text
						.setValue(settings.missingfieldreplacement)
						.onChange(async (value) => {
							settings.missingfieldreplacement = value;
							this.debouncedSave();
						})
				);
		}

		new Setting(containerEl)
			.setName(s.multipleEntriesDividerName)
			.setDesc(s.multipleEntriesDividerDesc)
			.addTextArea((text) =>
				text
					.setValue(settings.multipleFieldsDivider)
					.onChange(async (value) => {
						settings.multipleFieldsDivider = value;
					this.debouncedSave();
					})
			);

		new Setting(containerEl)
			.setName(s.formatNamesName)
			.setDesc(s.formatNamesDesc)
			.addTextArea((text) =>
				text
					.setValue(settings.nameFormat)
					.onChange(async (value) => {
						settings.nameFormat = value;
						await plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(s.saveManualEditsName)
			.setDesc(s.saveManualEditsDesc)
			.addDropdown((d) => {
				d.addOption("Save Entire Note", s.saveEntireNote);
				d.addOption("Select Section", s.selectSection);
				d.addOption("Overwrite Entire Note", s.overwriteEntireNote);
				d.setValue(settings.saveManualEdits);
				d.onChange(
					async (
						v:
							| "Save Entire Note"
							| "Select Section"
							| "Overwrite Entire Note"
					) => {
						settings.saveManualEdits = v;
						await plugin.saveSettings();
						this.display();
					}
				);
			});

		if (settings.saveManualEdits == "Select Section") {
			new Setting(containerEl)
				.setName(s.saveManualEditsStartName)
				.setDesc(s.saveManualEditsStartDesc)
				.addText((text) =>
					text
						.setValue(settings.saveManualEditsStart)
						.onChange(async (value) => {
							settings.saveManualEditsStart = value;
							this.debouncedSave();
						})
				);

			if (settings.saveManualEdits) {
				new Setting(containerEl)
					.setName(s.saveManualEditsEndName)
					.setDesc(s.saveManualEditsEndDesc)
					.addText((text) =>
						text
							.setValue(settings.saveManualEditsEnd)
							.onChange(async (value) => {
								settings.saveManualEditsEnd = value;
								this.debouncedSave();
							})
					);
			}
		}

		new Setting(containerEl).setName(s.sectionUpdateLibrary).setHeading();

		new Setting(containerEl)
			.setName(s.updateExistingAllName)
			.setDesc(s.updateExistingAllDesc)
			.addDropdown((d) => {
				d.addOption("Only update existing notes", s.onlyUpdateExisting);
				d.addOption("Create new notes when missing", s.createNewWhenMissing);
				d.setValue(settings.updateLibrary);
				d.onChange(
					async (
						v:
							| "Only update existing notes"
							| "Create new notes when missing"
					) => {
						settings.updateLibrary = v;
						await plugin.saveSettings();
					}
				);
			});
	}
}
