/**
 * Internationalization module for Zotero Direct plugin.
 * Detects Obsidian's language setting and provides localized strings.
 * Supports Chinese (zh) and English (default).
 */

import { moment } from "obsidian";

type Locale = "zh" | "en";

/** Detect current locale from Obsidian's moment locale */
function detectLocale(): Locale {
	const locale = moment.locale();
	if (locale && locale.startsWith("zh")) {
		return "zh";
	}
	return "en";
}

interface I18nStrings {
	// ── Plugin title & section headings ──
	pluginTitle: string;
	sectionImportLibrary: string;
	sectionExportNotes: string;
	sectionUpdateLibrary: string;

	// ── Settings: Zotero Database ──
	zoteroDbPathName: string;
	zoteroDbPathDesc: string;
	zoteroDbPathPlaceholder: string;

	// ── Settings: Cache ──
	cacheStatusName: string;
	cacheStatusDesc: string;
	cacheRebuildTooltip: string;
	cacheSetPathFirst: string;
	cacheRebuilding: string;
	cacheRebuiltSuccess: (count: number) => string;
	cacheRebuildFailed: string;
	cacheItemsCached: (count: number) => string;
	cacheNone: string;

	// ── Settings: Export Path ──
	exportPathName: string;
	exportPathDesc: string;
	exportPathPlaceholder: string;

	// ── Settings: Note Title ──
	noteTitleName: string;
	noteTitleDesc: string;
	noteTitlePlaceholder: string;

	// ── Settings: Template ──
	selectTemplateName: string;
	selectTemplateDesc: string;
	templatePlain: string;
	templateAdmonition: string;
	templateCustom: string;
	customTemplateName: string;

	// ── Settings: Missing Fields ──
	missingFieldsName: string;
	missingFieldsDesc: string;
	missingFieldLeavePlaceholder: string;
	missingFieldRemoveRow: string;
	missingFieldReplaceCustom: string;
	missingFieldReplacementName: string;

	// ── Settings: Divider ──
	multipleEntriesDividerName: string;
	multipleEntriesDividerDesc: string;

	// ── Settings: Name Format ──
	formatNamesName: string;
	formatNamesDesc: string;

	// ── Settings: Save Manual Edits ──
	saveManualEditsName: string;
	saveManualEditsDesc: string;
	saveEntireNote: string;
	selectSection: string;
	overwriteEntireNote: string;
	saveManualEditsStartName: string;
	saveManualEditsStartDesc: string;
	saveManualEditsEndName: string;
	saveManualEditsEndDesc: string;

	// ── Settings: Update Library ──
	updateExistingAllName: string;
	updateExistingAllDesc: string;
	onlyUpdateExisting: string;
	createNewWhenMissing: string;

	// ── Commands ──
	cmdCreateUpdateNote: string;
	cmdUpdateLibrary: string;
	cmdUpdateCurrentNote: string;

	// ── Notices (main.ts / modal.ts) ──
	noticeImported: (citeKey: string) => string;
	noticeDbNotConfigured: string;
	noticeDbReadFailed: string;
	noticeUpdatedEntries: (count: number) => string;
	noticeCurrentNoteUpdated: (name: string) => string;
	noticeCurrentNoteNotFound: (name: string) => string;
	noticeCiteKeyNotFound: (name: string) => string;

	// ── Modal: misc labels ──
	labelTags: string;
	noSearchResult: string;
}

const en: I18nStrings = {
	// ── Plugin title & section headings ──
	pluginTitle: "Zotero Direct",
	sectionImportLibrary: "Import Library",
	sectionExportNotes: "Export Notes",
	sectionUpdateLibrary: "Update Library",

	// ── Settings: Zotero Database ──
	zoteroDbPathName: "Zotero Database Path",
	zoteroDbPathDesc:
		"Absolute path to Zotero's SQLite database file (zotero.sqlite). For example: C:\\Users\\YourName\\Zotero\\zotero.sqlite",
	zoteroDbPathPlaceholder: "C:\\Users\\YourName\\Zotero\\zotero.sqlite",

	// ── Settings: Cache ──
	cacheStatusName: "Cache Status",
	cacheStatusDesc:
		"Click the refresh button to rebuild the cache from Zotero database. This pre-builds the cache so that subsequent imports are faster.",
	cacheRebuildTooltip: "Rebuild cache from Zotero database",
	cacheSetPathFirst: "Please set the Zotero database path first.",
	cacheRebuilding:
		"Rebuilding cache from Zotero database, this may take a while...",
	cacheRebuiltSuccess: (count) => `Cache rebuilt successfully: ${count} items cached.`,
	cacheRebuildFailed: "Failed to rebuild cache: ",
	cacheItemsCached: (count) => `${count} items cached`,
	cacheNone: "No cache",

	// ── Settings: Export Path ──
	exportPathName: "Export Path",
	exportPathDesc:
		"Add the relative path to the folder inside your vault where the notes will be exported",
	exportPathPlaceholder: "Example: folder1/folder2",

	// ── Settings: Note Title ──
	noteTitleName: "Note Title",
	noteTitleDesc:
		"Select the format of the title of the note. Possible values include: {{citeKey}}, {{title}}, {{author}},{{authorInitials}}, {{authorFullName}} {{year}}",
	noteTitlePlaceholder: "{{citeKey}}",

	// ── Settings: Template ──
	selectTemplateName: "Select Template",
	selectTemplateDesc:
		"Select one of the default templates or provide a custom one.",
	templatePlain: "Plain",
	templateAdmonition: "Admonition",
	templateCustom: "Custom Template",
	customTemplateName: "Custom Template",

	// ── Settings: Missing Fields ──
	missingFieldsName: "Missing Fields",
	missingFieldsDesc:
		"Fields that are present in the template but missing from the selected field.",
	missingFieldLeavePlaceholder: "Leave placeholder",
	missingFieldRemoveRow: "Remove (entire row)",
	missingFieldReplaceCustom: "Replace with custom text",
	missingFieldReplacementName: "Replacement for missing fields",

	// ── Settings: Divider ──
	multipleEntriesDividerName: "Multiple Entries Divider",
	multipleEntriesDividerDesc:
		"Type the character or expression that should separate multiple values when found in the same field (e.g. authors, editors, tags, collections).",

	// ── Settings: Name Format ──
	formatNamesName: "Format Names",
	formatNamesDesc:
		"Specify how the names of the authors/editors should be exported. Accepted values are {{firstName}}, {{lastName}} and {{firstNameInitials}}",

	// ── Settings: Save Manual Edits ──
	saveManualEditsName: "Save Manual Edits",
	saveManualEditsDesc:
		'Select "Yes" to preserve the manual edits made to the previously extracted note (e.g. block references, comments added manually, fixed typos) when this is updated. Select "No" to overwrite any manual change to the extracted annotation when this is updated.',
	saveEntireNote: "Save Entire Note",
	selectSection: "Select Section",
	overwriteEntireNote: "Overwrite Entire Note",
	saveManualEditsStartName: "Start - Save Manual Edits",
	saveManualEditsStartDesc:
		"Define string (e.g. '## Notes') in the template starting from where updating the note will not overwrite the existing text. If field is left empty, the value will be set to the beginning of the note",
	saveManualEditsEndName: "End - Save Manual Edits",
	saveManualEditsEndDesc:
		"Define string (e.g. '## Notes') in the template until where updating the note will not overwrite the existing text. If field is left empty, the value will be set to the end of the note",

	// ── Settings: Update Library ──
	updateExistingAllName: "Update Existing/All Notes",
	updateExistingAllDesc:
		"Select whether to create new notes that are missing from Obsidian but present/modified within Zotero when running the Update Library command",
	onlyUpdateExisting: "Only update existing notes",
	createNewWhenMissing: "Create new notes when missing",

	// ── Commands ──
	cmdCreateUpdateNote: "Create/Update Literature Note",
	cmdUpdateLibrary: "Update Library",
	cmdUpdateCurrentNote: "Update Current Note",

	// ── Notices ──
	noticeImported: (citeKey) => `Imported ${citeKey}!`,
	noticeDbNotConfigured:
		"Zotero database path not configured. Please set it in plugin settings.",
	noticeDbReadFailed: "Failed to read Zotero database: ",
	noticeUpdatedEntries: (count) => `Updated ${count} entries`,
	noticeCurrentNoteUpdated: (name) => `Current Note ${name} updated`,
	noticeCurrentNoteNotFound: (name) =>
		`Current Note ${name} not found in the library`,
	noticeCiteKeyNotFound: (name) =>
		`Cannot find citeKey from Current Note: ${name}`,

	// ── Modal ──
	labelTags: "Tags: ",
	noSearchResult: "No search result",
};

const zh: I18nStrings = {
	// ── 插件标题和分区标题 ──
	pluginTitle: "Zotero Direct 文献导入工具",
	sectionImportLibrary: "导入文献库",
	sectionExportNotes: "导出笔记",
	sectionUpdateLibrary: "更新文献库",

	// ── 设置：Zotero 数据库 ──
	zoteroDbPathName: "Zotero 数据库路径",
	zoteroDbPathDesc:
		"Zotero 的 SQLite 数据库文件（zotero.sqlite）的绝对路径。例如：C:\\Users\\用户名\\Zotero\\zotero.sqlite",
	zoteroDbPathPlaceholder: "C:\\Users\\用户名\\Zotero\\zotero.sqlite",

	// ── 设置：缓存 ──
	cacheStatusName: "缓存状态",
	cacheStatusDesc:
		"点击刷新按钮从 Zotero 数据库重建缓存。预先构建缓存可以使后续导入更快。",
	cacheRebuildTooltip: "从 Zotero 数据库重建缓存",
	cacheSetPathFirst: "请先设置 Zotero 数据库路径。",
	cacheRebuilding: "正在从 Zotero 数据库重建缓存，请稍候…",
	cacheRebuiltSuccess: (count) => `缓存重建成功：已缓存 ${count} 个条目。`,
	cacheRebuildFailed: "缓存重建失败：",
	cacheItemsCached: (count) => `已缓存 ${count} 个条目`,
	cacheNone: "无缓存",

	// ── 设置：导出路径 ──
	exportPathName: "导出路径",
	exportPathDesc: "设置仓库内用于导出笔记的文件夹的相对路径",
	exportPathPlaceholder: "例如：folder1/folder2",

	// ── 设置：笔记标题 ──
	noteTitleName: "笔记标题",
	noteTitleDesc:
		"设置笔记标题的格式。可用变量包括：{{citeKey}}、{{title}}、{{author}}、{{authorInitials}}、{{authorFullName}}、{{year}}",
	noteTitlePlaceholder: "{{citeKey}}",

	// ── 设置：模板 ──
	selectTemplateName: "选择模板",
	selectTemplateDesc: "选择一个默认模板或提供自定义模板。",
	templatePlain: "简洁",
	templateAdmonition: "Admonition",
	templateCustom: "自定义模板",
	customTemplateName: "自定义模板",

	// ── 设置：缺失字段 ──
	missingFieldsName: "缺失字段处理",
	missingFieldsDesc: "模板中存在但所选条目中缺失的字段的处理方式。",
	missingFieldLeavePlaceholder: "保留占位符",
	missingFieldRemoveRow: "删除（整行）",
	missingFieldReplaceCustom: "替换为自定义文本",
	missingFieldReplacementName: "缺失字段的替换文本",

	// ── 设置：分隔符 ──
	multipleEntriesDividerName: "多值分隔符",
	multipleEntriesDividerDesc:
		"输入同一字段中多个值（如作者、编辑、标签、合集）之间的分隔字符或表达式。",

	// ── 设置：姓名格式 ──
	formatNamesName: "姓名格式",
	formatNamesDesc:
		"指定作者/编辑姓名的导出格式。可用变量：{{firstName}}、{{lastName}}、{{firstNameInitials}}",

	// ── 设置：保留手动编辑 ──
	saveManualEditsName: "保留手动编辑",
	saveManualEditsDesc:
		'选择"保留整篇笔记"以在更新时保留之前对笔记的手动修改（如块引用、手动添加的评论、修正的错别字）。选择"覆盖整篇笔记"以在更新时覆盖所有手动修改。',
	saveEntireNote: "保留整篇笔记",
	selectSection: "选择保留区域",
	overwriteEntireNote: "覆盖整篇笔记",
	saveManualEditsStartName: "保留区域 - 起始位置",
	saveManualEditsStartDesc:
		"定义模板中的字符串（如 '## 笔记'），从该位置开始的内容在更新时不会被覆盖。留空则默认为笔记开头。",
	saveManualEditsEndName: "保留区域 - 结束位置",
	saveManualEditsEndDesc:
		"定义模板中的字符串（如 '## 笔记'），到该位置为止的内容在更新时不会被覆盖。留空则默认为笔记末尾。",

	// ── 设置：更新文献库 ──
	updateExistingAllName: "更新现有/所有笔记",
	updateExistingAllDesc:
		'选择在执行"更新文献库"命令时，是否为 Zotero 中存在但 Obsidian 中缺失的条目创建新笔记',
	onlyUpdateExisting: "仅更新已有笔记",
	createNewWhenMissing: "缺失时创建新笔记",

	// ── 命令 ──
	cmdCreateUpdateNote: "创建/更新文献笔记",
	cmdUpdateLibrary: "更新文献库",
	cmdUpdateCurrentNote: "更新当前笔记",

	// ── 通知 ──
	noticeImported: (citeKey) => `已导入 ${citeKey}！`,
	noticeDbNotConfigured: "未配置 Zotero 数据库路径，请在插件设置中进行设置。",
	noticeDbReadFailed: "读取 Zotero 数据库失败：",
	noticeUpdatedEntries: (count) => `已更新 ${count} 个条目`,
	noticeCurrentNoteUpdated: (name) => `当前笔记 ${name} 已更新`,
	noticeCurrentNoteNotFound: (name) => `当前笔记 ${name} 未在文献库中找到`,
	noticeCiteKeyNotFound: (name) => `无法从当前笔记识别 citeKey：${name}`,

	// ── 模态框 ──
	labelTags: "标签：",
	noSearchResult: "未找到相关结果",
};

const locales: Record<Locale, I18nStrings> = { en, zh };

let _t: I18nStrings | null = null;

/** Get the localized string table. Result is cached after first call. */
export function t(): I18nStrings {
	if (!_t) {
		_t = locales[detectLocale()];
	}
	return _t;
}


