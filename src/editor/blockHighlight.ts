import type { EditorState } from "@codemirror/state";
import { BlockType, ViewPlugin, type EditorView } from "@codemirror/view";
import { diffLineClassesBetween, diffMarksBetween } from "./diffHighlight";
import { cellAt, tableCells } from "./tableCells";

const REMOVED = "markdowncompare-diff-removed";
const ADDED = "markdowncompare-diff-added";
const CHANGED = "markdowncompare-diff-changed";
const REMOVED_WORDS = "markdowncompare-diff-removed-char";

export const BLOCK_CLASSES = {
	removed: "markdowncompare-block-removed",
	added: "markdowncompare-block-added",
	changed: "markdowncompare-block-changed",
};
const ALL_BLOCK_CLASSES = Object.values(BLOCK_CLASSES);

/** Names of the text highlights (CSS Custom Highlight API) for changed words in table cells. */
const HIGHLIGHT_REMOVED = "markdowncompare-removed-words";
const HIGHLIGHT_ADDED = "markdowncompare-added-words";

/** The block colour for the line highlights inside a block: changed when the lines differ in kind. */
function blockClassFor(lineClasses: Set<string>) {
	const removed = lineClasses.has(REMOVED);
	const added = lineClasses.has(ADDED);
	if (lineClasses.has(CHANGED) || (removed && added)) return BLOCK_CLASSES.changed;
	if (removed) return BLOCK_CLASSES.removed;
	if (added) return BLOCK_CLASSES.added;
	return null;
}

/** Block widgets in the editor (tables, callouts, embeds, HTML, math in Live Preview) with the lines they replace. */
export function findBlockWidgets(view: EditorView) {
	const blocks: Array<{ el: HTMLElement; from: number; to: number }> = [];
	for (const child of Array.from(view.contentDOM.children)) {
		if (!child.instanceOf(HTMLElement)) continue;
		if (child.classList.contains("cm-line") || child.classList.contains("cm-gap")) continue;
		let pos: number;
		try {
			pos = view.posAtDOM(child);
		} catch {
			continue;
		}
		const block = view.lineBlockAt(pos);
		if (block.type !== BlockType.WidgetRange) continue;
		blocks.push({ el: child, from: block.from, to: block.to });
	}
	return blocks;
}

/** A DOM range over characters [from, to) of the text inside `el`. */
function textRange(el: Element, from: number, to: number) {
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const range = doc.createRange();
	let offset = 0;
	let started = false;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const length = node.textContent?.length ?? 0;
		if (!started && from <= offset + length) {
			range.setStart(node, from - offset);
			started = true;
		}
		if (started && to <= offset + length) {
			range.setEnd(node, to - offset);
			return range;
		}
		offset += length;
	}
	return null;
}

/**
 * Ranges over the changed words in a rendered table: each table row stands for one source line
 * (the `| --- |` line has none), and each word mark is found in its cell. A cell that renders
 * its text differently from the source (formatting, links) is matched by the marked text, or
 * else highlighted as a whole.
 */
function tableWordRanges(state: EditorState, el: HTMLElement, from: number, to: number) {
	const ranges: Array<{ range: Range; removed: boolean }> = [];
	const table = el.querySelector("table");
	const firstLine = state.doc.lineAt(from).number;
	const lastLine = state.doc.lineAt(to).number;
	if (!table || table.rows.length !== lastLine - firstLine) return ranges;

	for (let number = firstLine; number <= lastLine; number++) {
		if (number === firstLine + 1) continue;
		const line = state.doc.line(number);
		const marks = diffMarksBetween(state, line.from, line.to);
		const row = table.rows[number === firstLine ? 0 : number - firstLine - 1];
		if (!row || marks.length === 0) continue;

		const cells = tableCells(line.text);
		for (const mark of marks) {
			const markFrom = mark.from - line.from;
			const markTo = mark.to - line.from;
			const index = cellAt(cells, markFrom);
			const cell = cells[index];
			const cellEl = row.cells[index];
			if (!cell || !cellEl) continue;

			const source = line.text.slice(cell.from, cell.to);
			const rendered = cellEl.textContent ?? "";
			const lead = rendered.length - rendered.trimStart().length;
			let range: Range | null = null;
			if (rendered.trim() === source) {
				range = textRange(cellEl, lead + markFrom - cell.from, lead + Math.min(markTo, cell.to) - cell.from);
			} else {
				const text = line.text.slice(markFrom, markTo).trim();
				const at = text ? rendered.indexOf(text) : -1;
				if (at >= 0) range = textRange(cellEl, at, at + text.length);
			}
			if (!range) {
				range = el.ownerDocument.createRange();
				range.selectNodeContents(cellEl);
			}
			ranges.push({ range, removed: mark.className === REMOVED_WORDS });
		}
	}
	return ranges;
}

// Word ranges per editor; the highlights of a window hold the ranges of all its editors.
const wordRanges = new Map<EditorView, Array<{ range: Range; removed: boolean }>>();

// Each window (main and pop-outs) has its own highlight registry.
type HighlightWindow = Window & { CSS?: typeof CSS; Highlight?: typeof Highlight };

function publishWordHighlights(win: HighlightWindow) {
	const registry = win.CSS?.highlights;
	if (!registry || !win.Highlight) return;
	const removed: Range[] = [];
	const added: Range[] = [];
	for (const [view, ranges] of wordRanges) {
		if (view.dom.ownerDocument.defaultView !== win) continue;
		for (const { range, removed: isRemoved } of ranges) (isRemoved ? removed : added).push(range);
	}
	registry.set(HIGHLIGHT_REMOVED, new win.Highlight(...removed));
	registry.set(HIGHLIGHT_ADDED, new win.Highlight(...added));
}

/**
 * Live Preview draws tables, callouts, embeds and other blocks as widgets in place of their
 * lines, so the line highlights do not show there. This gives such a block the colour of the
 * highlighted lines it stands for, and marks the changed words inside tables. It runs after
 * each editor update and after the DOM changes (tables render their cells after the update).
 */
export const blockHighlightPlugin = ViewPlugin.fromClass(
	class {
		private readonly observer: MutationObserver;

		constructor(readonly view: EditorView) {
			this.observer = new MutationObserver(() => this.schedule());
			this.observer.observe(view.contentDOM, { childList: true, subtree: true, characterData: true });
			this.schedule();
		}

		update() {
			this.schedule();
		}

		destroy() {
			this.observer.disconnect();
			wordRanges.delete(this.view);
			const win = this.view.dom.ownerDocument.defaultView;
			if (win) publishWordHighlights(win);
		}

		private schedule() {
			this.view.requestMeasure({
				key: this,
				read: (view) =>
					findBlockWidgets(view).map(({ el, from, to }) => ({
						el,
						cls: blockClassFor(diffLineClassesBetween(view.state, from, to)),
						words: tableWordRanges(view.state, el, from, to),
					})),
				write: (blocks, view) => {
					for (const { el, cls } of blocks) {
						for (const name of ALL_BLOCK_CLASSES) el.toggleClass(name, name === cls);
					}
					const words = blocks.flatMap((block) => block.words);
					const previous = wordRanges.get(view);
					if (words.length === 0 && !previous?.length) return;
					wordRanges.set(view, words);
					const win = view.dom.ownerDocument.defaultView;
					if (win) publishWordHighlights(win);
				},
			});
		}
	},
);
