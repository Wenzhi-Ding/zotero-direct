import MyPlugin from "./main";
import { App, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "./suggesters/FolderSuggester"


export class SettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl, plugin } = this;
		const { settings } = plugin;

		containerEl.empty();

		containerEl.createEl('h1', { text: 'BibNotes Formatter (for Zotero) ' });
		containerEl.createEl('h2', { text: 'Import Library' });

		new Setting(containerEl)
			.setName("BetterBibTex Json File")
			.setDesc("Add relative path from the vault folder to the *BetterBibTex Json* file to be imported. For instance, add `library.json` if the file (library.json) is in the root folder. Instead, if the file is in a subfolder, specify first the subfolder followed by the name of the file (e.g. 'zotero/library.json' if the json file is located in a subfolder of your vault called 'zotero') ")
			.addText((text) =>
				text
					.setPlaceholder("/path/to/BetterBibTex.json")
					.setValue(settings.bibPath)
					.onChange(async (value) => {
						console.log("Path Bib: " + value);
						settings.bibPath = value;
						await plugin.saveSettings();
					})
			);



		containerEl.createEl('h2', { text: 'Export Notes' });

		new Setting(containerEl)
			.setName("Export Path")
			.setDesc("Add the relative path to the folder inside your vault where the notes will be exported")
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder("Example: folder1/folder2")
					.setValue(this.plugin.settings.exportPath)
					.onChange(async (new_folder) => {
						settings.exportPath = new_folder;
						await plugin.saveSettings();
					});
				// @ts-ignore
			})

		new Setting(containerEl)
			.setName("Note Title")
			.setDesc("Select the format of the title of the note. Possible values include: {{citeKey}}, {{title}}, {{author}},{{authorInitials}}, {{authorFullName}} {{year}}")
			.addText((text) =>
				text
					.setPlaceholder("{{citeKey}}")
					.setValue(settings.exportTitle)
					.onChange(async (value) => {
						settings.exportTitle = value;
						await plugin.saveSettings();
					})
			);








		new Setting(containerEl)
			.setName("Select Template")
			.setDesc(
				"Select one of the default templates or provide a custom one."
			)
			.addDropdown((d) => {
				d.addOption("Plain", "Plain");
				d.addOption("Admonition", "Admonition");
				d.addOption("Custom", "Custom Template");
				//d.addOption("Import from Note", "Import from Note");
				d.setValue(settings.templateType);
				d.onChange(
					async (
						v:
							| "Plain"
							| "Admonition"
							| "Custom"
						//| "Import from Note"
					) => {
						settings.templateType = v;
						await plugin.saveSettings();
						this.display();

					}
				);
			}
			);
		if (settings.templateType === "Custom") {
			new Setting(containerEl)
				.setName('Custom Template')
				.addTextArea((text) => {
					text.inputEl.rows = 10;
					// this is not strictly necessary, but it makes it a lot easier to read long lines
					text.inputEl.style.width = "100%";
					text.setValue(settings.templateContent).onChange(
						async (value) => {
							settings.templateContent = value;
							await plugin.saveSettings();
							//this.display();
						}
					);
				});
		}


		new Setting(containerEl)
			.setName("Missing Fields")
			.setDesc(
				"Fields that are present in the template but missing from the selected field."
			)
			.addDropdown((d) => {
				d.addOption("Leave placeholder", "Leave placeholder");
				d.addOption("Remove (entire row)", "Remove (entire row)");
				d.addOption("Replace with custom text", "Replace with custom text");
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
				.setName("Replacement for missing fields")
				.addText((text) =>
					text
						.setValue(settings.missingfieldreplacement)
						.onChange(async (value) => {
							settings.missingfieldreplacement = value;
							await plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Multiple Entries Divider")
			.setDesc('Type the character or expression that should separate multiple values when found in the same field (e.g. authors, editors, tags, collections).')
			.addTextArea((text) =>
				text
					.setValue(settings.multipleFieldsDivider)
					.onChange(async (value) => {
						settings.multipleFieldsDivider = value;
						await plugin.saveSettings();
						//this.display();
					}
					)
			)

		new Setting(containerEl)
			.setName("Format Names")
			.setDesc('Specify how the names of the authors/editors should be exported. Accepted values are {{firstName}}, {{lastName}} and {{firstNameInitials}}')
			.addTextArea((text) =>
				text
					.setValue(settings.nameFormat)
					.onChange(async (value) => {
						settings.nameFormat = value;
						await plugin.saveSettings();
						//this.display();
					}
					)
			)



		new Setting(containerEl)
			.setName("Save Manual Edits")
			.setDesc(
				'Select "Yes" to preserve the manual edits made to the previously extracted note (e.g. block references, comments added manually, fixed typos) when this is updated. Select "No" to overwrite any manual change to the extracted annotation when this is updated.'
			)
			.addDropdown((d) => {
				d.addOption("Save Entire Note", "Save Entire Note");
				d.addOption("Select Section", "Select Section");
				d.addOption("Overwrite Entire Note", "Overwrite Entire Note");
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
				.setName("Start - Save Manual Edits")
				.setDesc(
					"Define string (e.g. '## Notes') in the template starting from where updating the note will not overwrite the existing text. If field is left empty, the value will be set to the beginning of the note"
				)
				.addText((text) =>
					text
						.setValue(settings.saveManualEditsStart)
						.onChange(async (value) => {
							settings.saveManualEditsStart = value;
							await plugin.saveSettings();
						})
				);


			if (settings.saveManualEdits) {
				new Setting(containerEl)
					.setName("End - Save Manual Edits")
					.setDesc(
						"Define string (e.g. '## Notes') in the template until where updating the note will not overwrite the existing text. If field is left empty, the value will be set to the end of the note"
					)
					.addText((text) =>
						text
							.setValue(settings.saveManualEditsEnd)
							.onChange(async (value) => {
								settings.saveManualEditsEnd = value;
								await plugin.saveSettings();
							})
					);
			}
		}


		containerEl.createEl('h2', { text: 'Update Library' });

		new Setting(containerEl)
			.setName("Update Existing/All Notes")
			.setDesc(
				"Select whether to create new notes that are missing from Obsidian but present/modified within Zotero when runing the Update Library command"
			)
			.addDropdown((d) => {
				d.addOption("Only update existing notes", "Only existing notes");
				d.addOption("Create new notes when missing", "Create new notes when missing");
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



