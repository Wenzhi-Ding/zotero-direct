/**
 * Zotero SQLite Database Reader
 *
 * Reads reference data directly from Zotero's SQLite database.
 * Works when Zotero is both open and closed:
 * - When closed: reads the database file directly
 * - When open: reads the file via fs (SQLite shared read locks allow this)
 *
 * Note: When Zotero is open with WAL mode, very recent uncommitted changes
 * may not be visible (they're in the WAL file). This is acceptable for
 * the library reading use case.
 */

import * as fs from "fs";
import * as path from "path";
import { Reference, Collection } from "./types";

// ── Helper: safely convert unknown to string ─────────────────────────

function asString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return '';
}

// ── Minimal sql.js type definitions ──────────────────────────────────

type SqlJsValue = string | number | Uint8Array | null;

interface SqlJsDatabase {
	exec(sql: string): { columns: string[]; values: SqlJsValue[][] }[];
	close(): void;
}

interface SqlJsStatic {
	Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

// ── sql.js singleton ─────────────────────────────────────────────────

interface GlobalWithSqlJs {
	initSqlJs?: (config: { wasmBinary: ArrayBuffer }) => Promise<SqlJsStatic>;
}

let cachedSqlJs: SqlJsStatic | null = null;
let sqlJsLoadingPromise: Promise<SqlJsStatic> | null = null;

/**
 * 懒加载 sql.js - 从插件目录动态加载 sql-wasm.js
 * 这样可以避免将 sql.js 打包进 main.js，大幅减小体积
 */
async function loadSqlJsFromPluginDir(pluginDir: string): Promise<SqlJsStatic> {
	// 预先读取 wasm 二进制文件，避免 sql.js 内部 fetch() 加载本地路径失败
	const wasmPath = path.join(pluginDir, "sql-wasm.wasm");
	if (!fs.existsSync(wasmPath)) {
		throw new Error(`缺少 sql-wasm.wasm 文件，请确保文件存在于: ${wasmPath}`);
	}
	const wasmBinary = fs.readFileSync(wasmPath).buffer;

	// 检查全局是否已加载
	const g = globalThis as unknown as GlobalWithSqlJs;
	if (g.initSqlJs) {
		return g.initSqlJs({ wasmBinary });
	}

	// 读取 sql-wasm.js 文件内容
	const sqlJsPath = path.join(pluginDir, "sql-wasm.js");
	if (!fs.existsSync(sqlJsPath)) {
		throw new Error(`缺少 sql-wasm.js 文件，请确保文件存在于: ${sqlJsPath}`);
	}

	const sqlJsContent = fs.readFileSync(sqlJsPath, "utf-8");

	// 创建一个函数来执行 sql-wasm.js 代码
	// 关键：暂时屏蔽 module/exports，让 UMD 格式挂载 initSqlJs 到全局
	// eslint-disable-next-line @typescript-eslint/no-implied-eval -- Loading sql-wasm.js UMD module requires dynamic code evaluation
	const loader = new Function('globalThis', 'window', 'global', 'module', 'exports', `
		${sqlJsContent}
		return typeof initSqlJs !== 'undefined' ? initSqlJs : undefined;
	`);
	
	const initSqlJs = loader(globalThis, globalThis, globalThis, undefined, undefined);

	if (!initSqlJs) {
		throw new Error("sql-wasm.js 加载失败，未找到 initSqlJs 函数");
	}

	// 挂载到 globalThis，供后续使用
	(globalThis as unknown as GlobalWithSqlJs).initSqlJs = initSqlJs;

	return await initSqlJs({ wasmBinary });
}

async function initSql(pluginDir?: string): Promise<SqlJsStatic> {
	if (cachedSqlJs) return cachedSqlJs;
	
	// 防止重复加载
	if (sqlJsLoadingPromise) {
		return sqlJsLoadingPromise;
	}

	if (!pluginDir) {
		throw new Error("首次加载 sql.js 需要提供 pluginDir 参数");
	}

	sqlJsLoadingPromise = loadSqlJsFromPluginDir(pluginDir);
	cachedSqlJs = await sqlJsLoadingPromise;
	return cachedSqlJs;
}

// ── Helper: run a query and return rows as objects ───────────────────

function query(db: SqlJsDatabase, sql: string): Record<string, unknown>[] {
	const results = db.exec(sql);
	if (!results.length) return [];
	const result = results[0];
	if (!result) return [];
	const { columns, values } = result;
	return values.map((row: SqlJsValue[]) => {
		const obj: Record<string, unknown> = {};
		columns.forEach((col: string, i: number) => (obj[col] = row[i]));
		return obj;
	});
}

// ── Public data type ─────────────────────────────────────────────────

export interface ZoteroData {
	items: Reference[];
	collections: Record<string, Collection>;
}

// ── Incremental Update Types ─────────────────────────────────────────

interface IncrementalUpdate {
	items: Reference[];
	updatedItemKeys: string[];
	collections: Record<string, Collection>;
}

// ── Utility: DB modification time ────────────────────────────────────

/**
 * Get the modification time of the Zotero database file.
 * Returns 0 if the file does not exist.
 */
export function getDbModificationTime(dbPath: string): number {
	if (!fs.existsSync(dbPath)) return 0;
	return fs.statSync(dbPath).mtimeMs;
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Read the Zotero SQLite database and return items + collections
 * in the same shape the rest of the plugin expects.
 */
export async function readZoteroDatabase(dbPath: string, pluginDir: string): Promise<ZoteroData> {
	if (!fs.existsSync(dbPath)) {
		throw new Error("Zotero database not found at: " + dbPath);
	}

	const SQL = await initSql(pluginDir);
	const buffer = fs.readFileSync(dbPath);
	const db = new SQL.Database(new Uint8Array(buffer));

	// Optionally read BetterBibTeX citation keys
	let bbtCiteKeys: Record<number, string> = {};
	const bbtDbPath = path.join(path.dirname(dbPath), "better-bibtex.sqlite");
	if (fs.existsSync(bbtDbPath)) {
		try {
			const bbtBuf = fs.readFileSync(bbtDbPath);
			const bbtDb = new SQL.Database(new Uint8Array(bbtBuf));
			bbtCiteKeys = extractBBTCiteKeys(bbtDb);
			bbtDb.close();
		} catch (e) {
			// eslint-disable-next-line no-console -- Non-critical warning for optional BetterBibTeX integration
			console.warn("Could not read BetterBibTeX database:", e);
		}
	}

	try {
		const items = extractItems(db, bbtCiteKeys, dbPath);
		const collections = extractCollections(db);
		return { items, collections };
	} finally {
		db.close();
	}
}

/**
 * Read only items modified since a given timestamp
 */
export async function readZoteroDatabaseIncremental(
	dbPath: string,
	sinceTimestamp: number,
	bbtCiteKeys: Record<number, string> = {},
	pluginDir: string = ""
): Promise<IncrementalUpdate | null> {
	if (!fs.existsSync(dbPath)) {
		throw new Error("Zotero database not found at: " + dbPath);
	}

	const SQL = await initSql(pluginDir);
	const buffer = fs.readFileSync(dbPath);
	const db = new SQL.Database(new Uint8Array(buffer));

	// Read BBT citation keys if not provided
	if (Object.keys(bbtCiteKeys).length === 0) {
		const bbtDbPath = path.join(path.dirname(dbPath), "better-bibtex.sqlite");
		if (fs.existsSync(bbtDbPath)) {
			try {
				const bbtBuf = fs.readFileSync(bbtDbPath);
				const bbtDb = new SQL.Database(new Uint8Array(bbtBuf));
				bbtCiteKeys = extractBBTCiteKeys(bbtDb);
				bbtDb.close();
			} catch (e) {
				// eslint-disable-next-line no-console -- Non-critical warning for optional BetterBibTeX integration
				console.warn("Could not read BetterBibTeX database:", e);
			}
		}
	}

	try {
		// 1. Get items modified since timestamp
		const sinceDate = new Date(sinceTimestamp).toISOString();
		const items = query(
			db,
			`SELECT i.itemID, it.typeName AS itemType, i.key AS itemKey,
			        i.dateAdded, i.dateModified, i.libraryID
			 FROM items i
			 JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
			 WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')
			   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
			   AND (i.dateModified > '${sinceDate}' OR i.dateAdded > '${sinceDate}')`
		);

		if (items.length === 0) {
			return null; // No changes
		}

		const itemIds = items.map(i => i.itemID).join(",");

		// 2. Get field data only for modified items
			const fieldRows = query(
				db,
				`SELECT id.itemID, f.fieldName, idv.value
				 FROM itemData id
				 JOIN fields f      ON id.fieldID  = f.fieldID
				 JOIN itemDataValues idv ON id.valueID = idv.valueID
				 WHERE id.itemID IN (${itemIds})`
			);
	
			// 3. Get creators for modified items
			const creatorRows = query(
				db,
				`SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode,
						ct.creatorType, ic.orderIndex
				 FROM itemCreators ic
				 JOIN creators    c  ON ic.creatorID     = c.creatorID
				 JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
				 WHERE ic.itemID IN (${itemIds})
				 ORDER BY ic.itemID, ic.orderIndex`
			);
	
			// 4. Get tags for modified items
			const tagRows = query(
				db,
				`SELECT it.itemID, t.name AS tag
				 FROM itemTags it
				 JOIN tags t ON it.tagID = t.tagID
				 WHERE it.itemID IN (${itemIds})`
			);
	
			// Process the data
			const fieldsByItem: Record<number, Record<string, string>> = {};
			for (const f of fieldRows) {
				if (!fieldsByItem[f.itemID as number]) fieldsByItem[f.itemID as number] = {};
				fieldsByItem[f.itemID as number]![f.fieldName as string] = f.value as string;
			}
	
			const creatorsByItem: Record<number, Record<string, string>[]> = {};
			for (const c of creatorRows) {
				const cItemID = c.itemID as number;
				if (!creatorsByItem[cItemID]) creatorsByItem[cItemID] = [];
				if (c.fieldMode === 1) {
					creatorsByItem[cItemID].push({
						creatorType: asString(c.creatorType),
						firstName: "",
						lastName: "",
						name: asString(c.lastName),
					});
				} else {
					creatorsByItem[cItemID].push({
						creatorType: asString(c.creatorType),
						firstName: asString(c.firstName),
						lastName: asString(c.lastName),
						name: "",
					});
				}
			}
	
			const tagsByItem: Record<number, { tag: string }[]> = {};
			for (const t of tagRows) {
				const tItemID = t.itemID as number;
				if (!tagsByItem[tItemID]) tagsByItem[tItemID] = [];
				tagsByItem[tItemID].push({ tag: asString(t.tag) });
			}

		// Build references
		const references: Reference[] = [];
		const updatedItemKeys: string[] = [];

		for (const item of items) {
			const itemID = item.itemID as number;
			const itemKey = asString(item.itemKey);
			const itemType = asString(item.itemType);
			const fields = fieldsByItem[itemID] || {};

			let citationKey = "";
			if (bbtCiteKeys[itemID]) {
				citationKey = bbtCiteKeys[itemID]!;
			} else if (fields.citationKey) {
				citationKey = fields.citationKey;
			} else if (fields.extra) {
				const m = fields.extra.match(/^Citation Key:\s*(.+)$/im);
				if (m) citationKey = m[1]!.trim();
			}

			if (!citationKey) continue;

			updatedItemKeys.push(citationKey);

			const ref: Record<string, unknown> = {
				itemID: itemID,
				itemKey: itemKey,
				citationKey: citationKey,
				citeKey: citationKey,
				itemType: itemType,
				title: (fields.title || fields.nameOfAct || "").replace(/^'|'$/g, ""),
				date: fields.date || fields.dateEnacted || "",
				dateModified: asString(item.dateModified),
				publicationTitle: fields.publicationTitle || fields.journalAbbreviation || (itemType === "conferencePaper" ? fields.series : "") || (itemType === "statute" ? fields.code : "") || "",
				volume: fields.volume || "",
				issue: fields.issue || "",
				pages: fields.pages || "",
				// Extended fields for search
				abstractNote: fields.abstractNote || "",
				DOI: fields.DOI || "",
				ISBN: fields.ISBN || "",
				ISSN: fields.ISSN || "",
				url: fields.url || "",
				dateAdded: asString(item.dateAdded),
				creators: creatorsByItem[itemID] || [],
				tags: tagsByItem[itemID] || [],
				attachments: [],
				notes: [],
				select: `zotero://select/library/items/${itemKey}`,
				authorKey: "",
				authorKeyInitials: "",
				authorKeyFullName: "",
				id: itemID,
				year: "",
				citationInLine: "",
				citationInLineInitials: "",
				citationInLineFullName: "",
				citationShort: "",
				citationFull: "",
				inlineReference: "",
				file: "",
				filePath: "",
				zoteroReaderLink: "",
				localLibrary: "",
				localLibraryLink: "",
				zoteroTags: [],
			};

			// Merge all remaining itemData fields
			for (const [key, value] of Object.entries(fields)) {
				if (!(key in ref)) {
					ref[key] = value;
				}
			}

			references.push(ref as unknown as Reference);
		}

		// Always return full collections on incremental update
		const collections = extractCollections(db);

		return { items: references, updatedItemKeys, collections };
	} finally {
		db.close();
	}
}

// ── BetterBibTeX citation keys ───────────────────────────────────────

function extractBBTCiteKeys(db: SqlJsDatabase): Record<number, string> {
	const keys: Record<number, string> = {};

	// BBT stores data in a key-value table named "better-bibtex"
	// with name='better-bibtex.citekey' and value = JSON blob
	try {
		const rows = query(
			db,
			`SELECT * FROM "better-bibtex" WHERE name = 'better-bibtex.citekey'`
		);
		if (rows.length > 0 && rows[0]?.value) {
			const parsed = JSON.parse(asString(rows[0]?.value));
			if (Array.isArray(parsed?.data)) {
				for (const entry of parsed.data) {
					if (entry.itemID && entry.citekey) {
						keys[entry.itemID] = entry.citekey;
					}
				}
			}
		}
	} catch {
		// Try alternative BBT schema (older versions)
		try {
			const rows = query(
				db,
				`SELECT itemID, citationKey FROM citationkey`
			);
			for (const row of rows) {
				keys[row.itemID as number] = asString(row.citationKey);
			}
		} catch {
			// eslint-disable-next-line no-console -- Non-critical warning for optional BetterBibTeX integration
			console.warn("Could not extract BBT citation keys from any known schema");
		}
	}
	return keys;
}

// ── Item extraction ──────────────────────────────────────────────────

function extractItems(
	db: SqlJsDatabase,
	bbtCiteKeys: Record<number, string>,
	dbPath: string
): Reference[] {
	// 1. All regular items (skip attachments, notes, annotations, deleted)
	const items = query(
		db,
		`SELECT i.itemID, it.typeName AS itemType, i.key AS itemKey,
		        i.dateAdded, i.dateModified, i.libraryID
		 FROM items i
		 JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
		 WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')
		   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)`
	);

	// 2. All field data (itemData + fields + itemDataValues)
	const fieldRows = query(
		db,
		`SELECT id.itemID, f.fieldName, idv.value
		 FROM itemData id
		 JOIN fields f      ON id.fieldID  = f.fieldID
		 JOIN itemDataValues idv ON id.valueID = idv.valueID`
	);
	const fieldsByItem: Record<number, Record<string, string>> = {};
	for (const f of fieldRows) {
		if (!fieldsByItem[f.itemID as number]) fieldsByItem[f.itemID as number] = {};
		fieldsByItem[f.itemID as number]![f.fieldName as string] = f.value as string;
	}

	// 3. Creators
	const creatorRows = query(
		db,
		`SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode,
				ct.creatorType, ic.orderIndex
		 FROM itemCreators ic
		 JOIN creators    c  ON ic.creatorID     = c.creatorID
		 JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
		 ORDER BY ic.itemID, ic.orderIndex`
	);
	const creatorsByItem: Record<number, Record<string, string>[]> = {};
	for (const c of creatorRows) {
		const cItemID = c.itemID as number;
		if (!creatorsByItem[cItemID]) creatorsByItem[cItemID] = [];
		if (c.fieldMode === 1) {
			// Institutional / single-field creator
			creatorsByItem[cItemID].push({
				creatorType: asString(c.creatorType),
				firstName: "",
				lastName: "",
				name: asString(c.lastName),
			});
		} else {
			// Personal creator (firstName + lastName)
			creatorsByItem[cItemID].push({
				creatorType: asString(c.creatorType),
				firstName: asString(c.firstName),
				lastName: asString(c.lastName),
				name: "",
			});
		}
	}

	// 4. Tags
	const tagRows = query(
		db,
		`SELECT it.itemID, t.name AS tag
		 FROM itemTags it
		 JOIN tags t ON it.tagID = t.tagID`
	);
	const tagsByItem: Record<number, { tag: string }[]> = {};
	for (const t of tagRows) {
		const tItemID = t.itemID as number;
		if (!tagsByItem[tItemID]) tagsByItem[tItemID] = [];
		tagsByItem[tItemID].push({ tag: asString(t.tag) });
	}

	// 5. Attachments
	const zoteroDir = path.dirname(dbPath);
	const attachRows = query(
		db,
		`SELECT ia.parentItemID, ia.path, ia.contentType,
		        i.key AS itemKey, i.dateAdded, i.dateModified,
		        (SELECT idv2.value
		         FROM itemData id2
		         JOIN fields f2          ON id2.fieldID = f2.fieldID AND f2.fieldName = 'title'
		         JOIN itemDataValues idv2 ON id2.valueID = idv2.valueID
		         WHERE id2.itemID = ia.itemID) AS title
		 FROM itemAttachments ia
		 JOIN items i ON ia.itemID = i.itemID
		 WHERE ia.parentItemID IS NOT NULL
		   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)`
	);
	const attachmentsByItem: Record<number, Record<string, unknown>[]> = {};
	for (const a of attachRows) {
		const parentItemID = a.parentItemID as number;
		if (!attachmentsByItem[parentItemID])
			attachmentsByItem[parentItemID] = [];

		let filePath = asString(a.path);
		let title = asString(a.title);
		const itemKey = asString(a.itemKey);

		if (filePath.startsWith("storage:")) {
			const filename = filePath.replace("storage:", "");
			filePath = path.join(zoteroDir, "storage", itemKey, filename);
			if (!title) title = filename;
		} else {
			if (!title) title = path.basename(filePath);
		}

		attachmentsByItem[parentItemID].push({
			dateAdded: a.dateAdded,
			dateModified: a.dateModified,
			itemType: "attachment",
			path: filePath,
			relations: [],
			select: `zotero://select/library/items/${itemKey}`,
			tags: [],
			title: title,
			uri: "",
		});
	}

	// 6. Notes
	const noteRows = query(
		db,
		`SELECT n.parentItemID, n.note, n.title,
		        i.key, i.dateAdded, i.dateModified
		 FROM itemNotes n
		 JOIN items i ON n.itemID = i.itemID
		 WHERE n.parentItemID IS NOT NULL
		   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)`
	);
	const notesByItem: Record<number, Record<string, unknown>[]> = {};
	for (const n of noteRows) {
		const parentItemID = n.parentItemID as number;
		if (!notesByItem[parentItemID]) notesByItem[parentItemID] = [];
		notesByItem[parentItemID].push({
			dateAdded: n.dateAdded,
			dateModified: n.dateModified,
			itemType: "note",
			key: n.key,
			note: asString(n.note),
			parentItem: "",
			relations: [],
			tags: [],
			uri: "",
			version: 0,
		});
	}

	// 7. Build Reference objects
	const references: Reference[] = [];

	for (const item of items) {
		const itemID = item.itemID as number;
		const itemKey = asString(item.itemKey);
		const itemType = asString(item.itemType);
		const fields = fieldsByItem[itemID] || {};

		// ── Determine citation key ──
		let citationKey = "";
		// Priority: BBT database → citationKey field → extra field
		if (bbtCiteKeys[itemID]) {
			citationKey = bbtCiteKeys[itemID]!;
		} else if (fields.citationKey) {
			citationKey = fields.citationKey;
		} else if (fields.extra) {
			const m = fields.extra.match(/^Citation Key:\s*(.+)$/im);
			if (m) citationKey = m[1]!.trim();
		}

		// Skip items without a citation key
		if (!citationKey) continue;

		const ref: Record<string, unknown> = {
			// ── identifiers ──
			itemID: itemID,
			itemKey: itemKey,
			citationKey: citationKey,
			citeKey: citationKey,
			itemType: itemType,

			// ── basic metadata ──
			title: fields.title || fields.nameOfAct || "",
			date: fields.date || fields.dateEnacted || "",
			dateModified: asString(item.dateModified),
			publicationTitle:
				fields.publicationTitle || fields.journalAbbreviation || (itemType === "conferencePaper" ? fields.series : "") || (itemType === "statute" ? fields.code : "") || "",
			volume: fields.volume || "",
			issue: fields.issue || "",
			pages: fields.pages || "",

			// ── relationships ──
			creators: creatorsByItem[itemID] || [],
			tags: tagsByItem[itemID] || [],
			attachments: attachmentsByItem[itemID] || [],
			notes: notesByItem[itemID] || [],

			// ── Zotero links ──
			select: `zotero://select/library/items/${itemKey}`,

			// ── Fields populated later by parseMetadata ──
			authorKey: "",
			authorKeyInitials: "",
			authorKeyFullName: "",
			id: itemID,
			year: "",
			citationInLine: "",
			citationInLineInitials: "",
			citationInLineFullName: "",
			citationShort: "",
			citationFull: "",
			inlineReference: "",
			file: "",
			filePath: "",
			zoteroReaderLink: "",
			localLibrary: "",
			localLibraryLink: "",
			zoteroTags: [],
		};

		// Merge all remaining itemData fields so they are available for
		// template replacement (e.g. {{abstractNote}}, {{DOI}}, etc.)
		for (const [key, value] of Object.entries(fields)) {
			if (!(key in ref)) {
				ref[key] = value;
			}
		}

		references.push(ref as unknown as Reference);
	}

	return references;
}

// ── Collection extraction ────────────────────────────────────────────

function extractCollections(
	db: SqlJsDatabase
): Record<string, Collection> {
	const collRows = query(
		db,
		`SELECT c.collectionID, c.collectionName AS name,
		        c.key, c.parentCollectionID
		 FROM collections c`
	);

	// Map collectionID → key for parent lookup
	const idToKey: Record<number, string> = {};
	for (const c of collRows) {
		idToKey[c.collectionID as number] = asString(c.key);
	}

	// Items per collection
	const ciRows = query(
		db,
		`SELECT ci.collectionID, ci.itemID
		 FROM collectionItems ci`
	);
	const itemsByCollection: Record<number, number[]> = {};
	for (const ci of ciRows) {
		const collID = ci.collectionID as number;
		if (!itemsByCollection[collID])
			itemsByCollection[collID] = [];
		itemsByCollection[collID].push(ci.itemID as number);
	}

	// Build objects
	const result: Record<string, Collection> = {};
	for (const c of collRows) {
		const key = asString(c.key);
		result[key] = {
			collections: [],
			items: (itemsByCollection[c.collectionID as number] || []).map(String),
			key: key,
			name: asString(c.name),
			parent: c.parentCollectionID
				? idToKey[c.parentCollectionID as number] || ""
				: "",
		};
	}

	return result;
}
