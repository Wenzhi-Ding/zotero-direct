// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes

import { AbstractInputSuggest, App } from "obsidian";

export abstract class TextInputSuggest<T> extends AbstractInputSuggest<T> {
    protected inputEl: HTMLInputElement | HTMLDivElement;

    constructor(app: App, inputEl: HTMLInputElement | HTMLDivElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): T[] {
        return this.getItemSuggestions(inputStr);
    }

    abstract getItemSuggestions(inputStr: string): T[];
    abstract renderSuggestion(item: T, el: HTMLElement): void;
    abstract selectSuggestion(item: T): void;
}