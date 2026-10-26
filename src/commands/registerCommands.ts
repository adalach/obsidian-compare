import type MarkdownComparePlugin from "../main";
import { compareNotes, pickNoteToCompare } from "../compare/comparison";
import { getCurrentNoteLeaf } from "../compare/panes";
import {
	copyDifferenceAt,
	findDifferenceAt,
	otherSide,
	sideOf,
	type Side,
} from "../compare/copyDifference";

export function registerMarkdownCompareCommands(plugin: MarkdownComparePlugin) {
	plugin.addCommand({
		id: "two-notes",
		name: "Two notes",
		callback: () => compareNotes(plugin, { showNotice: true }),
	});

	plugin.addCommand({
		id: "current-note-with",
		name: "Current note with…",
		checkCallback: (checking) => {
			const leaf = getCurrentNoteLeaf(plugin.app);
			if (!leaf) return false;
			if (!checking) pickNoteToCompare(plugin, leaf);
			return true;
		},
	});

	plugin.addCommand({
		id: "stop",
		name: "Stop comparing",
		callback: () => plugin.stopComparing(),
	});

	// Act on the difference at the cursor: copy this note's version to the other note, or take
	// the other note's version here.
	const addCopyCommand = (id: string, name: string, from: (side: Side) => Side) =>
		plugin.addCommand({
			id,
			name,
			editorCheckCallback: (checking, editor, ctx) => {
				const side = sideOf(plugin, ctx);
				const line = editor.getCursor().line + 1;
				if (!side || !findDifferenceAt(plugin, side, line)) return false;
				if (!checking) copyDifferenceAt(plugin, side, line, from(side));
				return true;
			},
		});
	addCopyCommand("copy-difference", "Copy difference to the other note", (side) => side);
	addCopyCommand("use-other-version", "Use the other note's version", otherSide);

	plugin.addCommand({
		id: "toggle-live",
		name: "Toggle live updates",
		callback: () => plugin.toggleLiveCompare(),
	});
}
