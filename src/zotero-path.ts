import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Platform } from "obsidian";

export type ZoteroDbPathSource = "manual" | "default" | null;

export interface ZoteroDbPathResolution {
	manualPath: string;
	normalizedManualPath: string | null;
	manualPathExists: boolean;
	defaultPath: string | null;
	effectivePath: string | null;
	source: ZoteroDbPathSource;
	shouldShowManualPathSetting: boolean;
}

function fileExists(filePath: string): boolean {
	try {
		return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
	} catch {
		return false;
	}
}

function normalizeManualPath(manualPath: string): string | null {
	const trimmed = manualPath.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed === "~") {
		return os.homedir();
	}

	if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
		return path.join(os.homedir(), trimmed.slice(2));
	}

	return path.normalize(trimmed);
}

function getProfileDatabaseCandidates(profileRoot: string): string[] {
	try {
		if (!fs.existsSync(profileRoot) || !fs.statSync(profileRoot).isDirectory()) {
			return [];
		}

		return fs
			.readdirSync(profileRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join(profileRoot, entry.name, "zotero.sqlite"));
	} catch {
		return [];
	}
}

export function getDefaultZoteroDatabaseCandidates(): string[] {
	const homeDir = os.homedir();
	const candidates: string[] = [path.join(homeDir, "Zotero", "zotero.sqlite")];
	const appData = (window as { process?: { env?: { APPDATA?: string } } }).process?.env?.APPDATA;

	if (Platform.isWin) {
		if (appData) {
			candidates.push(path.join(appData, "Zotero", "zotero.sqlite"));
			candidates.push(path.join(appData, "Zotero", "Zotero", "zotero.sqlite"));
			candidates.push(...getProfileDatabaseCandidates(path.join(appData, "Zotero", "Profiles")));
			candidates.push(...getProfileDatabaseCandidates(path.join(appData, "Zotero", "Zotero", "Profiles")));
		}
	} else if (Platform.isMacOS) {
		const supportDir = path.join(homeDir, "Library", "Application Support", "Zotero");
		candidates.push(path.join(supportDir, "zotero.sqlite"));
		candidates.push(...getProfileDatabaseCandidates(path.join(supportDir, "Profiles")));
	} else {
		const legacyDir = path.join(homeDir, ".zotero", "zotero");
		candidates.push(path.join(legacyDir, "zotero.sqlite"));
		candidates.push(...getProfileDatabaseCandidates(path.join(legacyDir, "Profiles")));
	}

	return Array.from(new Set(candidates.map((candidate) => path.normalize(candidate))));
}

export function findDefaultZoteroDatabasePath(): string | null {
	for (const candidate of getDefaultZoteroDatabaseCandidates()) {
		if (fileExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

export function resolveZoteroDatabasePath(manualPath: string): ZoteroDbPathResolution {
	const normalizedManualPath = normalizeManualPath(manualPath);
	const manualPathExists = normalizedManualPath ? fileExists(normalizedManualPath) : false;
	const defaultPath = findDefaultZoteroDatabasePath();

	if (normalizedManualPath) {
		return {
			manualPath,
			normalizedManualPath,
			manualPathExists,
			defaultPath,
			effectivePath: normalizedManualPath,
			source: "manual",
			shouldShowManualPathSetting: true,
		};
	}

	if (defaultPath) {
		return {
			manualPath,
			normalizedManualPath: null,
			manualPathExists: false,
			defaultPath,
			effectivePath: defaultPath,
			source: "default",
			shouldShowManualPathSetting: false,
		};
	}

	return {
		manualPath,
		normalizedManualPath: null,
		manualPathExists: false,
		defaultPath: null,
		effectivePath: null,
		source: null,
		shouldShowManualPathSetting: true,
	};
}
