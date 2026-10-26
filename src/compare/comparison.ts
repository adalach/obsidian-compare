import { MarkdownView, Notice, type TFile, type WorkspaceLeaf } from "obsidian";
import type MarkdownComparePlugin from "../main";
import {
	clearDiffHighlights,
	getEditorViewFromMarkdownView,
	setDiffHighlights,
} from "../editor/diffHighlight";
import { computeHighlights } from "../diff/highlights";
import { headingSyntaxFor } from "../headings/headings";
import { NotePickerModal } from "../ui/NotePickerModal";
import {
	getCurrentNoteLeaf,
	getNoteView,
	getVisibleNoteLeaves,
	isLeafOpen,
	openBeside,
	openNote,
	orderByPosition,
} from "./panes";

/** The two tabs being compared. The comparison follows these tabs, whatever else is open. */
export interface ComparePair {
	leftLeaf: WorkspaceLeaf;
	rightLeaf: WorkspaceLeaf;
	leftFile: TFile;
	rightFile: TFile;
}

type CompareOptions = { showNotice?: boolean };

/** Compare the two visible notes, or else pick the note to compare the current one with. */
export function compareNotes(plugin: MarkdownComparePlugin, options?: CompareOptions) {
	const visible = getVisibleNoteLeaves(plugin.app);
	const [first, second] = visible;
	if (visible.length === 2 && first && second) {
		startComparison(plugin, first, second, options);
		return;
	}
	pickNoteToCompare(plugin, getCurrentNoteLeaf(plugin.app));
}

export function pickNoteToCompare(plugin: MarkdownComparePlugin, baseLeaf: WorkspaceLeaf | null) {
	const baseFile = baseLeaf ? getNoteView(baseLeaf)?.file : null;
	if (!baseLeaf || !baseFile) {
		new Notice("Open a note first, then pick the note to compare it with.");
		return;
	}
	new NotePickerModal(plugin.app, baseFile, (file) => {
		void compareLeafWithFile(plugin, baseLeaf, file);
	}).open();
}

/** Compare the note in `baseLeaf` with `file`, opening `file` beside it when needed. */
export async function compareLeafWithFile(
	plugin: MarkdownComparePlugin,
	baseLeaf: WorkspaceLeaf,
	file: TFile,
) {
	const other = await openBeside(plugin.app, baseLeaf, file);
	startComparison(plugin, baseLeaf, other, { showNotice: true });
}

export async function compareFiles(plugin: MarkdownComparePlugin, first: TFile, second: TFile) {
	const firstLeaf = await openNote(plugin.app, first);
	await compareLeafWithFile(plugin, firstLeaf, second);
}

function startComparison(
	plugin: MarkdownComparePlugin,
	leafA: WorkspaceLeaf,
	leafB: WorkspaceLeaf,
	options?: CompareOptions,
) {
	const [leftLeaf, rightLeaf] = orderByPosition(leafA, leafB);
	const leftFile = getNoteView(leftLeaf)?.file;
	const rightFile = getNoteView(rightLeaf)?.file;
	if (!leftFile || !rightFile) return;

	endComparison(plugin);
	plugin.setComparePair({ leftLeaf, rightLeaf, leftFile, rightFile });
	void plugin.ensureDiffView();
	refreshComparison(plugin, options);
}

/** The pair's note view, or null once the tab closed or shows another note. */
function getPairView(plugin: MarkdownComparePlugin, leaf: WorkspaceLeaf, file: TFile) {
	if (!isLeafOpen(plugin.app, leaf)) return null;
	const view = getNoteView(leaf);
	return view?.file === file ? view : null;
}

export function refreshComparison(plugin: MarkdownComparePlugin, options?: CompareOptions) {
	const pair = plugin.getComparePair();
	if (!pair) return;

	const leftView = getPairView(plugin, pair.leftLeaf, pair.leftFile);
	const rightView = getPairView(plugin, pair.rightLeaf, pair.rightFile);
	if (!leftView || !rightView) {
		endComparison(plugin);
		return;
	}

	const leftEditorView = getEditorViewFromMarkdownView(leftView);
	const rightEditorView = getEditorViewFromMarkdownView(rightView);
	if (!leftEditorView || !rightEditorView) {
		endComparison(plugin);
		if (options?.showNotice) {
			new Notice("Switch both notes to source mode or live preview before comparing.");
		}
		return;
	}

	const { left, right, hunks } = computeHighlights(
		leftView.editor.getValue(),
		rightView.editor.getValue(),
		headingSyntaxFor(pair.leftFile.path),
		headingSyntaxFor(pair.rightFile.path),
	);

	setDiffHighlights(leftEditorView, left);
	setDiffHighlights(rightEditorView, right);

	plugin.setCompareTargets({
		leftEditorView,
		rightEditorView,
		leftPath: pair.leftFile.path,
		rightPath: pair.rightFile.path,
	});
	plugin.setDiffState({
		leftPath: pair.leftFile.path,
		rightPath: pair.rightFile.path,
		hunks,
	});

	if (options?.showNotice) {
		new Notice(hunks.length > 0 ? "Differences highlighted." : "No differences.");
	}
}

/** End the comparison once one of its tabs closed or shows another note. */
export function checkComparison(plugin: MarkdownComparePlugin) {
	const pair = plugin.getComparePair();
	if (!pair) return;
	if (
		getPairView(plugin, pair.leftLeaf, pair.leftFile) &&
		getPairView(plugin, pair.rightLeaf, pair.rightFile)
	) {
		return;
	}
	endComparison(plugin);
}

export function endComparison(plugin: MarkdownComparePlugin) {
	const allMarkdownViews = plugin.app.workspace
		.getLeavesOfType("markdown")
		.map((leaf) => leaf.view)
		.filter((view): view is MarkdownView => view instanceof MarkdownView);

	for (const view of allMarkdownViews) {
		const editorView = getEditorViewFromMarkdownView(view);
		if (editorView) clearDiffHighlights(editorView);
	}

	plugin.setComparePair(null);
	plugin.setCompareTargets(null);
	plugin.setDiffState(null);
}
