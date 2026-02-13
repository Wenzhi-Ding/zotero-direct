import MyPlugin from "./main";
import { App, FileSystemAdapter, Modal, SuggestModal, Notice, Platform, Setting } from "obsidian";

import { Reference, Creator } from "./types";
import { t } from "./i18n";

// Match info interface for tracking which fields matched
interface MatchInfo {
	titleMatches: Array<{start: number, end: number}>;
	authorMatches: Array<{start: number, end: number}>;
	journalMatches: Array<{start: number, end: number}>;
	citeKeyMatches: Array<{start: number, end: number}>;
	abstractMatch: { text: string; index: number; keyword: string } | null;
	tagsMatch: { text: string; index: number; keyword: string } | null;
}

// Scored search result combining reference data with match info
interface ScoredReference {
	reference: Reference;
	score: number;
	matchInfo: MatchInfo;
}

// Pre-computed search data for fast matching
interface SearchableItem {
	item: Reference;
	titleLower: string;
	authorLower: string;
	authorOriginal: string;
	journalLower: string;
	citeKeyLower: string;
	abstractLower: string;
	abstractOriginal: string;
	tagsLower: string;
	tagsOriginal: string;
}

import {
	createAuthorKey,
	createNoteTitle,
	openSelectedNote,
	orderByDateModified,
} from "./utils";

import { readZoteroDatabase, readZoteroDatabaseIncremental, ZoteroData } from "./zotero-db";
import { getCacheManager, CachedReference } from "./zotero-cache";


export class SelectReferenceModal extends SuggestModal<ScoredReference> {
	plugin: MyPlugin;
	template: string;
	selectArray: Reference[];
	allCitationKeys: string[];
	data: ZoteroData;
	// Store current query for highlight rendering
	private currentQuery: string = "";
	// Pre-computed search index for fast matching
	private searchIndex: SearchableItem[] = [];
	// Search results cache and debounce for non-blocking UX
	private searchCache: ScoredReference[] = [];
	private lastSearchQuery: string = "";
	private searchDebounceTimer: number | null = null;
	private lastSearchSet: SearchableItem[] | null = null;
	private static readonly MAX_RESULTS = 50;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
		this.emptyStateText = t().noSearchResult;
	}
	// Function used to move the cursor in the search bar when the modal is launched
	focusInput() {
		//@ts-expect-error - accessing DOM element directly, may be undefined but is expected to exist in modal
		document.getElementsByClassName("prompt-input")[0].focus();
	}
	async onOpen() {
		if (Platform.isDesktopApp) {
			this.focusInput();
		}

		// Read Zotero database with cache
		const dbPath = this.plugin.settings.zoteroDbPath;
		if (!dbPath) {
			new Notice(t().noticeDbNotConfigured);
			return;
		}

		// Initialize cache manager
		const cacheManager = getCacheManager(this.app, dbPath);
		await cacheManager.loadCache();

		let data: ZoteroData;
		let cachedItems: CachedReference[] = [];

		try {
			// Check if database has changed
			const hasChanges = await cacheManager.hasDbChanged();
			
			if (!hasChanges && cacheManager.getCache()) {
				// Use cached data
				const cache = cacheManager.getCache()!;
				cachedItems = cache.items;
				data = { items: cachedItems as Reference[], collections: cache.collections };
				if (this.plugin.settings.debugMode) console.log("[BibNotes] Using cached data:", cachedItems.length, "items");
			} else {
				// Check for incremental update
				const cache = cacheManager.getCache();
				// 获取插件目录的绝对路径
				const adapter = this.app.vault.adapter;
				const vaultBasePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
				const pluginDir = vaultBasePath && this.plugin.manifest.dir 
					? vaultBasePath + "/" + this.plugin.manifest.dir 
					: this.plugin.manifest.dir || "";
				if (cache && cache.dbLastModified > 0) {
					// Try incremental update
					const update = await readZoteroDatabaseIncremental(dbPath, cache.dbLastModified, {}, pluginDir);
					
					if (update && update.items.length > 0) {
						// Merge updates into cache
						cacheManager.updateCache(
							update.items as CachedReference[],
							update.collections,
							update.updatedItemKeys
						);
						await cacheManager.saveCache();
						cachedItems = cacheManager.getCache()!.items;
						data = { items: cachedItems as Reference[], collections: update.collections };
						if (this.plugin.settings.debugMode) console.log("[BibNotes] Incremental update:", update.items.length, "items updated");
					} else {
						// No changes or failed incremental, do full refresh
						data = await readZoteroDatabase(dbPath, pluginDir);
						cacheManager.updateCache(data.items as CachedReference[], data.collections);
						await cacheManager.saveCache();
						cachedItems = data.items as CachedReference[];
						if (this.plugin.settings.debugMode) console.log("[BibNotes] Full refresh:", data.items.length, "items");
					}
				} else {
					// No cache or first time, do full read
					data = await readZoteroDatabase(dbPath, pluginDir);
					cacheManager.updateCache(data.items as CachedReference[], data.collections);
					await cacheManager.saveCache();
					cachedItems = data.items as CachedReference[];
					if (this.plugin.settings.debugMode) console.log("[BibNotes] Initial cache:", data.items.length, "items");
				}
			}
		} catch (e) {
			new Notice(t().noticeDbReadFailed + (e as Error).message);
			console.error(e);
			return;
		}

		//const checkAdmonition  = this.app.plugins.getPlugin("obsidian-admonition")._loaded

		const bibtexArray: Reference[] = [];
		for (let index = 0; index < data.items.length; index++) {
			const selectedEntry = data.items[index];
			if (!selectedEntry) continue;
			const bibtexArrayItem = {} as Reference;

			//Extract the citation key. If the citationkey does not exist skip
			if (selectedEntry.hasOwnProperty("citationKey") == false) continue;
			bibtexArrayItem.citationKey = selectedEntry.citationKey;

			//Extract the title key
			bibtexArrayItem.title = selectedEntry.title;

			// Extract the date
			bibtexArrayItem.date = selectedEntry.date
			if (selectedEntry.hasOwnProperty("date")) {
				selectedEntry.year = selectedEntry.date.match(/\d{4}/)?.[0] || ""
				bibtexArrayItem.date = selectedEntry.year
			}

			//Extract the author (short format for search)
			bibtexArrayItem.authorKey = createAuthorKey(selectedEntry.creators) ?? "";

			//Extract full author names for display
			bibtexArrayItem.authorKeyFullName = createFullAuthorNames(selectedEntry.creators);

			//Extract publication/journal info
			bibtexArrayItem.publicationTitle = selectedEntry.publicationTitle || "";

			//Extract abstract for search context
			bibtexArrayItem.abstractNote = selectedEntry.abstractNote || "";

			// Store full creators array for display
			bibtexArrayItem.creators = selectedEntry.creators;

			//Extract the date the entry was modified
			bibtexArrayItem.dateModified = selectedEntry.dateModified;

			//Create the reference for search (includes all searchable text)
			bibtexArrayItem.inlineReference =
				bibtexArrayItem.authorKey +
				", (" +
				bibtexArrayItem.date +
				"), " +
				bibtexArrayItem.title +
				"\n" +
				bibtexArrayItem.citationKey;

			bibtexArray.push(bibtexArrayItem);
		}
		// Order the suggestions from the one modified most recently
		bibtexArray.sort(orderByDateModified);

		//Export all citationKeys
		this.allCitationKeys = bibtexArray.map((a) => a.citationKey);

		// Removed: "Entire Library" option - no longer added to dropdown

		this.selectArray = bibtexArray;
		this.data = data;

		// Build pre-computed search index for fast matching
		this.buildSearchIndex();

		// 数据加载完成后，延迟触发一次建议刷新
		requestAnimationFrame(() => {
			if (this.inputEl) {
				this.inputEl.dispatchEvent(new Event('input'));
			}
		});
	}


	/**
	 * Build pre-computed search index with lowercase fields.
	 * Called once after data loading to avoid repeated toLowerCase() during search.
	 */
	private buildSearchIndex(): void {
		this.searchIndex = this.selectArray.map(item => {
			const authorOriginal = item.authorKeyFullName || item.authorKey || "";
			const abstractOriginal = item.abstractNote || "";
			const tagsOriginal = item.zoteroTags?.join(" ") || "";
			return {
				item,
				titleLower: (item.title || "").toLowerCase(),
				authorLower: authorOriginal.toLowerCase(),
				authorOriginal,
				journalLower: (item.publicationTitle || "").toLowerCase(),
				citeKeyLower: (item.citationKey || "").toLowerCase(),
				abstractLower: abstractOriginal.toLowerCase(),
				abstractOriginal,
				tagsLower: tagsOriginal.toLowerCase(),
				tagsOriginal,
			};
		});
		// Reset search state
		this.searchCache = [];
		this.lastSearchQuery = "";
		this.lastSearchSet = null;
	}

	/**
	 * Cancel any pending debounced search
	 */
	private cancelPendingSearch(): void {
		if (this.searchDebounceTimer) {
			clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}
	}

	/**
	 * Override getSuggestions with debounced non-blocking search.
	 * Returns cached results immediately so typing is never blocked,
	 * then schedules the actual search and refreshes results.
	 */
	getSuggestions(query: string): ScoredReference[] {
		this.currentQuery = query;

		if (!query || query.trim() === "") {
			this.cancelPendingSearch();
			this.lastSearchQuery = "";
			this.lastSearchSet = null;
			this.searchCache = this.selectArray.map(item => ({
				reference: item,
				score: 0,
				matchInfo: { titleMatches: [], authorMatches: [], journalMatches: [], citeKeyMatches: [], abstractMatch: null, tagsMatch: null }
			}));
			return this.searchCache;
		}

		// If results already computed for this exact query, return them
		if (query === this.lastSearchQuery) {
			return this.searchCache;
		}

		// Cancel previous pending search
		this.cancelPendingSearch();

		// Schedule actual search after debounce (non-blocking)
		const capturedQuery = query;
		this.searchDebounceTimer = window.setTimeout(() => {
			this.searchDebounceTimer = null;
			this.searchCache = this.performSearch(capturedQuery);
			this.lastSearchQuery = capturedQuery;
			// Trigger Obsidian to re-render suggestions
			if (this.inputEl) {
				this.inputEl.dispatchEvent(new Event('input'));
			}
		}, 80);

		// Return cached results immediately (no blocking)
		return this.searchCache;
	}

	/**
	 * Perform the actual search with optimized scoring.
	 * Uses pre-computed search index and incremental filtering.
	 */
	private performSearch(query: string): ScoredReference[] {
		const lowerQuery = query.toLowerCase().trim();
		const keywords = lowerQuery.split(/\s+/).filter(kw => kw.length > 0);

		if (keywords.length === 0) {
			this.lastSearchSet = null;
			return this.selectArray.map(item => ({
				reference: item,
				score: 0,
				matchInfo: { titleMatches: [], authorMatches: [], journalMatches: [], citeKeyMatches: [], abstractMatch: null, tagsMatch: null }
			}));
		}

		// Incremental search: if query extends previous, search within previous matches only
		let searchSet: SearchableItem[];
		const prevQuery = this.lastSearchQuery?.toLowerCase().trim();
		if (prevQuery && lowerQuery.startsWith(prevQuery) && this.lastSearchSet &&
			this.lastSearchSet.length < this.searchIndex.length) {
			searchSet = this.lastSearchSet;
		} else {
			searchSet = this.searchIndex;
		}

		const scoredItems: { item: Reference; score: number; matchInfo: MatchInfo }[] = [];
		const matchedItems: SearchableItem[] = [];

		for (const si of searchSet) {
			const result = this.scoreItem(si, keywords);
			if (result.score > 0) {
				scoredItems.push({
					item: si.item,
					score: result.score,
					matchInfo: result.matchInfo
				});
				matchedItems.push(si);
			}
		}

		// Save matched set for incremental search on next keystroke
		this.lastSearchSet = matchedItems;

		// Sort by score descending and cap results
		scoredItems.sort((a, b) => b.score - a.score);
		const limited = scoredItems.slice(0, SelectReferenceModal.MAX_RESULTS);

		return limited.map(({ item, score, matchInfo }) => ({
			reference: item,
			score,
			matchInfo
		}));
	}

	/**
	 * Score a single item against keywords using pre-computed lowercase fields.
	 * No RegExp creation — uses manual word boundary checks for speed.
	 */
	private scoreItem(si: SearchableItem, keywords: string[]): {
		score: number;
		matchInfo: MatchInfo;
	} {
		let totalScore = 0;
		let matchedKeywords = 0;
		const matchInfo: MatchInfo = {
			titleMatches: [],
			authorMatches: [],
			journalMatches: [],
			citeKeyMatches: [],
			abstractMatch: null,
			tagsMatch: null
		};

		for (const keyword of keywords) {
			let keywordScore = 0;
			let keywordMatched = false;
			let idx: number;

			// Title (weight: 100)
			idx = si.titleLower.indexOf(keyword);
			if (idx !== -1) {
				keywordMatched = true;
				let s = 100;
				if (this.isWordBoundaryMatch(si.titleLower, idx, keyword.length)) s *= 1.5;
				if (idx === 0) s *= 2;
				keywordScore += s;
				this.collectRanges(si.titleLower, keyword, matchInfo.titleMatches);
			}

			// Author (weight: 80)
			idx = si.authorLower.indexOf(keyword);
			if (idx !== -1) {
				keywordMatched = true;
				let s = 80;
				if (this.isWordBoundaryMatch(si.authorLower, idx, keyword.length)) s *= 1.5;
				if (idx === 0) s *= 2;
				keywordScore += s;
				this.collectRanges(si.authorLower, keyword, matchInfo.authorMatches);
			}

			// Journal (weight: 60)
			idx = si.journalLower.indexOf(keyword);
			if (idx !== -1) {
				keywordMatched = true;
				let s = 60;
				if (this.isWordBoundaryMatch(si.journalLower, idx, keyword.length)) s *= 1.5;
				keywordScore += s;
				this.collectRanges(si.journalLower, keyword, matchInfo.journalMatches);
			}

			// Citation Key (weight: 50)
			idx = si.citeKeyLower.indexOf(keyword);
			if (idx !== -1) {
				keywordMatched = true;
				let s = 50;
				if (this.isWordBoundaryMatch(si.citeKeyLower, idx, keyword.length)) s *= 1.5;
				keywordScore += s;
				this.collectRanges(si.citeKeyLower, keyword, matchInfo.citeKeyMatches);
			}

			// Tags (weight: 40)
			if (si.tagsLower.length > 0) {
				idx = si.tagsLower.indexOf(keyword);
				if (idx !== -1) {
					keywordMatched = true;
					let s = 40;
					if (this.isWordBoundaryMatch(si.tagsLower, idx, keyword.length)) s *= 1.5;
					keywordScore += s;
					if (!matchInfo.tagsMatch) {
						matchInfo.tagsMatch = { text: si.tagsOriginal, index: idx, keyword };
					}
				}
			}

			// Abstract (weight: 30)
			if (si.abstractLower.length > 0) {
				idx = si.abstractLower.indexOf(keyword);
				if (idx !== -1) {
					keywordMatched = true;
					let s = 30;
					if (this.isWordBoundaryMatch(si.abstractLower, idx, keyword.length)) s *= 1.5;
					keywordScore += s;
					if (!matchInfo.abstractMatch) {
						matchInfo.abstractMatch = { text: si.abstractOriginal, index: idx, keyword };
					}
				}
			}

			if (keywordMatched) {
				totalScore += keywordScore;
				matchedKeywords++;
			}
		}

		// Bonus for matching all keywords
		if (matchedKeywords === keywords.length && keywords.length > 1) {
			totalScore *= 1.5;
		}

		return {
			score: matchedKeywords > 0 ? totalScore : 0,
			matchInfo
		};
	}

	/**
	 * Collect all match ranges for highlighting
	 */
	private collectRanges(text: string, keyword: string, ranges: Array<{start: number, end: number}>): void {
		let pos = 0;
		while ((pos = text.indexOf(keyword, pos)) !== -1) {
			ranges.push({ start: pos, end: pos + keyword.length });
			pos += 1;
		}
	}

	/**
	 * Check if a match is at a word boundary (without creating RegExp)
	 */
	private isWordBoundaryMatch(text: string, index: number, length: number): boolean {
		const before = index === 0 || !this.isWordChar(text.charCodeAt(index - 1));
		const after = index + length >= text.length || !this.isWordChar(text.charCodeAt(index + length));
		return before && after;
	}

	/**
	 * Check if a character code is a word character (a-z, A-Z, 0-9, _)
	 */
	private isWordChar(code: number): boolean {
		return (code >= 65 && code <= 90) ||   // A-Z
			(code >= 97 && code <= 122) ||  // a-z
			(code >= 48 && code <= 57) ||   // 0-9
			code === 95;                     // _
	}

	/**
	 * Custom render for suggestion items with modern UI design
	 */
	renderSuggestion(item: ScoredReference, el: HTMLElement): void {
		const reference = item.reference;
		const matchInfo = item.matchInfo;

		el.addClass('bibnotes-suggestion-item');

		// Container for the entire suggestion
		const container = el.createDiv({ cls: 'bibnotes-suggestion-container' });

		// Row 1: Title
		const titleRow = container.createDiv({ cls: 'bibnotes-suggestion-title-row' });
		const titleEl = titleRow.createDiv({ cls: 'bibnotes-suggestion-title' });
		if (matchInfo?.titleMatches && matchInfo.titleMatches.length > 0) {
			this.renderHighlightedWithRanges(titleEl, reference.title || "Untitled", matchInfo.titleMatches);
		} else {
			titleEl.setText(reference.title || "Untitled");
		}

		// Row 2: Authors (full width, dynamically truncated)
		const authorsRow = container.createDiv({ cls: 'bibnotes-suggestion-authors-row' });
		const allAuthors = this.getAllAuthorNames(reference);
		if (allAuthors.length > 0) {
			const authorsEl = authorsRow.createSpan({ cls: 'bibnotes-suggestion-authors' });
			// Set full text first, then truncate after layout
			const fullText = allAuthors.join(', ');
			// Recompute highlight ranges on the actual displayed text
			// (pre-computed authorMatches were against authorKeyFullName which uses a different format)
			const hasAuthorMatch = matchInfo?.authorMatches && matchInfo.authorMatches.length > 0;
			const authorDisplayRanges = hasAuthorMatch ? this.findHighlightRanges(fullText, this.currentQuery) : [];
			if (authorDisplayRanges.length > 0) {
				this.renderHighlightedWithRanges(authorsEl, fullText, authorDisplayRanges);
			} else {
				authorsEl.setText(fullText);
			}
			// After layout, dynamically truncate to fit one line
			if (allAuthors.length > 2) {
				const truncRanges = authorDisplayRanges.length > 0 ? authorDisplayRanges : undefined;
				requestAnimationFrame(() => {
					this.truncateAuthorsToFit(authorsEl, allAuthors, truncRanges);
				});
			}
		}

		// Row 3: Journal, Year + Citation Key
		const journalRow = container.createDiv({ cls: 'bibnotes-suggestion-journal-row' });
		const journalLeft = journalRow.createDiv({ cls: 'bibnotes-suggestion-journal-left' });
		const journalText = reference.publicationTitle || '';
		const yearText = reference.date || '';
		const metaText = [journalText, yearText].filter(Boolean).join(', ');
		if (metaText) {
			const journalEl = journalLeft.createSpan({ cls: 'bibnotes-suggestion-journal' });
			const hasJournalMatch = matchInfo?.journalMatches && matchInfo.journalMatches.length > 0;
			const journalDisplayRanges = hasJournalMatch ? this.findHighlightRanges(metaText, this.currentQuery) : [];
			if (journalDisplayRanges.length > 0) {
				this.renderHighlightedWithRanges(journalEl, metaText, journalDisplayRanges);
			} else {
				journalEl.setText(metaText);
			}
		}
		// Citation Key on the right (tail 6 always shown, show max leading chars)
		const citeKeyEl = journalRow.createDiv({ cls: 'bibnotes-suggestion-citekey' });
		const fullKey = reference.citationKey;
		const TAIL = 6;
		const MAX_DISPLAY = 38; // max total chars to display
		if (fullKey.length > MAX_DISPLAY) {
			const head = MAX_DISPLAY - 1 - TAIL; // 1 char for …
			const truncKey = fullKey.slice(0, head) + '\u2026' + fullKey.slice(-TAIL);
			citeKeyEl.setAttribute('title', fullKey);
			if (matchInfo?.citeKeyMatches && matchInfo.citeKeyMatches.length > 0) {
				const mapped = this.mapRangesToTruncated(matchInfo.citeKeyMatches, fullKey.length, head, TAIL);
				this.renderHighlightedWithRanges(citeKeyEl, truncKey, mapped);
			} else {
				citeKeyEl.setText(truncKey);
			}
		} else {
			if (matchInfo?.citeKeyMatches && matchInfo.citeKeyMatches.length > 0) {
				this.renderHighlightedWithRanges(citeKeyEl, fullKey, matchInfo.citeKeyMatches);
			} else {
				citeKeyEl.setText(fullKey);
			}
		}

		// Row 4: Abstract or Tags match context (if matched in these fields)
		if (matchInfo?.abstractMatch || matchInfo?.tagsMatch) {
			const contextRow = container.createDiv({ cls: 'bibnotes-suggestion-context-row' });
			const contextEl = contextRow.createDiv({ cls: 'bibnotes-suggestion-context' });
			
			if (matchInfo.abstractMatch) {
				const context = this.extractContext(matchInfo.abstractMatch.text, matchInfo.abstractMatch.index, matchInfo.abstractMatch.keyword);
				contextEl.addClass('bibnotes-context-abstract');
				this.renderHighlightedText(contextEl, context, matchInfo.abstractMatch.keyword);
			} else if (matchInfo.tagsMatch) {
				const context = this.extractContext(matchInfo.tagsMatch.text, matchInfo.tagsMatch.index, matchInfo.tagsMatch.keyword);
				contextEl.addClass('bibnotes-context-tags');
				contextEl.setText(t().labelTags + context);
			}
		}
	}

	/**
	 * Extract context around a match for display
	 */
	private extractContext(text: string, index: number, keyword: string, contextChars: number = 50): string {
		const start = Math.max(0, index - contextChars);
		const end = Math.min(text.length, index + keyword.length + contextChars);
		let context = text.substring(start, end);
		if (start > 0) context = '...' + context;
		if (end < text.length) context = context + '...';
		return context;
	}

	/**
	 * Map highlight ranges from the full string to the truncated "head…tail" string.
	 * Ranges entirely inside the omitted middle are dropped.
	 * Ranges spanning boundaries are clamped.
	 */
	private mapRangesToTruncated(
		ranges: Array<{start: number, end: number}>,
		fullLen: number,
		head: number,
		tail: number,
	): Array<{start: number, end: number}> {
		const tailStart = fullLen - tail;          // first index of the tail portion in the original string
		const ellipsisPos = head;                  // position of '…' in truncated string
		const tailOffset = ellipsisPos + 1 - tailStart; // shift for mapping tail indices

		const mapped: Array<{start: number, end: number}> = [];
		for (const r of ranges) {
			// Part in head region
			if (r.start < head) {
				mapped.push({ start: r.start, end: Math.min(r.end, head) });
			}
			// Part in tail region
			if (r.end > tailStart) {
				const s = Math.max(r.start, tailStart);
				mapped.push({ start: s + tailOffset, end: r.end + tailOffset });
			}
		}
		return mapped;
	}

	/**
	 * Render text with pre-calculated highlight ranges
	 */
	private renderHighlightedWithRanges(el: HTMLElement, text: string, ranges: Array<{start: number, end: number}>): void {
		if (!ranges || ranges.length === 0) {
			el.setText(text);
			return;
		}

		// Sort ranges by start position
		const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
		
		// Merge overlapping ranges
		const merged: Array<{start: number, end: number}> = [];
		for (const range of sortedRanges) {
			if (merged.length === 0) {
				merged.push(range);
			} else {
				const last = merged[merged.length - 1]!;
				if (range.start <= last.end) {
					last.end = Math.max(last.end, range.end);
				} else {
					merged.push(range);
				}
			}
		}

		// Build HTML
		let lastEnd = 0;
		for (const range of merged) {
			if (range.start > lastEnd) {
				el.appendText(text.substring(lastEnd, range.start));
			}
			const highlight = el.createSpan({ cls: 'bibnotes-suggestion-highlight' });
			highlight.setText(text.substring(range.start, range.end));
			lastEnd = range.end;
		}
		if (lastEnd < text.length) {
			el.appendText(text.substring(lastEnd));
		}
	}

	/**
	 * Get all author names as an array
	 */
	private getAllAuthorNames(reference: Reference): string[] {
		if (!reference.creators || reference.creators.length === 0) {
			const fallback = reference.authorKeyFullName || reference.authorKey || '';
			return fallback ? [fallback] : [];
		}

		const authors: string[] = [];
		for (const creator of reference.creators) {
			if (creator.creatorType === "author") {
				const firstName = creator.firstName?.trim() ?? "";
				const lastName = creator.lastName?.trim() ?? "";
				const name = creator.name?.trim() ?? "";

				if (firstName && lastName) {
					authors.push(`${firstName} ${lastName}`);
				} else if (lastName) {
					authors.push(lastName);
				} else if (firstName) {
					authors.push(firstName);
				} else if (name) {
					authors.push(name);
				}
			}
		}

		if (authors.length === 0) {
			const fallback = reference.authorKeyFullName || reference.authorKey || '';
			return fallback ? [fallback] : [];
		}
		return authors;
	}

	/**
	 * Dynamically truncate authors to fit within one line.
	 * Priority: 1st, last, 2nd, 2nd-to-last, 3rd, 3rd-to-last, ...
	 */
	private truncateAuthorsToFit(
		el: HTMLElement,
		allAuthors: string[],
		authorMatches?: Array<{start: number, end: number}>
	): void {
		if (allAuthors.length <= 2) return;
		// Check if already fits
		if (el.scrollWidth <= el.clientWidth) return;

		// Build priority-ordered indices: 0, last, 1, last-1, 2, last-2, ...
		const n = allAuthors.length;
		const priorityIndices: number[] = [];
		let lo = 0, hi = n - 1;
		while (lo <= hi) {
			if (lo === hi) {
				priorityIndices.push(lo);
			} else {
				priorityIndices.push(lo);
				priorityIndices.push(hi);
			}
			lo++;
			hi--;
		}

		// Try keeping progressively fewer authors (minimum 2: first + last)
		for (let keep = n - 1; keep >= 2; keep--) {
			const kept = priorityIndices.slice(0, keep).sort((a, b) => a - b);
			const text = this.buildTruncatedAuthorText(allAuthors, kept);
			el.empty();
			if (authorMatches && authorMatches.length > 0) {
				this.renderHighlightedWithRanges(el, text, this.remapAuthorHighlights(allAuthors, kept, authorMatches));
			} else {
				el.setText(text);
			}
			if (el.scrollWidth <= el.clientWidth) return;
		}

		// Absolute minimum: "First, ..., Last"
		const minKept = [0, n - 1];
		const text = this.buildTruncatedAuthorText(allAuthors, minKept);
		el.empty();
		if (authorMatches && authorMatches.length > 0) {
			this.renderHighlightedWithRanges(el, text, this.remapAuthorHighlights(allAuthors, minKept, authorMatches));
		} else {
			el.setText(text);
		}
	}

	/**
	 * Build author display text from selected indices, inserting "..." for gaps
	 */
	private buildTruncatedAuthorText(allAuthors: string[], keptIndices: number[]): string {
		const parts: string[] = [];
		for (let i = 0; i < keptIndices.length; i++) {
			const idx = keptIndices[i]!;
			parts.push(allAuthors[idx]!);
			// Check if there's a gap to the next kept index
			if (i < keptIndices.length - 1) {
				const nextIdx = keptIndices[i + 1]!;
				if (nextIdx - idx > 1) {
					parts.push('...');
				}
			}
		}
		return parts.join(', ');
	}

	/**
	 * Remap highlight ranges from full author string to truncated author string
	 */
	private remapAuthorHighlights(
		allAuthors: string[],
		keptIndices: number[],
		originalRanges: Array<{start: number, end: number}>
	): Array<{start: number, end: number}> {
		// Build position map: for each kept author, find its position in the new string
		const truncatedText = this.buildTruncatedAuthorText(allAuthors, keptIndices);

		// For each kept author, find where it appears in both strings
		const newRanges: Array<{start: number, end: number}> = [];
		for (const idx of keptIndices) {
			const authorName = allAuthors[idx]!;
			// Find position in original full text
			let origPos = 0;
			for (let i = 0; i < idx; i++) {
				origPos += allAuthors[i]!.length + 2; // ", "
			}
			const origEnd = origPos + authorName.length;

			// Find position in truncated text
			const truncPos = truncatedText.indexOf(authorName);
			if (truncPos === -1) continue;

			// Check which original ranges overlap this author
			for (const range of originalRanges) {
				const overlapStart = Math.max(range.start, origPos);
				const overlapEnd = Math.min(range.end, origEnd);
				if (overlapStart < overlapEnd) {
					const offset = truncPos - origPos;
					newRanges.push({
						start: overlapStart + offset,
						end: overlapEnd + offset
					});
				}
			}
		}
		return newRanges;
	}

	/**
	 * Render text with highlights for matched query parts
	 * Highlights continuous sequences of 2+ characters
	 */
	private renderHighlightedText(el: HTMLElement, text: string, query: string): void {
		if (!query || query.trim() === '' || !text) {
			el.setText(text);
			return;
		}

		// Get highlight ranges for this specific text
		const ranges = this.findHighlightRanges(text, query);

		if (ranges.length === 0) {
			el.setText(text);
			return;
		}

		// Build the highlighted HTML
		let lastEnd = 0;
		for (const range of ranges) {
			// Add text before highlight
			if (range.start > lastEnd) {
				el.appendText(text.substring(lastEnd, range.start));
			}
			// Add highlighted text
			const highlight = el.createSpan({ cls: 'bibnotes-suggestion-highlight' });
			highlight.setText(text.substring(range.start, range.end));
			lastEnd = range.end;
		}
		// Add remaining text
		if (lastEnd < text.length) {
			el.appendText(text.substring(lastEnd));
		}
	}

	/**
	 * Find highlight ranges in text for the given query
	 * Only returns continuous sequences of 2+ characters
	 */
	private findHighlightRanges(text: string, query: string): Array<{ start: number; end: number }> {
		const lowerText = text.toLowerCase();
		const keywords = query.toLowerCase().trim().split(/\s+/).filter(kw => kw.length >= 2);

		if (keywords.length === 0) return [];

		const allRanges: Array<{ start: number; end: number }> = [];

		for (const keyword of keywords) {
			let pos = 0;
			while ((pos = lowerText.indexOf(keyword, pos)) !== -1) {
				// Only add if keyword is 2+ characters
				if (keyword.length >= 2) {
					allRanges.push({ start: pos, end: pos + keyword.length });
				}
				pos += 1;
			}
		}

		// Sort by start position and merge overlapping ranges
		allRanges.sort((a, b) => a.start - b.start);

		const merged: Array<{ start: number; end: number }> = [];
		for (const range of allRanges) {
			if (merged.length === 0) {
				merged.push(range);
			} else {
				const last = merged[merged.length - 1]!;
				if (range.start <= last.end) {
					// Merge overlapping ranges
					last.end = Math.max(last.end, range.end);
				} else {
					merged.push(range);
				}
			}
		}

		return merged;
	}

	// Perform action on the selected suggestion.
	async onChooseSuggestion(
		item: ScoredReference,
		_evt: MouseEvent | KeyboardEvent, // eslint-disable-line @typescript-eslint/no-unused-vars
	) {
		const referenceSelected = item.reference;
		//Create an array where you store the citekey to be processed
		const citeKeyToBeProcessed: string[] = [];
		citeKeyToBeProcessed.push(referenceSelected.citationKey);

		// Loop to process the selected note
		for (
			let indexNoteToBeProcessed = 0;
			indexNoteToBeProcessed < citeKeyToBeProcessed.length;
			indexNoteToBeProcessed++
		) {
			//Find the index of the reference selected
			const indexSelectedReference = this.data.items.findIndex(
				(item: { citationKey: string }) =>
					item.citationKey ===
					citeKeyToBeProcessed[indexNoteToBeProcessed]
			);

			//Selected Reference
			const selectedEntry = this.data.items[indexSelectedReference];
			if (!selectedEntry) continue;

			//Create and export Note for select reference
			await this.plugin.createNote(selectedEntry, this.data);

			//if the note is the last one to be processed, then open it
			if (indexNoteToBeProcessed == citeKeyToBeProcessed.length - 1) {
				openSelectedNote(
					this.app,
					selectedEntry,
					this.plugin.settings.exportTitle,
					this.plugin.settings.exportPath
				);
			}
		}
	}

	onClose() {
		this.cancelPendingSearch();
		this.searchIndex = [];
		this.searchCache = [];
		this.lastSearchSet = null;
	}

	// Enhanced search using cache data
	searchItems(query: string): Reference[] {
		const cacheManager = getCacheManager(this.app, this.plugin.settings.zoteroDbPath);
		return cacheManager.searchItems(query) as Reference[];
	}
}

export class UpdateLibraryModal extends Modal {
	plugin: MyPlugin;
	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		this.setTitle(t().cmdUpdateLibrary);
		this.setContent("Updating...");
		if (this.plugin.settings.debugMode) console.log("[BibNotes] Updating Zotero library");

		const dbPath = this.plugin.settings.zoteroDbPath;
		if (!dbPath) {
			new Notice(t().noticeDbNotConfigured);
			return;
		}

		let data: ZoteroData;
		// 获取插件目录的绝对路径
		const adapter = this.app.vault.adapter;
		const vaultBasePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
		const pluginDir = vaultBasePath && this.plugin.manifest.dir 
			? vaultBasePath + "/" + this.plugin.manifest.dir 
			: this.plugin.manifest.dir || "";
		try {
			data = await readZoteroDatabase(dbPath, pluginDir);
		} catch (e) {
			new Notice(t().noticeDbReadFailed + (e as Error).message);
			console.error(e);
			return;
		}

		const bibtexArray: string[] = [];

		//Check the last time the library was updated
		const lastUpdate = new Date(this.plugin.settings.lastUpdateDate);
		//loop through all the entries in the bibliography to find out which ones have been modified since the last time the library on obsidian was updated.
		for (let index = 0; index < data.items.length; index++) {
			const selectedEntry = data.items[index];
			if (!selectedEntry) continue;
			const bibtexArrayItem = {} as Reference;

			//Extract the citation key. If the citationkey does not exist skip
			if (selectedEntry.hasOwnProperty("citationKey") == false) continue;
			bibtexArrayItem.citationKey = selectedEntry.citationKey;

			//Extract the date the entry was modified
			const noteDateModifiedArray: string[] = [];
			if (selectedEntry.dateModified) {
				noteDateModifiedArray.push(selectedEntry.dateModified);
			}
			for (let noteIdx = 0; noteIdx < selectedEntry.notes.length; noteIdx++) {
				const note = selectedEntry.notes[noteIdx];
				if (note?.dateModified) {
					noteDateModifiedArray.push(note.dateModified);
				}
			}
			noteDateModifiedArray.sort((firstElement, secondElement) => {
				if (firstElement > secondElement) return -1;
				if (firstElement < secondElement) return 1;
				return 0;
			});

			const datemodified = noteDateModifiedArray.length > 0 
				? new Date(noteDateModifiedArray[0]!) 
				: new Date(0);

			if (datemodified < lastUpdate) continue; //skip if it was modified before the last update

			//skip if the setting is to update only existing note and the note is not found at the given folder
			if (
				this.plugin.settings.updateLibrary ===
				"Only update existing notes" &&
				!(await this.app.vault.adapter.exists(
					createNoteTitle(
						selectedEntry,
						this.plugin.settings.exportTitle,
						this.plugin.settings.exportPath
					)
				))
			)
				continue;

			//Create and export Note for select reference
			await this.plugin.createNote(selectedEntry, data);

			bibtexArray.push(selectedEntry.citationKey);
		}

		//Console.log the number of items updated
		new Notice(t().noticeUpdatedEntries(bibtexArray.length));
		//Update the date when the update was last done
		this.plugin.settings.lastUpdateDate = new Date();
		this.plugin.saveSettings();

		// Show completion with close button
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: t().noticeUpdatedEntries(bibtexArray.length) });
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('OK')
					.setCta()
					.onClick(() => this.close())
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Create full author names string (First Name + Last Name)
 */
function createFullAuthorNames(creators: Creator[] | undefined): string {
	if (!creators || creators.length === 0) return "";

	const authors: string[] = [];
	for (const creator of creators) {
		if (creator.creatorType === "author") {
			const firstName = creator.firstName?.trim() ?? "";
			const lastName = creator.lastName?.trim() ?? "";
			const name = creator.name?.trim() ?? "";

			if (firstName && lastName) {
				authors.push(`${firstName} ${lastName}`);
			} else if (lastName) {
				authors.push(lastName);
			} else if (firstName) {
				authors.push(firstName);
			} else if (name) {
				authors.push(name);
			}
		}
	}

	if (authors.length === 0) return "";
	if (authors.length === 1) return authors[0]!;
	if (authors.length === 2) return `${authors[0]!} and ${authors[1]!}`;
	return `${authors[0]!} et al.`;
}
