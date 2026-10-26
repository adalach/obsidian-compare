import type MarkdownComparePlugin from "../main";
import { compareNotes, pickNoteToCompare } from "../compare/comparison";
import { getCurrentNoteLeaf } from "../compare/panes";

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

	plugin.addCommand({
		id: "toggle-live",
		name: "Toggle live updates",
		callback: () => plugin.toggleLiveCompare(),
	});
}
