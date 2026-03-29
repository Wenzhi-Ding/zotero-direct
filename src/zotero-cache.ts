/**
 * Zotero Data Cache Manager
 * 
 * Caches Zotero database data with incremental updates.
 * Uses JSONL format (one JSON object per line) for efficient incremental saves:
 *   Line 1: metadata (version, timestamps, collections)
 *   Line 2+: one CachedReference per line
 * 
 * Incremental save: reads existing file, removes changed items, appends
 * updated versions at the end — avoids full JSON.stringify of all items.
 */

import { Reference, Collection } from "./types";
import { App, normalizePath } from "obsidian";
import { getDbModificationTime } from "./zotero-db";

// ── Cache Types ─────────────────────────────────────────────────────

export interface CachedReference extends Reference {
	authorFullNames?: string[];
	keywords?: string[];
	jelCodes?: string[];
	dateAdded?: string;
}

interface ZoteroCache {
	version: number;
	lastModified: string;
	dbLastModified: number;
	items: CachedReference[];
	collections: Record<string, Collection>;
	itemIndex: Record<string, number>; // citationKey -> index mapping
}

/** Metadata stored as the first line of the JSONL cache file */
interface CacheMetadata {
	version: number;
	lastModified: string;
	dbLastModified: number;
	collections: Record<string, Collection>;
}

// ── Cache Manager Class ─────────────────────────────────────────────

export class ZoteroCacheManager {
	private cache: ZoteroCache | null = null;
	private cacheFilePath: string = "";
	private legacyCacheFilePath: string = "";
	private dbPath: string = "";
	private app: App;
	/** Keys that have been modified since last save */
	private dirtyKeys: Set<string> = new Set();

	constructor(app: App, dbPath: string) {
		this.app = app;
		this.dbPath = dbPath;
		this.cacheFilePath = this.getCacheFilePath();
		this.legacyCacheFilePath = this.getLegacyCacheFilePath();
	}

	/**
	 * Get the path to the JSONL cache file
	 */
	private getCacheFilePath(): string {
		return normalizePath(this.app.vault.configDir + "/plugins/zotero-direct/zotero-cache.jsonl");
	}

	/**
	 * Get the path to the legacy JSON cache file (for migration)
	 */
	private getLegacyCacheFilePath(): string {
		return normalizePath(this.app.vault.configDir + "/plugins/zotero-direct/zotero-cache.json");
	}

	/**
	 * Load cache from disk (JSONL format, with legacy JSON migration)
	 */
	async loadCache(): Promise<ZoteroCache | null> {
		try {
			let fileData: string | null = null;
			let isLegacy = false;

			// Try JSONL file first
			if (await this.app.vault.adapter.exists(this.cacheFilePath)) {
				fileData = await this.app.vault.adapter.read(this.cacheFilePath);
			} else if (await this.app.vault.adapter.exists(this.legacyCacheFilePath)) {
				// Migrate from legacy JSON format
				fileData = await this.app.vault.adapter.read(this.legacyCacheFilePath);
				isLegacy = true;
			}

			if (!fileData) return null;

			if (isLegacy) {
				// Parse legacy JSON format
				const cache = JSON.parse(fileData) as ZoteroCache;
				if (!cache.itemIndex) {
					cache.itemIndex = this.buildItemIndex(cache.items);
				}
				this.cache = cache;
				// Migrate: save as JSONL and remove legacy file
				await this.saveCache();
				try {
					await this.app.vault.adapter.remove(this.legacyCacheFilePath);
				} catch { /* ignore */ }
				console.debug("[BibNotes] Migrated cache from JSON to JSONL format");
				return this.cache;
			}

			// Parse JSONL format
			const lines = fileData.split('\n');
			const firstLine = lines[0];
			if (!firstLine || !firstLine.trim()) return null;

			const metadata = JSON.parse(firstLine) as CacheMetadata;

			// Parse item lines — deduplicate by citationKey (last wins)
			const itemMap = new Map<string, CachedReference>();
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i];
				if (!line || !line.trim()) continue;
				try {
					const item = JSON.parse(line) as CachedReference;
					if (item.citationKey) {
						itemMap.set(item.citationKey, item);
					}
				} catch {
					// Skip malformed lines
				}
			}

			const items = Array.from(itemMap.values());

			this.cache = {
				version: metadata.version,
				lastModified: metadata.lastModified,
				dbLastModified: metadata.dbLastModified,
				items,
				collections: metadata.collections,
				itemIndex: this.buildItemIndex(items),
			};
			return this.cache;
		} catch (e) {
			console.warn("[BibNotes] Failed to load cache:", e);
			return null;
		}
	}

	/**
	 * Full save — writes the entire cache in JSONL format.
	 * Use this for initial creation or full refresh.
	 */
	async saveCache(): Promise<void> {
		try {
			if (!this.cache) return;
			this.cache.itemIndex = this.buildItemIndex(this.cache.items);

			const parts: string[] = [];

			// Line 1: metadata
			const metadata: CacheMetadata = {
				version: this.cache.version,
				lastModified: this.cache.lastModified,
				dbLastModified: this.cache.dbLastModified,
				collections: this.cache.collections,
			};
			parts.push(JSON.stringify(metadata));

			// Line 2+: one item per line (compact JSON)
			for (const item of this.cache.items) {
				parts.push(JSON.stringify(item));
			}

			await this.app.vault.adapter.write(this.cacheFilePath, parts.join('\n'));
			this.dirtyKeys.clear();
		} catch (e) {
			console.warn("[BibNotes] Failed to save cache:", e);
		}
	}

	/**
	 * Incremental save — only removes changed items and appends their
	 * updated versions at the tail of the JSONL file.
	 * Falls back to full save when the file doesn't exist yet or when
	 * there are no dirty keys.
	 */
	async saveCacheIncremental(): Promise<void> {
		try {
			if (!this.cache) return;

			// Nothing changed → skip
			if (this.dirtyKeys.size === 0) return;

			// No existing file → full save
			if (!(await this.app.vault.adapter.exists(this.cacheFilePath))) {
				await this.saveCache();
				return;
			}

			// If too many items changed (>30%), full save is faster
			if (this.cache.items.length > 0 &&
				this.dirtyKeys.size > this.cache.items.length * 0.3) {
				await this.saveCache();
				return;
			}

			// Read existing JSONL file
			const fileData = await this.app.vault.adapter.read(this.cacheFilePath);
			const lines = fileData.split('\n');

			if (lines.length === 0 || !lines[0]?.trim()) {
				await this.saveCache();
				return;
			}

			// Build updated metadata line
			const metadata: CacheMetadata = {
				version: this.cache.version,
				lastModified: this.cache.lastModified,
				dbLastModified: this.cache.dbLastModified,
				collections: this.cache.collections,
			};

			const newLines: string[] = [JSON.stringify(metadata)];

			// Keep unchanged item lines (filter out dirty keys)
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i];
				if (!line || !line.trim()) continue;

				// Extract citationKey with a fast string search instead of full JSON.parse
				const key = this.extractCitationKeyFromLine(line);
				if (key && this.dirtyKeys.has(key)) {
					// Skip — the updated version will be appended below
					continue;
				}
				newLines.push(line);
			}

			// Append updated items at the tail
			for (const key of this.dirtyKeys) {
				const item = this.getItemByCitationKey(key);
				if (item) {
					newLines.push(JSON.stringify(item));
				}
			}

			await this.app.vault.adapter.write(this.cacheFilePath, newLines.join('\n'));
			this.dirtyKeys.clear();
		} catch (e) {
			console.warn("[BibNotes] Incremental save failed, falling back to full save:", e);
			await this.saveCache();
		}
	}

	/**
	 * Extract citationKey from a JSONL line using fast string search.
	 * Avoids a full JSON.parse for filtering purposes.
	 */
	private extractCitationKeyFromLine(line: string): string | null {
		const match = line.match(/"citationKey":"([^"]+)"/);
		return match ? match[1]! : null;
	}

	/**
	 * Build citationKey -> index mapping for fast lookup
	 */
	private buildItemIndex(items: CachedReference[]): Record<string, number> {
		const index: Record<string, number> = {};
		items.forEach((item, i) => {
			if (item.citationKey) {
				index[item.citationKey] = i;
			}
		});
		return index;
	}

	/**
	 * Check if database has been modified since last cache
	 */
	hasDbChanged(): boolean {
		const dbModifiedTime = getDbModificationTime(this.dbPath);
		if (dbModifiedTime === 0) return true;
		if (!this.cache) return true;
		return dbModifiedTime > this.cache.dbLastModified;
	}

	/**
	 * Get database modification time
	 */
	getDbLastModified(): number {
		return getDbModificationTime(this.dbPath);
	}

	/**
	 * Get cached data (returns null if cache is empty)
	 */
	getCache(): ZoteroCache | null {
		return this.cache;
	}

	/**
	 * Update cache with new/updated items.
	 * When updatedItemKeys is provided, tracks them as dirty for
	 * the next incremental save.
	 */
	updateCache(
		items: CachedReference[],
		collections: Record<string, Collection>,
		updatedItemKeys?: string[]
	): void {
		const dbLastModified = this.getDbLastModified();
		
		if (!this.cache) {
			// First time: create new cache
			this.cache = {
				version: 1,
				lastModified: new Date().toISOString(),
				dbLastModified,
				items,
				collections,
				itemIndex: this.buildItemIndex(items),
			};
			// First time is always a full save, no dirty tracking needed
			this.dirtyKeys.clear();
		} else {
			// Incremental update
			if (updatedItemKeys && updatedItemKeys.length > 0) {
				// Update only changed items
				for (const item of items) {
					const existingIndex = this.cache.itemIndex[item.citationKey];
					if (existingIndex !== undefined) {
						this.cache.items[existingIndex] = item;
					} else {
						this.cache.items.push(item);
					}
					// Track as dirty for incremental save
					this.dirtyKeys.add(item.citationKey);
				}
				this.cache.itemIndex = this.buildItemIndex(this.cache.items);
			} else {
				// Full refresh — clear dirty since we'll do full save
				this.cache.items = items;
				this.cache.collections = collections;
				this.cache.itemIndex = this.buildItemIndex(items);
				this.dirtyKeys.clear();
			}
			
			this.cache.collections = collections;
			this.cache.dbLastModified = dbLastModified;
			this.cache.lastModified = new Date().toISOString();
		}
	}

	/**
	 * Get item by citation key (fast lookup using index)
	 */
	getItemByCitationKey(citationKey: string): CachedReference | null {
		if (!this.cache || !this.cache.itemIndex) {
			return null;
		}
		const index = this.cache.itemIndex[citationKey];
		if (index !== undefined && index >= 0 && index < this.cache.items.length) {
			return this.cache.items[index] ?? null;
		}
		return null;
	}

	/**
	 * Search items by keyword (searches title, abstract, authors, keywords)
	 * Supports combination search with multiple keywords separated by spaces.
	 * Items matching all keywords are prioritized and sorted by match score.
	 */
	searchItems(query: string): CachedReference[] {
		const results = this.searchItemsWithScore(query);
		return results.map(r => r.item);
	}

	/**
	 * Search items and return with scores for advanced sorting
	 */
	searchItemsWithScore(query: string): { item: CachedReference; score: number; matchesAllKeywords: boolean }[] {
		if (!this.cache) {
			return [];
		}

		const lowerQuery = query.toLowerCase().trim();
		if (!lowerQuery) {
			return this.cache.items.map(item => ({ item, score: 0, matchesAllKeywords: true }));
		}

		// Split query into individual keywords
		const keywords = lowerQuery.split(/\s+/).filter(kw => kw.length > 0);
		
		const scoredItems: { item: CachedReference; score: number; matchesAllKeywords: boolean }[] = [];

		for (const item of this.cache.items) {
			// Get searchable text from various fields
			const searchableText = this.getSearchableText(item);
			
			// Calculate match score
			const scoreResult = this.calculateMatchScore(searchableText, keywords);
			
			if (scoreResult.score > 0) {
				scoredItems.push({
					item,
					score: scoreResult.score,
					matchesAllKeywords: scoreResult.matchesAll
				});
			}
		}

		// Sort by: 1) matches all keywords (desc), 2) score (desc)
		scoredItems.sort((a, b) => {
			if (a.matchesAllKeywords !== b.matchesAllKeywords) {
				return a.matchesAllKeywords ? -1 : 1;
			}
			return b.score - a.score;
		});

		return scoredItems;
	}

	/**
	 * Get searchable text from item fields
	 */
	private getSearchableText(item: CachedReference): string {
		const parts: string[] = [];
		
		if (item.title) parts.push(item.title);
		if (item.abstractNote) parts.push(item.abstractNote);
		if (item.authorKey) parts.push(item.authorKey);
		if (item.authorFullNames) parts.push(...item.authorFullNames);
		if (item.keywords) parts.push(...item.keywords);
		if (item.tags) parts.push(...item.tags.map(t => t.tag));
		if (item.jelCodes) parts.push(...item.jelCodes);
		if (item.publicationTitle) parts.push(item.publicationTitle);
		if (item.citationKey) parts.push(item.citationKey);
		
		return parts.join(' ').toLowerCase();
	}

	/**
	 * Calculate match score for an item
	 * Returns score and whether all keywords were matched
	 */
	private calculateMatchScore(text: string, keywords: string[]): { score: number; matchesAll: boolean } {
		let totalScore = 0;
		let matchedKeywords = 0;

		for (const keyword of keywords) {
			let keywordScore = 0;

			// Check for exact match (highest score)
			if (text.includes(keyword)) {
				keywordScore += 100;

				// Bonus for word boundary match
				const wordBoundaryRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
				if (wordBoundaryRegex.test(text)) {
					keywordScore += 50;
				}

				// Bonus for exact case match (for multi-word names like "Ross Levine")
				if (text.toLowerCase().includes(keyword.toLowerCase())) {
					keywordScore += 25;
				}
			}

			// Check for fuzzy/partial match (lower score)
			if (keywordScore === 0) {
				// Check if any word in text starts with the keyword
				const words = text.split(/\s+/);
				for (const word of words) {
					if (word.startsWith(keyword)) {
						keywordScore += 30;
						break;
					}
				}
			}

			if (keywordScore > 0) {
				totalScore += keywordScore;
				matchedKeywords++;
			}
		}

		// Bonus for matching all keywords (scaled by number of keywords)
		if (matchedKeywords === keywords.length && keywords.length > 1) {
			totalScore += matchedKeywords * 200;
		}

		return {
			score: totalScore,
			matchesAll: matchedKeywords === keywords.length
		};
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/**
	 * Clear cache (removes both JSONL and legacy JSON files)
	 */
	async clearCache(): Promise<void> {
		this.cache = null;
		this.dirtyKeys.clear();
		try {
			if (await this.app.vault.adapter.exists(this.cacheFilePath)) {
				await this.app.vault.adapter.remove(this.cacheFilePath);
			}
			if (await this.app.vault.adapter.exists(this.legacyCacheFilePath)) {
				await this.app.vault.adapter.remove(this.legacyCacheFilePath);
			}
		} catch (e) {
			console.warn("[BibNotes] Failed to clear cache file:", e);
		}
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { itemCount: number; lastModified: string | null; dbLastModified: number } {
		return {
			itemCount: this.cache?.items.length ?? 0,
			lastModified: this.cache?.lastModified ?? null,
			dbLastModified: this.cache?.dbLastModified ?? 0,
		};
	}
}

// ── Singleton instance ──────────────────────────────────────────────

let cacheManager: ZoteroCacheManager | null = null;

export function getCacheManager(app: App, dbPath: string): ZoteroCacheManager {
	if (!cacheManager || cacheManager["dbPath"] !== dbPath) {
		cacheManager = new ZoteroCacheManager(app, dbPath);
	}
	return cacheManager;
}

export function clearCacheManager(): void {
	cacheManager = null;
}
