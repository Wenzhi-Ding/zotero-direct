

export interface MyPluginSettings {
	bibPath: string;
	templateContent: string;
	templateType: string;
	exportPath: string;
	exportTitle: string;
	missingfield: string;
	saveManualEdits: string;
	saveManualEditsStart: string;
	saveManualEditsEnd: string;
	lastUpdateDate: Date;
	updateLibrary: string;
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
	creators: {
		creatorType: string;
		firstName: string;
		lastName: string;
		name: string;
	}[];
	file: string;
	filePath: string;
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

export interface AnnotationElements {
	annotationType: string;
	citeKey: string;
	commentText: string;
	commentFormatted: string;
	commentFormattedNoPrepend: string;
	highlightText: string;
	highlightColour: string;
	highlightFormatted: string;
	highlightFormattedNoPrepend: string;
	inlineTagsText: string;
	inlineTagsArray: string[];
	inlineTagsFormatted: string;
	inlineTagsFormattedNoPrepend: string;
	indexNote: number;
	rowOriginal: string;
	rowEdited: string;
	foundOld: boolean;
	positionOld: number;
	extractionSource: string;
	colourTemplate: string;
	colourTemplateFormatted: string;
	colourTemplateNoPrepend: string;
	colourTextBefore: string;
	colourTextAfter: string;
	imagePath: string;
	pagePDF: number;
	pageLabel: number;
	attachmentURI: string;
	zoteroBackLink: string;
	annotationKey: string;
}
[];

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
