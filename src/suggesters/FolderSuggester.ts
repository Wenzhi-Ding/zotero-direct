// Imported from the Templater Plugin: https://github.com/SilentVoid13/Templater/blob/master/src/suggesters/FolderSuggester.ts
// Credits go to Liam's Periodic Notes Plugin: https://github.com/liamcain/obsidian-periodic-notes

import { TAbstractFile, TFolder } from "obsidian";
import { TextInputSuggest } from "./suggest"

export class FolderSuggest extends TextInputSuggest<TFolder> {
    getItemSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (
                folder instanceof TFolder &&
                folder.path.toLowerCase().contains(lowerCaseInputStr)
            ) {
                folders.push(folder);
            }
        });

        return folders;
    }

    getSuggestions(inputStr: string): TFolder[] {
        return this.getItemSuggestions(inputStr);
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        (this.inputEl as HTMLInputElement).value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }
}