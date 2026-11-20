declare module "sql.js" {
	interface SqlJsConfig {
		locateFile?: (file: string) => string;
		wasmBinary?: ArrayBuffer | Uint8Array;
	}

	interface Database {
		exec(sql: string): { columns: string[]; values: unknown[][] }[];
		close(): void;
	}

	interface SqlJsStatic {
		Database: new (data?: ArrayLike<number>) => Database;
	}

	function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;

	export default initSqlJs;
}

// Emscripten wasm binaries imported as base64 strings (esbuild .wasm=base64 loader)
declare module "*.wasm" {
	const base64: string;
	export default base64;
}
