import MyPlugin from "./main";
import { App, PluginSettingTab, Setting, Notice, debounce, SettingDefinitionItem } from "obsidian";
import { FolderSuggest } from "./suggesters/FolderSuggester"
import { t } from "./i18n";
import { resolveZoteroDatabasePath } from "./zotero-path";


export class SettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	private debouncedSave = debounce(
		() => { void this.plugin.saveSettings(); },
		500,
		true
	);
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings for Obsidian 1.13.0+: feeds the settings search
	 * index (and the declarative renderer). Must mirror display().
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = t();
		const { settings } = this.plugin;

		return [
			{
				type: "group",
				heading: s.sectionImportLibrary,
				items: [
					{
						name: s.zoteroDbManualPathName,
						desc: s.zoteroDbPathDesc,
						control: {
							type: "text",
							key: "zoteroDbPath",
							placeholder: s.zoteroDbPathPlaceholder,
						},
					},
					{
						name: s.cacheStatusName,
						desc: s.cacheStatusDesc,
						action: () => {
							void this.rebuildCache();
						},
					},
				],
			},
			{
				type: "group",
				heading: s.sectionExportNotes,
				items: [
					{
						name: s.exportPathName,
						desc: s.exportPathDesc,
						control: {
							type: "folder",
							key: "exportPath",
							placeholder: s.exportPathPlaceholder,
						},
					},
					{
						name: s.noteTitleName,
						desc: s.noteTitleDesc,
						control: {
							type: "text",
							key: "exportTitle",
							placeholder: s.noteTitlePlaceholder,
						},
					},
					{
						name: s.selectTemplateName,
						desc: s.selectTemplateDesc,
						control: {
							type: "dropdown",
							key: "templateType",
							options: {
								"Plain": s.templatePlain,
								"Admonition": s.templateAdmonition,
								"Custom": s.templateCustom,
							},
						},
					},
					{
						name: s.customTemplateName,
						control: {
							type: "textarea",
							key: "templateContent",
							rows: 10,
						},
						visible: () => settings.templateType === "Custom",
					},
					{
						name: s.missingFieldsName,
						desc: s.missingFieldsDesc,
						control: {
							type: "dropdown",
							key: "missingfield",
							options: {
								"Leave placeholder": s.missingFieldLeavePlaceholder,
								"Remove (entire row)": s.missingFieldRemoveRow,
								"Replace with custom text": s.missingFieldReplaceCustom,
							},
						},
					},
					{
						name: s.missingFieldReplacementName,
						control: {
							type: "text",
							key: "missingfieldreplacement",
						},
						visible: () => settings.missingfield === "Replace with custom text",
					},
					{
						name: s.multipleEntriesDividerName,
						desc: s.multipleEntriesDividerDesc,
						control: {
							type: "textarea",
							key: "multipleFieldsDivider",
						},
					},
					{
						name: s.formatNamesName,
						desc: s.formatNamesDesc,
						control: {
							type: "textarea",
							key: "nameFormat",
						},
					},
					{
						name: s.saveManualEditsName,
						desc: s.saveManualEditsDesc,
						control: {
							type: "dropdown",
							key: "saveManualEdits",
							options: {
								"Save Entire Note": s.saveEntireNote,
								"Select Section": s.selectSection,
								"Overwrite Entire Note": s.overwriteEntireNote,
							},
						},
					},
					{
						name: s.saveManualEditsStartName,
						desc: s.saveManualEditsStartDesc,
						control: {
							type: "text",
							key: "saveManualEditsStart",
						},
						visible: () => settings.saveManualEdits === "Select Section",
					},
					{
						name: s.saveManualEditsEndName,
						desc: s.saveManualEditsEndDesc,
						control: {
							type: "text",
							key: "saveManualEditsEnd",
						},
						visible: () => settings.saveManualEdits === "Select Section",
					},
				],
			},
			{
				type: "group",
				heading: s.sectionUpdateLibrary,
				items: [
					{
						name: s.updateExistingAllName,
						desc: s.updateExistingAllDesc,
						control: {
							type: "dropdown",
							key: "updateLibrary",
							options: {
								"Only update existing notes": s.onlyUpdateExisting,
								"Create new notes when missing": s.createNewWhenMissing,
							},
						},
					},
				],
			},
		];
	}

	/**
	 * Re-evaluate conditional settings after a declarative control change.
	 */
	setControlValue(key: string, value: unknown): void | Promise<void> {
		void super.setControlValue(key, value);
		this.update();
	}

	private async rebuildCache(): Promise<void> {
		const s = t();
		const currentZoteroDb = resolveZoteroDatabasePath(this.plugin.settings.zoteroDbPath);
		if (!currentZoteroDb.effectivePath) {
			new Notice(s.cacheSetPathFirst);
			return;
		}
		new Notice(s.cacheRebuilding);
		try {
			const data = await this.plugin.rebuildZoteroCache();
			if (!data) {
				return;
			}
			new Notice(s.cacheRebuiltSuccess(data.items.length));
		} catch (e) {
			new Notice(s.cacheRebuildFailed + (e as Error).message);
		}
	}

		display(): void {
		const { containerEl, plugin } = this;
		const { settings } = plugin;
		const zoteroDb = resolveZoteroDatabasePath(settings.zoteroDbPath);

		containerEl.empty();
		const s = t();

		new Setting(containerEl).setName(s.pluginTitle).setHeading();
		new Setting(containerEl).setName(s.sectionImportLibrary).setHeading();

		const zoteroStatusSetting = new Setting(containerEl)
			.setName(s.zoteroDbPathName)
			.setDesc(
				zoteroDb.source === "manual"
					? s.zoteroDbManualOverrideDesc
					: zoteroDb.defaultPath
						? s.zoteroDbAutoDetectedDesc
						: s.zoteroDbDefaultNotFoundDesc
			)
			.addText((text) => {
				text
					.setDisabled(true)
					.setPlaceholder(s.zoteroDbPathPlaceholder)
					.setValue(zoteroDb.effectivePath ?? "");
			});

		if (zoteroDb.source === "manual") {
			zoteroStatusSetting.addExtraButton((button) => {
				button
					.setIcon("reset")
					.setTooltip(s.zoteroDbClearManualPathTooltip)
					.onClick(async () => {
						settings.zoteroDbPath = "";
						await plugin.saveSettings();
						this.display();
					});
			});
		}

		if (zoteroDb.shouldShowManualPathSetting) {
			new Setting(containerEl)
				.setName(s.zoteroDbManualPathName)
				.setDesc(s.zoteroDbPathDesc)
				.addText((text) =>
					text
						.setPlaceholder(s.zoteroDbPathPlaceholder)
						.setValue(settings.zoteroDbPath)
						.onChange((value) => {
							settings.zoteroDbPath = value;
							this.debouncedSave();
						})
				);
		}

		new Setting(containerEl)
			.setName(s.cacheStatusName)
			.setDesc(s.cacheStatusDesc)
			.addExtraButton((button) => {
				button.setIcon("sync")
					.setTooltip(s.cacheRebuildTooltip)
					.onClick(async () => {
						await this.rebuildCache();
						this.display();
					});
			})
			.addText((text) => {
				text.setDisabled(true);
				void import("./zotero-cache").then(({ getCacheManager }) => {
					const currentZoteroDb = resolveZoteroDatabasePath(settings.zoteroDbPath);
					const cacheManager = getCacheManager(this.app, currentZoteroDb.effectivePath ?? settings.zoteroDbPath);
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
					.onChange((value) => {
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
					text.inputEl.addClass("bibnotes-settings-template-textarea");
					text.setValue(settings.templateContent).onChange(
						(value) => {
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
						.onChange((value) => {
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
				.onChange((value) => {
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

		if (settings.saveManualEdits === "Select Section") {
			new Setting(containerEl)
				.setName(s.saveManualEditsStartName)
				.setDesc(s.saveManualEditsStartDesc)
				.addText((text) =>
					text
						.setValue(settings.saveManualEditsStart)
						.onChange((value) => {
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
							.onChange((value) => {
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
