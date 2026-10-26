import type MarkdownComparePlugin from "../main";
import { compareFiles, compareLeafWithFile, pickNoteToCompare } from "../compare/comparison";
import { getCurrentNoteLeaf, getNoteView, opensInEditor } from "../compare/panes";
import {
	copyDifferenceAt,
	findDifferenceAt,
	lineForEditorMenu,
	otherSide,
	sideOf,
} from "../compare/copyDifference";
import { refreshComparison } from "../compare/comparison";

export function registerMarkdownCompareMenus(plugin: MarkdownComparePlugin) {
	// A note's menu (file explorer, links, search results, tab header): compare it with the
	// current note, or pick the note to compare with when it is the current note or its tab.
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, _source, leaf) => {
			if (!opensInEditor(plugin.app, file)) return;

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

	// Two notes or files selected in the file explorer.
	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) => {
			const [first, second] = files;
			if (files.length !== 2 || !opensInEditor(plugin.app, first) || !opensInEditor(plugin.app, second)) {
				return;
			}
			menu.addItem((item) =>
				item
					.setTitle("Compare the two notes")
					.setIcon("scale")
					.onClick(() => void compareFiles(plugin, first, second)),
			);
		}),
	);

	// Right-click on a difference in either note of the comparison: copy it to the other note, or
	// take the other note's version (which deletes lines the other note does not have).
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
			const side = sideOf(plugin, info);
			const pair = plugin.getComparePair();
			if (!side || !pair) return;

			refreshComparison(plugin);
			const line = lineForEditorMenu(side, editor.getCursor().line + 1);
			const hunk = findDifferenceAt(plugin, side, line);
			if (!hunk) return;

			const other = (side === "left" ? pair.rightFile : pair.leftFile).basename;
			const otherHasLines = (side === "left" ? hunk.rightCount : hunk.leftCount) > 0;
			const towardsOther = side === "left" ? "arrow-right" : "arrow-left";
			const towardsThis = side === "left" ? "arrow-left" : "arrow-right";
			menu.addItem((item) =>
				item
					.setTitle(`Copy to ${other}`)
					.setIcon(towardsOther)
					.onClick(() => copyDifferenceAt(plugin, side, line, side)),
			);
			menu.addItem((item) =>
				item
					.setTitle(otherHasLines ? `Use ${other}'s version` : `Delete (not in ${other})`)
					.setIcon(towardsThis)
					.onClick(() => copyDifferenceAt(plugin, side, line, otherSide(side))),
			);
		}),
	);
}
