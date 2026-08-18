/**
 * SQLite WAL (Write-Ahead Log) reader.
 *
 * While Zotero is running it writes changes to "<database>-wal" and merges
 * them back into the main file only at a checkpoint. sql.js parses a plain
 * byte buffer and knows nothing about the WAL, so a read taken while Zotero
 * is open would silently miss the most recent edits. This module overlays
 * the committed WAL content on the in-memory copy of the main file before
 * parsing, mirroring what a real SQLite read connection does.
 *
 * WAL layout (https://www.sqlite.org/fileformat2.html#walformat):
 * - 32-byte header: magic, format version, page size, salts, checksum
 * - frames: 24-byte header (page number, database size on commit frames,
 *   salts, cumulative checksum) followed by one page of data
 *
 * Frames are applied in order up to the last commit frame whose cumulative
 * checksum validates; frames after it belong to an unfinished transaction
 * and are ignored. Any inconsistency makes the merge return null, and the
 * caller falls back to the main file alone.
 */

import { fs } from "./node-api";

const WAL_HEADER_SIZE = 32;
const FRAME_HEADER_SIZE = 24;
const WAL_MAGIC_LITTLE = 0x377f0682; // checksum words are little-endian
const WAL_MAGIC_BIG = 0x377f0683; // checksum words are big-endian
const WAL_FORMAT_VERSION = 3007000;

/** Page number and byte offset of one validated frame's data. */
interface WalFrame {
	pageNumber: number;
	dataOffset: number;
}

/**
 * Read a SQLite database file and, when a write-ahead log sits next to it,
 * return the main file with all committed WAL frames applied. On any error
 * or inconsistency the plain main file contents are returned unchanged.
 */
export function readDatabaseFileWithWal(dbPath: string): Uint8Array {
	const main = fs.readFileSync(dbPath);
	try {
		const merged = applyWriteAheadLog(main, dbPath + "-wal");
		return merged ?? main;
	} catch (e) {
		console.debug("[Zotero Direct] WAL merge skipped:", e);
		return main;
	}
}

function applyWriteAheadLog(main: Uint8Array, walPath: string): Uint8Array | null {
	if (!fs.existsSync(walPath)) return null;
	const wal = fs.readFileSync(walPath);
	if (wal.byteLength < WAL_HEADER_SIZE) return null;

	// Structural integers are big-endian; the magic number decides the byte
	// order in which words are read while computing checksums.
	const view = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
	const magic = view.getUint32(0, false);
	if (magic !== WAL_MAGIC_LITTLE && magic !== WAL_MAGIC_BIG) return null;
	if (view.getUint32(4, false) !== WAL_FORMAT_VERSION) return null;

	const pageSize = view.getUint32(8, false);
	if (!isValidPageSize(pageSize)) return null;
	if (pageSize !== mainDatabasePageSize(main)) return null;

	// The checksum over the first 24 header bytes seeds the frame checksums.
	const littleEndian = magic === WAL_MAGIC_LITTLE;
	let checksum = checksumWords(view, 0, 24, 0, 0, littleEndian);
	if (checksum[0] !== view.getUint32(24, false) || checksum[1] !== view.getUint32(28, false)) {
		return null;
	}

	// Scan frames sequentially; the first invalid frame ends the log. This
	// also discards leftover frames from before a checkpoint rewound the
	// file, because their salts no longer match the header.
	const frames: WalFrame[] = [];
	let lastCommitIndex = -1;
	let databasePages = 0;
	let offset = WAL_HEADER_SIZE;
	while (offset + FRAME_HEADER_SIZE + pageSize <= wal.byteLength) {
		const pageNumber = view.getUint32(offset, false);
		if (pageNumber === 0) break;
		if (!saltMatches(wal, offset)) break;

		// Checksums cover the frame header's first 8 bytes, then the page data.
		checksum = checksumWords(view, offset, 8, checksum[0], checksum[1], littleEndian);
		checksum = checksumWords(view, offset + FRAME_HEADER_SIZE, pageSize, checksum[0], checksum[1], littleEndian);
		if (checksum[0] !== view.getUint32(offset + 16, false) ||
			checksum[1] !== view.getUint32(offset + 20, false)) {
			break;
		}

		frames.push({ pageNumber, dataOffset: offset + FRAME_HEADER_SIZE });

		// A non-zero size field marks a commit frame; only changes up to the
		// newest commit are part of the database.
		const sizeInPages = view.getUint32(offset + 4, false);
		if (sizeInPages !== 0) {
			lastCommitIndex = frames.length - 1;
			databasePages = sizeInPages;
		}
		offset += FRAME_HEADER_SIZE + pageSize;
	}

	if (lastCommitIndex < 0) return null;

	// A commit frame cannot describe a database larger than the main file
	// plus every page written in the WAL.
	const maxPages = Math.ceil(main.byteLength / pageSize) + frames.length;
	if (databasePages > maxPages) return null;

	const merged = new Uint8Array(databasePages * pageSize);
	merged.set(main.subarray(0, Math.min(main.byteLength, merged.byteLength)));
	for (let i = 0; i <= lastCommitIndex; i++) {
		const frame = frames[i]!;
		const target = (frame.pageNumber - 1) * pageSize;
		if (target >= 0 && target + pageSize <= merged.byteLength) {
			merged.set(wal.subarray(frame.dataOffset, frame.dataOffset + pageSize), target);
		}
	}
	return merged;
}

/** Page size stored at bytes 16-17 of the SQLite header; the value 1 means 64 KiB. */
function mainDatabasePageSize(main: Uint8Array): number {
	if (main.byteLength < 100) return 0;
	const stored = (main[16]! << 8) | main[17]!;
	return stored === 1 ? 65536 : stored;
}

function isValidPageSize(pageSize: number): boolean {
	return pageSize >= 512 && pageSize <= 65536 && (pageSize & (pageSize - 1)) === 0;
}

/** The frame's salts (bytes 8-15) must equal the header's salts (bytes 16-23). */
function saltMatches(wal: Uint8Array, frameOffset: number): boolean {
	for (let i = 0; i < 8; i++) {
		if (wal[frameOffset + 8 + i] !== wal[16 + i]) return false;
	}
	return true;
}

/**
 * SQLite's cumulative checksum (wal.c walChecksumBytes): pairs of 32-bit
 * words folded into two running sums. The word byte order follows the
 * magic number, independent of the big-endian structural fields.
 */
function checksumWords(
	view: DataView,
	offset: number,
	length: number,
	seed1: number,
	seed2: number,
	littleEndian: boolean,
): [number, number] {
	let sum1 = seed1;
	let sum2 = seed2;
	for (let i = 0; i < length; i += 8) {
		sum1 = (sum1 + view.getUint32(offset + i, littleEndian) + sum2) >>> 0;
		sum2 = (sum2 + view.getUint32(offset + i + 4, littleEndian) + sum1) >>> 0;
	}
	return [sum1, sum2];
}
