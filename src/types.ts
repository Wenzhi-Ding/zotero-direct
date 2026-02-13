

export interface ZoteroDirectSettings {
	zoteroDbPath: string;
	templateContent: string;
	templateType: "Plain" | "Admonition" | "Custom";
	exportPath: string;
	exportTitle: string;
	missingfield: "Leave placeholder" | "Remove (entire row)" | "Replace with custom text";
	saveManualEdits: "Save Entire Note" | "Select Section" | "Overwrite Entire Note";
	saveManualEditsStart: string;
	saveManualEditsEnd: string;
	lastUpdateDate: Date;
	updateLibrary: "Only update existing notes" | "Create new notes when missing";
	isDoubleSpaced: boolean;
	multipleFieldsDivider: string;
	nameFormat: string;
	debugMode: boolean;
	missingfieldreplacement: string;
}

export interface Reference {
	authorKey: string;
	authorKeyInitials: string;
	authorKeyFullName: string;
	id: number;
	citationKey: string;
	citeKey: string;
	year: string;
	citationInLine: string;
	citationInLineInitials: string;
	citationInLineFullName: string;
	citationShort: string;
	citationFull: string;
	itemType: string;
	inlineReference: string;
	date: string;
	dateModified: string;
	itemKey: string;
	itemID: number;
	title: string;
	publicationTitle: string;
	volume: number;
	issue: number;
	pages: string;
	abstractNote: string;
	creators: {
		creatorType: string;
		firstName: string;
		lastName: string;
		name: string;
	}[];
	file: string;
	filePath: string;
	dateEnacted: string;
	zoteroReaderLink: string;
	localLibrary: string;
	localLibraryLink: string;
	select: string;
	attachments: {
		dateAdded: string;
		dateModified: string;
		itemType: string;
		path: string;
		relations: string[];
		select: string;
		tags: string[];
		title: string;
		uri: string;
	}[];
	notes: {
		dateAdded: string;
		dateModified: string;
		itemType: string;
		key: string;
		note: string;
		parentItem: "VMSSFNIR";
		relations: string[];
		tags: string[];
		uri: string;
		version: number;
	}[];
	tags: {
		tag: string;
	}[];
	zoteroTags: string[];
}

export interface Creator {
	creatorType: string;
	firstName: string;
	lastName: string;
	name: string;
}

export interface Collection {
	collections: string[];
	items: string[];
	key: string;
	name: string;
	parent: string;
}

export type CreatorArray = Array<Creator>;
