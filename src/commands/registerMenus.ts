import { TFile } from "obsidian";
import type MarkdownComparePlugin from "../main";
import { compareFiles, compareLeafWithFile, pickNoteToCompare } from "../compare/comparison";
import { getCurrentNoteLeaf, getNoteView } from "../compare/panes";

function isNote(file: unknown): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

export function registerMarkdownCompareMenus(plugin: MarkdownComparePlugin) {
	// A note's menu (file explorer, links, search results, tab header): compare it with the
	// current note, or pick the note to compare with when it is the current note or its tab.
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, _source, leaf) => {
			if (!isNote(file)) return;

			const tabLeaf = leaf && getNoteView(leaf)?.file === file ? leaf : null;
			const currentLeaf = getCurrentNoteLeaf(plugin.app);
			const currentFile = currentLeaf ? getNoteView(currentLeaf)?.file : null;

			if (currentLeaf && currentFile && currentFile !== file && !tabLeaf) {
				menu.addItem((item) =>
					item
						.setTitle(`Compare with ${currentFile.basename}`)
						.setIcon("scale")
						.onClick(() => void compareLeafWithFile(plugin, currentLeaf, file)),
				);
				return;
			}

			const baseLeaf = tabLeaf ?? (currentFile === file ? currentLeaf : null);
			if (!baseLeaf) return;
			menu.addItem((item) =>
				item
					.setTitle("Compare with…")
					.setIcon("scale")
					.onClick(() => pickNoteToCompare(plugin, baseLeaf)),
			);
		}),
	);

	// Two notes selected in the file explorer.
	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) => {
			const [first, second] = files;
			if (files.length !== 2 || !isNote(first) || !isNote(second)) return;
			menu.addItem((item) =>
				item
					.setTitle("Compare the two notes")
					.setIcon("scale")
					.onClick(() => void compareFiles(plugin, first, second)),
			);
		}),
	);
}
