// Reproduces the type-aware analysis Obsidian's plugin review runs over the
// source. Setting "types": [] (see tsconfig.review.json) stops @types/node
// from being auto-included, so bare Node module imports become unresolved
// error types exactly like in the review environment.
import tsparser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: ["**/*.mjs", "eslint.config.js", "main.js"],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.review.json" },
		},
	},
	...tseslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ["src/**/*.ts"],
	})),
);
