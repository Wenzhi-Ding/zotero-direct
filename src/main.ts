import { Plugin, Notice, FileSystemAdapter, TFile, normalizePath } from "obsidian";

import 'turndown'

import {
	DEFAULT_SETTINGS,
	templateAdmonition,
	templatePlain,
} from "./constants";

import { t } from "./i18n";

//Import modals from /modal.ts
import { SelectReferenceModal, UpdateLibraryModal } from "./modal";

//Import sample settings from /settings.ts
import { SettingTab } from "./settings";
import {
	ZoteroDirectSettings,
	Reference,
	Collection,
} from "./types";

import { readZoteroDatabase } from "./zotero-db";

import {
	createAuthorKey,
	createLocalFileLink,
	createLocalFilePathLink,
	createZoteroReaderPathLink,
	createCreatorList,
	createNoteTitle,
	makeWiki,
	makeQuotes,
	replaceAllTemplates,
	replaceMissingFields,
	replaceTagList,
	replaceTemplate,
	makeTags,
	createCreatorAllList,
	createAuthorKeyInitials,
	createAuthorKeyFullName,
	parseCiteKeyFromNoteName,
} from "./utils";

export default class ZoteroDirectPlugin extends Plugin {
	settings: ZoteroDirectSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

		//Add Command to Select a single Entry from Bib file via SQL
		this.addCommand({
			id: "importSelectedJson-modal",
			name: t().cmdCreateUpdateNote,
			callback: () => {
				new SelectReferenceModal(this.app, this).open();
			},
		});

		//Add Command to Select a single Entry from Bib file via SQL
		this.addCommand({
			id: "updateLibrary-modal",
			name: t().cmdUpdateLibrary,
			callback: () => {
				new UpdateLibraryModal(this.app, this).open();
			},
		});

		//Add Command to Update the current active note
		this.addCommand({
			id: "updateCurrentNote",
			name: t().cmdUpdateCurrentNote,
			callback: () => {
				this.updateCurrentNote();
			},
		});

	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	parseMetadata(selectedEntry: Reference, templateOriginal: string) {
		// Create Note from Template
		const template = templateOriginal;

		//Create Note
		let note = template;

		//Replace the author/s

		note = createCreatorList(
			selectedEntry.creators,
			"author",
			note,
			this.settings.multipleFieldsDivider,
			this.settings.nameFormat
		);
		//Replace the editor/s
		note = createCreatorList(
			selectedEntry.creators,
			"editor",
			note,
			this.settings.multipleFieldsDivider,
			this.settings.nameFormat
		);

		//Replace the creators (authors+editors+everybodyelse)
		note = createCreatorAllList(
			selectedEntry.creators,
			note,
			this.settings.multipleFieldsDivider,
			this.settings.nameFormat
		);

		//Create field year from date or dateEnacted
		if (selectedEntry.hasOwnProperty("date") && selectedEntry.date) {
			selectedEntry.year = selectedEntry.date.match(/\d{4}/)?.[0] || "";
		} else if (selectedEntry.hasOwnProperty("dateEnacted") && selectedEntry.dateEnacted) {
			selectedEntry.year = selectedEntry.dateEnacted.match(/\d{4}/)?.[0] || "";
		}
		//Create field ZoteroLocalLibrary
		if (selectedEntry.hasOwnProperty("select")) {
			selectedEntry.localLibrary =
				"[Zotero](" + selectedEntry.select + ")";
			selectedEntry.localLibraryLink = selectedEntry.select;

		}

		//Create citekey
		selectedEntry.citeKey = selectedEntry.citationKey

		//Fix itemType
		if (selectedEntry.itemType == "journalArticle") { selectedEntry.itemType = "Journal Article" }
		if (selectedEntry.itemType == "report") { selectedEntry.itemType = "Report" }
		if (selectedEntry.itemType == "bookSection") { selectedEntry.itemType = "Book Section" }
		if (selectedEntry.itemType == "newspaperArticle") { selectedEntry.itemType = "Newspaper Article" }
		if (selectedEntry.itemType == "book") { selectedEntry.itemType = "Book" }
		//Capitalize the first letter
		selectedEntry.itemType = selectedEntry.itemType.charAt(0).toUpperCase() + selectedEntry.itemType.slice(1);


		// Create in-line citation (e.g. Collier, Laporte and Seawright (2009))
		selectedEntry.citationInLine = createAuthorKey(selectedEntry.creators) +
			" " +
			"(" +
			selectedEntry.year +
			")"
		selectedEntry.citationInLine = selectedEntry.citationInLine.replace("()", "")


		// Create in-line citation with initials (e.g. Collier, D., Laporte, J. and Seawright, J. (2009))
		selectedEntry.citationInLineInitials = createAuthorKeyInitials(selectedEntry.creators) +
			" " +
			"(" +
			selectedEntry.year +
			")"
		selectedEntry.citationInLineInitials = selectedEntry.citationInLineInitials.replace("()", "")

		// Create in-line citation with initials (e.g. Collier, D., Laporte, J. and Seawright, J. (2009))
		selectedEntry.citationInLineFullName = createAuthorKeyFullName(selectedEntry.creators) +
			" " +
			"(" +
			selectedEntry.year +
			")"
		selectedEntry.citationInLineFullName = selectedEntry.citationInLineFullName.replace("()", "")

		// Replace short and full citation
		if (selectedEntry.itemType == "Journal Article") {
			selectedEntry.citationShort = selectedEntry.citationInLine +
				" " +
				selectedEntry.title;
			selectedEntry.citationFull = selectedEntry.citationShort +
				", " +
				"*" +
				selectedEntry.publicationTitle +
				"*" +
				", " +
				selectedEntry.volume +
				"(" +
				selectedEntry.issue +
				"), " +
				"pp. " +
				selectedEntry.pages +
				"."

			selectedEntry.citationFull = selectedEntry.citationFull.replace("() ", "")
			selectedEntry.citationShort = selectedEntry.citationShort.replace("** ", "")
			selectedEntry.citationFull = selectedEntry.citationFull.replace("** ", "")
			selectedEntry.citationFull = selectedEntry.citationFull.replace("pp. ", "")

		}

		//create field file
		selectedEntry.file = createLocalFileLink(selectedEntry);
		//create field path field
		selectedEntry.filePath = createLocalFilePathLink(selectedEntry);
		//create Zotero reader path field
		if (this.settings.debugMode) console.log("[BibNotes] filePath:", selectedEntry.filePath);
		selectedEntry.zoteroReaderLink = createZoteroReaderPathLink(selectedEntry);
		if (this.settings.debugMode) console.log("[BibNotes] zoteroReaderLink:", selectedEntry.zoteroReaderLink);



		// Create an array with all the fields
		const entriesArray = Object.keys(selectedEntry);


		//replace the single-value placeholders with the value of the field
		note = replaceAllTemplates(entriesArray, note, selectedEntry);



		//remove single backticks but retain triple backticks
		note = note.replace(/(?<!`)`(?!`)/g, "'");

		// //if the abstract is missing, delete Abstract headings

		note = note.replace(
			"```ad-quote\n" + "title: Abstract\n" + "```\n",
			""
		);
		note = note.replace(
			"```ad-abstract\n" + "title: Files and Links\n" + "```\n",
			""
		);
		note = note.replace(
			"```ad-note\n" + "title: Tags and Collections\n" + "```",
			""
		);

		// Return the metadata
		return note;
	}

	parseCollection(
		selectedEntry: Reference,
		data: { collections: Record<string, Collection> | Collection[] },
		metadata: string
	) {
		//Create object with all the collections
		const exportedCollections = data.collections as unknown as Record<string, Collection>;

		//identify the ID of the item
		const selectedID = selectedEntry.itemID;

		//Create empty array to store information about the collections of the item
		let collectionArray: string[] = [];

		//Create empty array to store information about the parent of the collections of the item
		const collectionParentCode: string[] = [];
		let collectionParentArray: string[] = [];
		const collectionParentParent: string[] = [];

		//identify the number of collections in the data
		const collectionKeys: string[] = Object.keys(exportedCollections);

		//loop through the collections and search for the ID of the selected reference
		for (
			let indexCollection = 0;
			indexCollection < collectionKeys.length;
			indexCollection++
		) {
			const key = collectionKeys[indexCollection];
			if (!key) continue;
			const col = exportedCollections[key];
			if (!col) continue;
			const collectionName =
				col.name;
			const collectionItem =
				col.items;
			const collectionParent =
				col.parent;
			if (collectionItem.includes(String(selectedID))) {
				collectionArray.push(collectionName);
				collectionParentCode.push(collectionParent);
			}
		}

		//loop through the collections and search for the name of the parent collection
		if (collectionParentCode.length > 0) {
			for (
				let indexCollection = 0;
				indexCollection < collectionKeys.length;
				indexCollection++
			) {
				const key = collectionKeys[indexCollection];
				if (!key) continue;
				const col = exportedCollections[key];
				if (!col) continue;
				if (
					collectionParentCode.includes(
						col.key
					)
				) {
					collectionParentArray.push(
						col
							.name
					);
				}
			}
		}

		//loop through the collections and search for the name of the grandparent collection
		if (collectionParentParent.length > 0) {
			for (
				let indexCollection = 0;
				indexCollection < collectionKeys.length;
				indexCollection++
			) {
				const key = collectionKeys[indexCollection];
				if (!key) continue;
				const col = exportedCollections[key];
				if (!col) continue;
				if (
					collectionParentParent.includes(
						col.key
					)
				) {
					collectionParentArray.push(
						col
							.name
					);
				}
			}
		}

		//Add Collection to Collection Parent
		collectionParentArray = collectionParentArray.concat(collectionArray);

		//Sort the collections in alphabetical order
		collectionArray = collectionArray.sort();
		collectionParentArray = collectionParentArray.sort();

		//add a space after the divided if it is not present
		let divider = this.settings.multipleFieldsDivider;
		if (divider.slice(-1) !== " ") {
			divider = divider + " ";
		}

		//Replace the keywords in the metadata
		if (collectionArray.length > 0) {
			const collectionArrayBraket = collectionArray.map(makeWiki);
			metadata = replaceTemplate(
				metadata,
				`[[{{collections}}]]`,
				String(collectionArrayBraket.join(divider))
			);

			const collectionArrayQuotes = collectionArray.map(makeQuotes);
			metadata = replaceTemplate(
				metadata,
				`"{{collections}}"`,
				String(collectionArrayQuotes.join(divider))
			);

			const collectionArrayTags = collectionArray.map(makeTags);
			metadata = replaceTemplate(
				metadata,
				`#{{collections}}`,
				String(collectionArrayTags.join(divider))
			);

			metadata = replaceTemplate(
				metadata,
				`{{collections}}`,
				String(collectionArray.join(divider))
			);
		}

		if (collectionParentArray.length > 0) {
			const collectionParentArrayBraket =
				collectionParentArray.map(makeWiki);
			metadata = replaceTemplate(
				metadata,
				`[[{{collectionsParent}}]]`,
				String(collectionParentArrayBraket.join(divider))
			);

			const collectionParentArrayQuotes =
				collectionParentArray.map(makeQuotes);
			metadata = replaceTemplate(
				metadata,
				`"{{collectionsParent}}"`,
				String(collectionParentArrayQuotes.join(divider))
			);

			const collectionParentArrayTags =
				collectionParentArray.map(makeTags);
			metadata = replaceTemplate(
				metadata,
				`#{{collectionsParent}}`,
				String(collectionParentArrayTags.join(divider))
			);
			metadata = replaceTemplate(
				metadata,
				`{{collectionsParent}}`,
				String(collectionParentArray.join(divider))
			);
		}
		return metadata;
	}

	// Function to extract the notes added manually

	// Function to import the right template

	importTemplate() {
		let template = templatePlain;
		if (this.settings.templateType === "Plain") {
			template = templatePlain;
		} else if (this.settings.templateType === "Admonition") {
			template = templateAdmonition;
		} else if (this.settings.templateType === "Custom") {
			template = this.settings.templateContent;
		}

		return template;
	}

	compareOldNewNote(
		existingNote: string,
		newNote: string,
		authorKey: string
	): string {
		//Find the position of the line breaks in the old note
		const newLineRegex = RegExp(/\n/gm);
		const positionNewLine: number[] = [];
		let match = undefined;
		while ((match = newLineRegex.exec(existingNote))) {
			positionNewLine.push(match.index);
		}

		//Create an array to record where in the old note the matches with the new note are found
		const positionOldNote: number[] = [0];
		//Create an array to record which sentences of the new note need to be stored in the old note and their position in the old note
		const newNoteInsertText: string[] = [];
		const newNoteInsertPosition: number[] = [];

		//Split the new note into sentences
		const newNoteArray = newNote.split("\n");

		//Remove markdown formatting from the beginning and end of each line

		//loop through each of the lines extracted in the note
		for (
			let indexLines = 0;
			indexLines < newNoteArray.length;
			indexLines++
		) {
			let segmentWhole = "";
			let segmentFirstHalf = "";
			let segmentSecondHalf = "";
			let segmentFirstQuarter = "";
			let segmentSecondQuarter = "";
			let segmentThirdQuarter = "";
			let segmentFourthQuarter = "";
			//Create an array to record where in the old note the matches with the new note are found
			const positionArray: number[] = [-1];

			// Select the line to be searched

			//Remove formatting added by bibnotes at the beginning of the line
			let selectedNewLine = newNoteArray[indexLines];
			if (selectedNewLine === undefined) continue;
			selectedNewLine = selectedNewLine.trim();
			selectedNewLine = selectedNewLine.replace(/^- /gm, "");
			selectedNewLine = selectedNewLine.replace(/^> /gm, "");
			selectedNewLine = selectedNewLine.replace(/^=/gm, "");
			selectedNewLine = selectedNewLine.replace(/^\**/gm, "");
			selectedNewLine = selectedNewLine.replace(/^\*/gm, "");
			selectedNewLine = selectedNewLine.replace(/^"/gm, "");

			//Remove the authorkey at the end of the line
			const authorKey_Zotero = new RegExp(
				"\\(" + authorKey + ", \\d+, p. \\d+\\)$"
			);
			const authorKey_Zotfile = new RegExp(
				"\\(" + authorKey + " \\d+:\\d+\\)$"
			);
			selectedNewLine = selectedNewLine.replace(authorKey_Zotero, "");
			selectedNewLine = selectedNewLine.replace(authorKey_Zotfile, "");

			//Remove formatting added by bibnotes at the end of the line
			selectedNewLine = selectedNewLine.replace(/=$/gm, "");
			selectedNewLine = selectedNewLine.replace(/\**$/gm, "");
			selectedNewLine = selectedNewLine.replace(/\*$/gm, "");
			selectedNewLine = selectedNewLine.replace(/"$/gm, "");

			//Calculate the length of the highlighted text
			if (selectedNewLine == undefined) {
				continue;
			}

			const lengthExistingLine = selectedNewLine.length;
			//Calculate the length of the comment text
			if (lengthExistingLine === 0) {
				continue;
			}

			//CHECK THE PRESENCE OF THE HIGHLIGHTED TEXT IN THE EXISTING ONE

			//Check if the entire line (or part of the line for longer lines) are found in the existing note
			if (lengthExistingLine > 1 && lengthExistingLine < 30) {
				segmentWhole = selectedNewLine;
				positionArray.push(existingNote.indexOf(segmentWhole));
			} else if (lengthExistingLine >= 30 && lengthExistingLine < 150) {
				segmentFirstHalf = selectedNewLine.substring(
					0,
					lengthExistingLine / 2
				);
				positionArray.push(existingNote.indexOf(segmentFirstHalf));

				segmentSecondHalf = selectedNewLine.substring(
					lengthExistingLine / 2 + 1,
					lengthExistingLine
				);
				positionArray.push(existingNote.indexOf(segmentSecondHalf));
			} else if (lengthExistingLine >= 150) {
				segmentFirstQuarter = selectedNewLine.substring(
					0,
					lengthExistingLine / 4
				);
				positionArray.push(existingNote.indexOf(segmentFirstQuarter));

				segmentSecondQuarter = selectedNewLine.substring(
					lengthExistingLine / 4 + 1,
					lengthExistingLine / 2
				);
				positionArray.push(existingNote.indexOf(segmentSecondQuarter));

				segmentThirdQuarter = selectedNewLine.substring(
					lengthExistingLine / 2 + 1,
					(3 * lengthExistingLine) / 4
				);
				positionArray.push(existingNote.indexOf(segmentThirdQuarter));

				segmentFourthQuarter = selectedNewLine.substring(
					(3 * lengthExistingLine) / 4 + 1,
					lengthExistingLine
				);
				positionArray.push(existingNote.indexOf(segmentFourthQuarter));
			}

			// if a match if found with the old note, set foundOld to TRUE
			if (Math.max(...positionArray) > -1) {
				//record the position of the found line in the old note
				const positionOldNoteMax = Math.max(...positionArray);
				positionOldNote.push(positionOldNoteMax);
			}
			// if a match if not found with the old note, set foundOld to FALSE and set positionOld to the position in the old note where the line break is found
			if (Math.max(...positionArray) === -1) {
				const positionOldNoteMax = Math.max(...positionOldNote);
				newNoteInsertText.push(newNoteArray[indexLines] ?? "");
				newNoteInsertPosition.push(
					positionNewLine.filter((pos) => pos > positionOldNoteMax)[0] ?? 0
				);
			}
		}

		let doubleSpaceAdd = "";
		if (this.settings.isDoubleSpaced) {
			doubleSpaceAdd = "\n";
		}

		//Add the new annotations into the old note
		for (
			let indexNoteElements = newNoteInsertText.length - 1;
			indexNoteElements >= 0;
			indexNoteElements--
		) {
			const insertText = newNoteInsertText[indexNoteElements];
			const insertPosition = newNoteInsertPosition[indexNoteElements];
			existingNote =
				existingNote.slice(0, insertPosition) +
				doubleSpaceAdd +
				"\n" +
				insertText +
				existingNote.slice(insertPosition);
		}
		if (this.settings.saveManualEdits == "Save Entire Note") {
			return existingNote;
		}
		if (this.settings.saveManualEdits == "Select Section") {
			//identify the keyword marking the beginning and the end of the section not to be overwritten
			const startSave = this.settings.saveManualEditsStart;
			const endSave = this.settings.saveManualEditsEnd;

			//identify the keyword identifying the beginning of the section to be preserved is empty, the position is the beginning of the string. Otherwise find the match in the text
			let startSaveOld = 0;
			if (startSave !== "") {
				startSaveOld = existingNote.indexOf(startSave);
			}
			if (startSaveOld < 0) {
				startSaveOld = 0;
			}

			//identify the keyword identifying the end of the section to be preserved. If is empty, the position is the end of the string. Otherwise find the match in the text
			let endSaveOld: number = existingNote.length;
			if (endSave !== "") {
				endSaveOld = existingNote.indexOf(endSave) + endSave.length;
			}
			if (endSaveOld < 0) {
				endSaveOld = existingNote.length;
			}

			//Find the sections of the existing note to be preserved
			const existingNotePreserved = existingNote.substring(
				startSaveOld,
				endSaveOld
			);

			//identify the keyword identifying the beginning of the section to be preserved is empty, the position is the beginning of the string. Otherwise find the match in the text
			let startSaveNew = 0;
			if (startSave !== "") {
				startSaveNew = newNote.indexOf(startSave);
			}
			if (startSaveNew < 0) {
				startSaveNew = 0;
			}

			//identify the keyword identifying the ebd of the section to be preserved is empty, the position is the end of the string. Otherwise find the match in the text
			let endSaveNew: number = newNote.length;
			if (endSave !== "") {
				endSaveNew = newNote.indexOf(endSave) + endSave.length;
			}
			if (endSaveNew < 0) {
				endSaveNew = newNote.length;
			}

			//Find the sections of the existing note before the one to be preserved
			const newNotePreservedBefore = newNote.substring(0, startSaveNew);
			//Find the sections of the existing note after the one to be preserved
			const newNotePreservedAfter = newNote.substring(
				endSaveNew,
				newNote.length
			);

			const newNoteCombined =
				newNotePreservedBefore +
				existingNotePreserved +
				newNotePreservedAfter;

			return newNoteCombined;
		}
		return existingNote;
	}

	async createNote(
		selectedEntry: Reference,
		data: {
			collections: Record<string, Collection> | Collection[];
			config?: Record<string, never>;
			items?: Reference[];
			version?: string;
		}
	) {
		//Extract the reference within bracket to faciliate comparison
		const authorKey = createAuthorKey(selectedEntry.creators);
		//set the authorkey field (with or without first name) on the entry to use when creating the title and to replace in the template
		selectedEntry.authorKey = authorKey ?? "";
		selectedEntry.authorKeyInitials = createAuthorKeyInitials(selectedEntry.creators) ?? ""
		selectedEntry.authorKeyFullName = createAuthorKeyFullName(selectedEntry.creators) ?? ""

		//Load Template
		const templateNote = this.importTemplate();
		if (this.settings.debugMode) console.log("[BibNotes] Template:", templateNote);

		//Create the metadata
		let litnote: string = this.parseMetadata(selectedEntry, templateNote);
		if (this.settings.debugMode) console.log("[BibNotes] Entry:", selectedEntry);

		//Extract the list of collections
		litnote = this.parseCollection(selectedEntry, data, litnote);


		//Define the name and path of the file to be exported (vault-relative)
		const noteRelPath = createNoteTitle(
			selectedEntry,
			this.settings.exportTitle,
			this.settings.exportPath
		);
		// Join the tags in the metadata with the tags extracted in the text and replace them in the text
		litnote = replaceTagList(
			selectedEntry,
			[],
			litnote,
			this.settings.multipleFieldsDivider
		);

		//delete the missing fields in the metadata
		const missingFieldSetting = this.settings.missingfield;
		litnote = replaceMissingFields(
			litnote,
			missingFieldSetting,
			this.settings.missingfieldreplacement
		);
		// Compare old note and new note
		const existingFile = this.app.vault.getAbstractFileByPath(noteRelPath);
		if (
			this.settings.saveManualEdits !== "Overwrite Entire Note" &&
			existingFile instanceof TFile
		) {
			//Check if the settings in settings.saveManualEdits are TRUE. In that case compare existing file with new notes. If false don't look at existing note
			//Check if an old version exists. If the old version has annotations then add the new annotation to the old annotaiton

			const existingNoteAll = await this.app.vault.read(existingFile);


			litnote = this.compareOldNewNote(
				existingNoteAll,
				litnote,
				authorKey ?? ""
			);
		}

		//Export the file
		if (this.settings.debugMode) {
			console.log("[BibNotes] NoteRelPath:", noteRelPath);
			console.log("[BibNotes] Final Note:", litnote);
		}
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, litnote);
		} else {
			// Ensure parent folder exists
			const folderPath = normalizePath(this.settings.exportPath);
			if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
				await this.app.vault.createFolder(folderPath);
			}
			await this.app.vault.create(noteRelPath, litnote);
		}
		new Notice(t().noticeImported(selectedEntry.citationKey));
	}

	async updateCurrentNote(){
		if (this.settings.debugMode) console.log("[BibNotes] Updating Current Note");

		// Check if the database path is set
		const dbPath = this.settings.zoteroDbPath;
		if (!dbPath) {
			new Notice(t().noticeDbNotConfigured);
			return;
		}

		let data;
		// 获取插件目录的绝对路径
		const vaultBasePath = this.app.vault.adapter instanceof FileSystemAdapter ? this.app.vault.adapter.getBasePath() : "";
		const pluginDir = vaultBasePath && this.manifest.dir 
			? vaultBasePath + "/" + this.manifest.dir 
			: this.manifest.dir || "";
		try {
			data = await readZoteroDatabase(dbPath, pluginDir);
		} catch (e) {
			new Notice(t().noticeDbReadFailed + (e as Error).message);
			console.error(e);
			return;
		}

		// Find the citeKey of current note in file name
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice(t().noticeCurrentNoteNotFound(""));
			return;
		}
		const currentNoteName = activeFile.name
		const noteTitleFormat = this.settings.exportTitle+'.md'

		const citeKey = parseCiteKeyFromNoteName(currentNoteName, noteTitleFormat);
	
		if (citeKey != null){
			// find entry in library using citeKey
			const entryIndex = data.items.findIndex(
				(item: { citationKey: string }) =>
					item.citationKey ===
					citeKey
			);
			if (entryIndex!=-1){
				// update current note
				const currentEntry = data.items[entryIndex];
			if (!currentEntry) {
				new Notice(t().noticeCurrentNoteNotFound(currentNoteName));
				return;
			}
				await this.createNote(currentEntry, data);
				new Notice(t().noticeCurrentNoteUpdated(currentNoteName));
			}
			else{
				new Notice(t().noticeCurrentNoteNotFound(currentNoteName));
			}
		}else{
			new Notice(t().noticeCiteKeyNotFound(currentNoteName));
		}
	}
}
