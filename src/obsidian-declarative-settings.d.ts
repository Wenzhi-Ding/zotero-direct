/**
 * Minimal ambient declarations for Obsidian's declarative settings API,
 * introduced in Obsidian 1.13.0.
 *
 * The installed obsidian typings are pinned below 1.13.0 (package-lock), so
 * the subset of the API used by this plugin is declared here. At runtime the
 * members only exist on Obsidian 1.13.0+, where the settings search index is
 * built from getSettingDefinitions(); on older versions the imperative
 * display() implementation keeps working unchanged.
 *
 * Delete this file when the obsidian dev dependency is upgraded to >= 1.13.0
 * (its own declarations then conflict with these).
 */

import "obsidian";

declare module "obsidian" {
	export interface SettingDefinitionBase {
		name: string;
		desc?: string | DocumentFragment;
		aliases?: string[];
		searchable?: boolean | (() => boolean);
		visible?: boolean | (() => boolean);
	}

	export interface SettingControlBase<V> {
		key: string;
		defaultValue?: V;
		disabled?: boolean | (() => boolean);
	}

	export interface SettingTextControl extends SettingControlBase<string> {
		type: "text";
		placeholder?: string;
	}

	export interface SettingTextAreaControl extends SettingControlBase<string> {
		type: "textarea";
		placeholder?: string;
		rows?: number;
	}

	export interface SettingDropdownControl extends SettingControlBase<string> {
		type: "dropdown";
		options: Record<string, string>;
	}

	export interface SettingFolderControl extends SettingControlBase<string> {
		type: "folder";
		placeholder?: string;
	}

	export type SettingControl =
		| SettingTextControl
		| SettingTextAreaControl
		| SettingDropdownControl
		| SettingFolderControl;

	export interface SettingDefinitionControl extends SettingDefinitionBase {
		control: SettingControl;
	}

	export interface SettingDefinitionAction extends SettingDefinitionBase {
		action: (el: HTMLElement, index: number) => void;
		disabled?: boolean | (() => boolean);
	}

	export type SettingDefinition =
		| SettingDefinitionControl
		| SettingDefinitionAction;

	export interface SettingDefinitionGroup {
		type: "group" | "list";
		heading?: string;
		items?: SettingDefinitionItem[];
		visible?: boolean | (() => boolean);
	}

	export type SettingDefinitionItem = SettingDefinition | SettingDefinitionGroup;

	interface PluginSettingTab {
		getSettingDefinitions(): SettingDefinitionItem[];
		update(): void;
		setControlValue(key: string, value: unknown): void | Promise<void>;
	}
}
