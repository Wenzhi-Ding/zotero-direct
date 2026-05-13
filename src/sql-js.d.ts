declare module "sql.js" {
	interface SqlJsConfig {
		locateFile?: (file: string) => string;
		wasmBinary?: ArrayBuffer;
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
