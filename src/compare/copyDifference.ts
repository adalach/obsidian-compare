import { EditorView, ViewPlugin } from "@codemirror/view";
import { Platform } from "obsidian";
import type MarkdownComparePlugin from "../main";
import { copyBlockEdit, copyChangeEdit } from "../diff/copy";
import { wordChanges } from "../diff/words";
import { BLOCK_CLASSES, findBlockWidgets } from "../editor/blockHighlight";
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

/**
 * The word change at character `ch` of `line` on `side`, when that line is paired with an edited
 * version of it on the other side. Only a change with words on `side` can be hit.
 */
export function findChangeAt(plugin: MarkdownComparePlugin, side: Side, line: number, ch: number) {
	const pair = plugin.getComparePair();
	const hunk = findDifferenceAt(plugin, side, line);
	const leftView = pair ? getNoteView(pair.leftLeaf) : null;
	const rightView = pair ? getNoteView(pair.rightLeaf) : null;
	if (!hunk?.paired || !leftView || !rightView) return null;

	const offset = line - (side === "left" ? hunk.leftStart : hunk.rightStart);
	const leftLine = hunk.leftStart + offset;
	const rightLine = hunk.rightStart + offset;
	const leftText = leftView.editor.getLine(leftLine - 1);
	const rightText = rightView.editor.getLine(rightLine - 1);
	const change = wordChanges(leftText, rightText).find((c) => {
		const [from, to] = side === "left" ? [c.leftFrom, c.leftTo] : [c.rightFrom, c.rightTo];
		return to > from && ch >= from && ch <= to;
	});
	if (!change) return null;
	const otherHasWords = side === "left" ? change.rightTo > change.rightFrom : change.leftTo > change.leftFrom;
	return { change, leftLine, rightLine, leftText, rightText, leftView, rightView, otherHasWords };
}

/**
 * Copy only the word change at `ch` of `line` on `side`, taking the `from` side's words, and put
 * the cursor after them so Cmd+Z there undoes it. Returns false when no change is there.
 */
export function copyChangeAt(
	plugin: MarkdownComparePlugin,
	side: Side,
	line: number,
	ch: number,
	from: Side,
) {
	refreshComparison(plugin);
	const found = findChangeAt(plugin, side, line, ch);
	if (!found) return false;

	const fromLeft = from === "left";
	const edit = copyChangeEdit(found.leftText, found.rightText, found.change, from);
	const targetView = fromLeft ? found.rightView : found.leftView;
	const targetLine = (fromLeft ? found.rightLine : found.leftLine) - 1;
	targetView.editor.replaceRange(edit.text, { line: targetLine, ch: edit.fromCh }, { line: targetLine, ch: edit.toCh });
	refreshComparison(plugin);

	const cursor = { line: targetLine, ch: edit.fromCh + edit.text.length };
	plugin.app.workspace.setActiveLeaf(targetView.leaf, { focus: true });
	targetView.editor.setCursor(cursor);
	targetView.editor.scrollIntoView({ from: cursor, to: cursor });
	plugin.flashLines(found.leftLine, found.rightLine);
	return true;
}

// Cmd+click on these keeps its usual meaning (open the link, search the tag).
const LINK_SELECTOR =
	"a, .cm-link, .cm-url, .cm-hmd-internal-link, .cm-underline, .cm-hashtag, .internal-link, .external-link, .internal-embed";

function isModClick(event: MouseEvent) {
	if (event.button !== 0 || event.altKey || event.shiftKey) return false;
	return Platform.isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** The clicked spot as a 1-based line and the character in it. */
function positionAtEvent(view: EditorView, event: MouseEvent) {
	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (pos == null) return null;
	const line = view.state.doc.lineAt(pos);
	return { line: line.number, ch: pos - line.from };
}

// A right-click does not move the cursor, so the editor menu asks for the spot that was clicked.
let lastRightClick: { side: Side; line: number; ch: number; time: number } | null = null;

/** The spot a right-click just hit on `side`, else the cursor (menu opened from the keyboard). */
export function positionForEditorMenu(side: Side, cursor: { line: number; ch: number }) {
	const click = lastRightClick;
	lastRightClick = null;
	return click && click.side === side && Date.now() - click.time < 1000
		? { line: click.line, ch: click.ch }
		: cursor;
}

/**
 * Cmd+click (Ctrl+click on Windows and Linux) on a marked word copies that change to the other
 * note, and elsewhere on a highlighted line the whole difference; a right-click is remembered
 * for the editor menu.
 */
export function copyDifferenceHandlers(plugin: MarkdownComparePlugin) {
	const rememberRightClick = (event: MouseEvent, view: EditorView) => {
		const side = sideOf(plugin, view);
		const position = side ? positionAtEvent(view, event) : null;
		if (side && position) lastRightClick = { side, ...position, time: Date.now() };
		return false;
	};

	return [
		EditorView.domEventHandlers({
			mousedown: (event, view) => {
				if (event.button === 2) return rememberRightClick(event, view);
				if (!isModClick(event)) return false;
				const side = sideOf(plugin, view);
				if (!side) return false;
				if (event.target instanceof Element && event.target.closest(LINK_SELECTOR)) return false;

				const position = positionAtEvent(view, event);
				if (!position) return false;
				const { line, ch } = position;
				if (!copyChangeAt(plugin, side, line, ch, side) && !copyDifferenceAt(plugin, side, line, side)) {
					return false;
				}

				event.preventDefault();
				return true;
			},
			contextmenu: rememberRightClick,
		}),
		copyBlockOnModClick(plugin),
	];
}

const BLOCK_SELECTOR = Object.values(BLOCK_CLASSES)
	.map((name) => `.${name}`)
	.join(", ");

/**
 * Cmd+click on a coloured block (a table, callout or embed in Live Preview) copies the first
 * difference in it. It listens in the capture phase, before the block's own click handling
 * (such as editing a table cell).
 */
function copyBlockOnModClick(plugin: MarkdownComparePlugin) {
	return ViewPlugin.fromClass(
		class {
			constructor(readonly view: EditorView) {
				view.contentDOM.addEventListener("mousedown", this.onMouseDown, true);
			}

			destroy() {
				this.view.contentDOM.removeEventListener("mousedown", this.onMouseDown, true);
			}

			onMouseDown = (event: MouseEvent) => {
				if (!isModClick(event)) return;
				const target = event.target;
				if (!(target instanceof Element)) return;
				const blockEl = target.closest(BLOCK_SELECTOR);
				const side = sideOf(plugin, this.view);
				if (!blockEl || !side) return;
				const block = findBlockWidgets(this.view).find(({ el }) => el === blockEl);
				if (!block) return;

				refreshComparison(plugin);
				const doc = this.view.state.doc;
				const lastLine = doc.lineAt(block.to).number;
				for (let line = doc.lineAt(block.from).number; line <= lastLine; line++) {
					if (!findDifferenceAt(plugin, side, line)) continue;
					if (copyDifferenceAt(plugin, side, line, side)) {
						event.preventDefault();
						event.stopPropagation();
					}
					return;
				}
			};
		},
	);
}
