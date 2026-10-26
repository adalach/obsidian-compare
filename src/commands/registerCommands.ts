import type MarkdownComparePlugin from "../main";
import { compareNotes, pickNoteToCompare } from "../compare/comparison";
import { getCurrentNoteLeaf } from "../compare/panes";

export function registerMarkdownCompareCommands(plugin: MarkdownComparePlugin) {
	plugin.addCommand({
		id: "compare-two-files",
		name: "Compare two notes",
		callback: () => compareNotes(plugin, { showNotice: true }),
	});

	plugin.addCommand({
		id: "compare-with",
		name: "Compare current note with…",
		checkCallback: (checking) => {
			const leaf = getCurrentNoteLeaf(plugin.app);
			if (!leaf) return false;
			if (!checking) pickNoteToCompare(plugin, leaf);
			return true;
		},
	});

	plugin.addCommand({
		id: "clear-highlights",
		name: "Stop comparing",
		callback: () => plugin.stopComparing(),
	});

	plugin.addCommand({
		id: "toggle-live-compare",
		name: "Toggle live compare",
		callback: () => plugin.toggleLiveCompare(),
	});
}
