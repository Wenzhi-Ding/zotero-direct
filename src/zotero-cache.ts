/**
 * Zotero Data Cache Manager
 * 
 * Caches Zotero database data with incremental updates.
 * Only reads changed items from database for better performance.
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

// ── Cache Manager Class ─────────────────────────────────────────────

export class ZoteroCacheManager {
	private cache: ZoteroCache | null = null;
	private cacheFilePath: string = "";
	private dbPath: string = "";
	private app: App;

	constructor(app: App, dbPath: string) {
		this.app = app;
		this.dbPath = dbPath;
		this.cacheFilePath = this.getCacheFilePath();
	}

	/**
	 * Get the path to the cache file (vault-relative, stored in plugin data folder)
	 */
	private getCacheFilePath(): string {
		return normalizePath(this.app.vault.configDir + "/plugins/zotero-direct/zotero-cache.json");
	}

	/**
	 * Load cache from disk
	 */
	async loadCache(): Promise<ZoteroCache | null> {
		try {
			if (!(await this.app.vault.adapter.exists(this.cacheFilePath))) {
				return null;
			}
			const data = await this.app.vault.adapter.read(this.cacheFilePath);
			const cache = JSON.parse(data) as ZoteroCache;
			
			// Rebuild index if missing
			if (!cache.itemIndex) {
				cache.itemIndex = this.buildItemIndex(cache.items);
			}
			
			this.cache = cache;
			return cache;
		} catch (e) {
			console.warn("[BibNotes] Failed to load cache:", e);
			return null;
		}
	}

	/**
	 * Save cache to disk
	 */
	async saveCache(): Promise<void> {
		try {
			if (this.cache) {
				// Update index before saving
				this.cache.itemIndex = this.buildItemIndex(this.cache.items);
				await this.app.vault.adapter.write(this.cacheFilePath, JSON.stringify(this.cache, null, 2));
			}
		} catch (e) {
			console.warn("[BibNotes] Failed to save cache:", e);
		}
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
	async hasDbChanged(): Promise<boolean> {
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
	 * Update cache with new/updated items
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
		} else {
			// Incremental update
			if (updatedItemKeys && updatedItemKeys.length > 0) {
				// Update only changed items
				for (const item of items) {
					const existingIndex = this.cache.itemIndex[item.citationKey];
					if (existingIndex !== undefined) {
						// Update existing item
						this.cache.items[existingIndex] = item;
					} else {
						// Add new item
						this.cache.items.push(item);
					}
				}
				// Rebuild index after updates
				this.cache.itemIndex = this.buildItemIndex(this.cache.items);
			} else {
				// Full refresh
				this.cache.items = items;
				this.cache.collections = collections;
				this.cache.itemIndex = this.buildItemIndex(items);
			}
			
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
	 * Clear cache
	 */
	async clearCache(): Promise<void> {
		this.cache = null;
		try {
			if (await this.app.vault.adapter.exists(this.cacheFilePath)) {
				await this.app.vault.adapter.remove(this.cacheFilePath);
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
