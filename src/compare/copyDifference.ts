import { EditorView } from "@codemirror/view";
import { Platform } from "obsidian";
import type MarkdownComparePlugin from "../main";
import { copyBlockEdit } from "../diff/copy";
import type { DiffHunk } from "../ui/DiffView";
import { refreshComparison } from "./comparison";
import { getNoteView } from "./panes";

export type Side = "left" | "right";

export function otherSide(side: Side): Side {
	return side === "left" ? "right" : "left";
}

/** Which side of the comparison a note view or editor view is on, if any. */
export function sideOf(plugin: MarkdownComparePlugin, view: unknown): Side | null {
	const pair = plugin.getComparePair();
	const targets = plugin.getCompareTargets();
	if (view === pair?.leftLeaf.view || view === targets?.leftEditorView) return "left";
	if (view === pair?.rightLeaf.view || view === targets?.rightEditorView) return "right";
	return null;
}

/** The difference that has lines on `side` at `line` (1-based). */
export function findDifferenceAt(plugin: MarkdownComparePlugin, side: Side, line: number) {
	const hunks = plugin.getDiffState()?.hunks ?? [];
	const block = (hunk: DiffHunk) =>
		side === "left"
			? { start: hunk.leftStart, count: hunk.leftCount }
			: { start: hunk.rightStart, count: hunk.rightCount };
	return (
		hunks.find((hunk) => {
			const { start, count } = block(hunk);
			return line >= start && line < start + count;
		}) ?? null
	);
}

/**
 * Copy the `from` side's version of the difference at `line` on `side` over the other side.
 * The comparison is refreshed first, so the difference matches the text as it is now. The cursor
 * then goes to the changed lines, so Cmd+Z there undoes the copy. Returns false without a difference.
 */
export function copyDifferenceAt(
	plugin: MarkdownComparePlugin,
	side: Side,
	line: number,
	from: Side,
) {
	refreshComparison(plugin);
	const pair = plugin.getComparePair();
	const hunk = findDifferenceAt(plugin, side, line);
	const leftView = pair ? getNoteView(pair.leftLeaf) : null;
	const rightView = pair ? getNoteView(pair.rightLeaf) : null;
	if (!pair || !hunk || !leftView || !rightView) return false;

	const leftBlock = { start: hunk.leftStart, count: hunk.leftCount };
	const rightBlock = { start: hunk.rightStart, count: hunk.rightCount };
	const fromLeft = from === "left";
	const sourceView = fromLeft ? leftView : rightView;
	const targetView = fromLeft ? rightView : leftView;
	const target = fromLeft ? rightBlock : leftBlock;

	const edit = copyBlockEdit(
		sourceView.editor.getValue(),
		targetView.editor.getValue(),
		fromLeft ? leftBlock : rightBlock,
		target,
	);
	targetView.editor.replaceRange(edit.text, edit.from, edit.to);
	refreshComparison(plugin);

	const cursor = { line: Math.min(target.start - 1, targetView.editor.lastLine()), ch: 0 };
	plugin.app.workspace.setActiveLeaf(targetView.leaf, { focus: true });
	targetView.editor.setCursor(cursor);
	targetView.editor.scrollIntoView({ from: cursor, to: cursor });
	plugin.flashLines(fromLeft ? leftBlock.start : cursor.line + 1, fromLeft ? cursor.line + 1 : rightBlock.start);
	return true;
}

// Cmd+click on these keeps its usual meaning (open the link, search the tag).
const LINK_SELECTOR =
	"a, .cm-link, .cm-url, .cm-hmd-internal-link, .cm-underline, .cm-hashtag, .internal-link, .external-link, .internal-embed";

function isModClick(event: MouseEvent) {
	if (event.button !== 0 || event.altKey || event.shiftKey) return false;
	return Platform.isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function lineAtEvent(view: EditorView, event: MouseEvent) {
	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	return pos == null ? null : view.state.doc.lineAt(pos).number;
}

// A right-click does not move the cursor, so the editor menu asks for the line that was clicked.
let lastRightClick: { side: Side; line: number; time: number } | null = null;

/** The line a right-click just hit on `side`, else the cursor's line (menu opened from the keyboard). */
export function lineForEditorMenu(side: Side, cursorLine: number) {
	const click = lastRightClick;
	lastRightClick = null;
	return click && click.side === side && Date.now() - click.time < 1000 ? click.line : cursorLine;
}

/**
 * Cmd+click (Ctrl+click on Windows and Linux) on a highlighted line copies its difference to the
 * other note; a right-click is remembered for the editor menu.
 */
export function copyDifferenceHandlers(plugin: MarkdownComparePlugin) {
	const rememberRightClick = (event: MouseEvent, view: EditorView) => {
		const side = sideOf(plugin, view);
		const line = side ? lineAtEvent(view, event) : null;
		if (side && line != null) lastRightClick = { side, line, time: Date.now() };
		return false;
	};

	return EditorView.domEventHandlers({
		mousedown: (event, view) => {
			if (event.button === 2) return rememberRightClick(event, view);
			if (!isModClick(event)) return false;
			const side = sideOf(plugin, view);
			if (!side) return false;
			if (event.target instanceof Element && event.target.closest(LINK_SELECTOR)) return false;

			const line = lineAtEvent(view, event);
			if (line == null || !copyDifferenceAt(plugin, side, line, side)) return false;

			event.preventDefault();
			return true;
		},
		contextmenu: rememberRightClick,
	});
}
