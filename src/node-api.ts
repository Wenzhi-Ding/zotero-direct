/**
 * Typed access to the Node.js built-in modules used by this plugin.
 *
 * Obsidian's automated plugin review analyses the source with a TypeScript
 * program that does not load @types/node. A bare `import * as fs from "fs"`
 * is an unresolved (error) type in that environment, and every use of it is
 * reported as an "unsafe" access. Re-exporting the modules through the
 * interfaces below keeps every call site fully typed in both environments;
 * the runtime objects are unchanged.
 */

import * as fsModule from "fs";
import * as osModule from "os";
import * as pathModule from "path";

export interface NodeStatsLike {
	isFile(): boolean;
	isDirectory(): boolean;
	mtimeMs: number;
}

export interface NodeDirentLike {
	isDirectory(): boolean;
	name: string;
}

interface NodeFsLike {
	existsSync(path: string): boolean;
	statSync(path: string): NodeStatsLike;
	readFileSync(path: string): Uint8Array;
	readdirSync(path: string, options: { withFileTypes: true }): NodeDirentLike[];
}

interface NodeOsLike {
	homedir(): string;
}

interface NodePathLike {
	join(...pathSegments: string[]): string;
	normalize(path: string): string;
	dirname(path: string): string;
	basename(path: string): string;
}

export const fs = fsModule as unknown as NodeFsLike;
export const os = osModule as unknown as NodeOsLike;
export const path = pathModule as unknown as NodePathLike;
