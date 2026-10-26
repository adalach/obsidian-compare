import { BlockType, ViewPlugin, type EditorView } from "@codemirror/view";
import { diffLineClassesBetween } from "./diffHighlight";

const REMOVED = "markdowncompare-diff-removed";
const ADDED = "markdowncompare-diff-added";
const CHANGED = "markdowncompare-diff-changed";

export const BLOCK_CLASSES = {
	removed: "markdowncompare-block-removed",
	added: "markdowncompare-block-added",
	changed: "markdowncompare-block-changed",
};
const ALL_BLOCK_CLASSES = Object.values(BLOCK_CLASSES);

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

/**
 * Live Preview draws tables, callouts, embeds and other blocks as widgets in place of their
 * lines, so the line highlights do not show there. This gives such a block the colour of the
 * highlighted lines it stands for. It runs after each editor update, once the DOM is drawn.
 */
export const blockHighlightPlugin = ViewPlugin.fromClass(
	class {
		constructor(readonly view: EditorView) {
			this.schedule();
		}

		update() {
			this.schedule();
		}

		private schedule() {
			this.view.requestMeasure({
				key: this,
				read: (view) =>
					findBlockWidgets(view).map(({ el, from, to }) => ({
						el,
						cls: blockClassFor(diffLineClassesBetween(view.state, from, to)),
					})),
				write: (blocks) => {
					for (const { el, cls } of blocks) {
						for (const name of ALL_BLOCK_CLASSES) el.toggleClass(name, name === cls);
					}
				},
			});
		}
	},
);
