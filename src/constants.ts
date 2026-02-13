import { ZoteroDirectSettings } from "./types";

export const templatePlain = "# {{title}}\n" +
	"\n" +
	"## Metadata\n" +
	"- **CiteKey**: {{citekey}}\n " +
	"- **Type**: {{itemType}}\n " +
	"- **Title**: {{title}}, \n " +
	"- **Author**: {{author}};  \n" +
	"- **Editor**: {{editor}};  \n" +
	"- **Translator**: {{translator}}\n" +
	"- **Publisher**: {{publisher}},\n" +
	"- **Location**: {{place}},\n" +
	"- **Series**: {{series}}\n" +
	"- **Series Number**: {{seriesNumber}}\n" +
	"- **Journal**: {{publicationTitle}}, \n" +
	"- **Volume**: {{volume}},\n" +
	"- **Issue**: {{issue}}\n" +
	"- **Pages**: {{pages}}\n" +
	"- **Year**: {{year}} \n" +
	"- **DOI**: {{DOI}}\n" +
	"- **ISSN**: {{ISSN}}\n" +
	"- **ISBN**: {{ISBN}}\n" +
	"\n" +
	"## Abstract\n" +
	"{{abstractNote}}" +
	"\n" +
	"## Files and Links\n" +
	"- **Url**: {{url}}\n" +
	"- **Uri**: {{uri}}\n" +
	"- **Eprint**: {{eprint}}\n" +
	"- **File**: {{file}}\n" +
	"- **Local Library**: [Zotero]({{localLibraryLink}})\n" +
	"\n" +
	"## Tags and Collections\n" +
	"- **Keywords**: {{keywordsAll}}\n" +
	"- **Collections**: {{collectionsParent}}\n" +
	"\n" +
	"\n" +
	"----" +
	"\n" +
	"\n" +
	"## Comments\n" +
	"{{UserNotes}}\n" +
	"\n" +
	"\n" +
	"----" +
	"\n" +
	"\n" +
	"## Extracted Annotations\n" +
	"{{PDFNotes}}"

export const templateAdmonition = "# {{title}}\n" +
	"\n" +
	"``` ad-info\n" +
	"title: Metadata\n" +
	"- **CiteKey**: {{citekey}}\n" +
	"- **Type**: {{itemType}}\n" +
	"- **Author**: {{author}}\n" +
	"- **Editor**: {{editor}}\n" +
	"- **Translator**: {{translator}}\n" +
	"- **Publisher**: {{publisher}}\n" +
	"- **Location**: {{place}}\n" +
	"- **Series**: {{series}}\n" +
	"- **Series Number**: {{seriesNumber}}\n" +
	"- **Journal**: {{publicationTitle}}\n" +
	"- **Volume**: {{volume}}\n" +
	"- **Issue**: {{issue}}\n" +
	"- **Pages**: {{pages}}\n" +
	"- **Year**: {{year}} \n" +
	"- **DOI**: {{DOI}}\n" +
	"- **ISSN**: {{ISSN}}\n" +
	"- **ISBN**: {{ISBN}}\n" +
	"```\n" +
	"```ad-quote\n" +
	"title: Abstract\n" +
	"{{abstractNote}}\n" +
	"```\n" +
	"```ad-abstract\n" +
	"title: Files and Links\n" +
	"- **Url**: {{url}}\n" +
	"- **Uri**: {{uri}}\n" +
	"- **Eprint**: {{eprint}}\n" +
	"- **File**: {{file}}\n" +
	"- **Local Library**: [Zotero]({{localLibraryLink}})\n" +
	"```\n" +
	"```ad-note\n" +
	"title: Tags and Collections\n" +
	"- **Keywords**: {{keywordsAll}}\n" +
	"- **Collections**: {{collectionsParent}}\n" +
	"```\n" +
	"\n" +
	"----" +
	"\n" +
	"\n" +
	"## Comments\n" +
	"{{UserNotes}}\n" +
	"\n" +
	"\n" +
	"----" +
	"\n" +
	"\n" +
	"## Extracted Annotations\n" +
	"{{PDFNotes}}"


export const DEFAULT_SETTINGS: ZoteroDirectSettings = {
	zoteroDbPath: "",
	templateContent: templatePlain,
	templateType: "Admonition",
	lastUpdateDate: new Date('1995-12-17T03:24:00'),
	updateLibrary: "Only update existing notes",
	exportPath: "",
	exportTitle: "{{citeKey}}",
	missingfield: "Leave placeholder",
	saveManualEdits: "Save Entire Note",
	saveManualEditsStart: "",
	saveManualEditsEnd: "",
	isDoubleSpaced: true,
	multipleFieldsDivider: ";",
	nameFormat: "{{lastName}}, {{firstName}}",
	debugMode: false,
	missingfieldreplacement: "NA",
};

export const TEMPLATE_REG = /\{\{[^}]+\}\}/g;
export const TEMPLATE_BRACKET_REG = /\[\[\{\{[^}]+\}\}\]\]/g;