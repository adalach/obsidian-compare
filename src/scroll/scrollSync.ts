import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewNS } from "@codemirror/view";
import { computeHeadingAnchors, mapLineWithAnchors, type HeadingAnchor } from "./headingAnchors";
import type { HeadingSyntax } from "../headings/headings";
import { mainBlock } from "../compare/alignment";
import { gapAnchorsField } from "../editor/gaps";

export interface CompareTargets {
	leftEditorView: EditorView;
	rightEditorView: EditorView;
	leftPath: string;
	rightPath: string;
}

export function scrollEditorToLine(editorView: EditorView, line: number) {
	const clampedLine = Math.max(1, Math.min(line, editorView.state.doc.lines));
	const pos = editorView.state.doc.line(clampedLine).from;
	editorView.dispatch({
		selection: { anchor: pos },
		effects: EditorViewNS.scrollIntoView(pos, { y: "center" }),
	});
}

export function scrollBothEditorsToLines(
	left: EditorView,
	right: EditorView,
	leftLine: number,
	rightLine: number,
) {
	scrollEditorToLine(left, leftLine);
	scrollEditorToLine(right, rightLine);
}

/** Distance from the top of the editor's scroll area to the top of the note's text. */
function documentOffset(view: EditorView) {
	return view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop;
}

/**
 * Keep two editors scrolled together. With `exact` (gaps keep the matched lines level), both show
 * the same stretch of the note; otherwise the top line is mapped through the matched headings.
 */
export function startScrollSync(
	left: EditorView,
	right: EditorView,
	leftSyntax: HeadingSyntax,
	rightSyntax: HeadingSyntax,
	exact = false,
) {
	const win = left.scrollDOM.ownerDocument.defaultView ?? window;
	let source: EditorView | null = null;
	let rafId: number | null = null;

	// Cache anchors by doc object identity — recompute only when content changes.
	let cachedLeftDoc: unknown = null;
	let cachedRightDoc: unknown = null;
	let cachedAnchors: HeadingAnchor[] = [];

	const getAnchors = (): HeadingAnchor[] => {
		const leftDoc = left.state.doc;
		const rightDoc = right.state.doc;
		if (leftDoc !== cachedLeftDoc || rightDoc !== cachedRightDoc) {
			cachedLeftDoc = leftDoc;
			cachedRightDoc = rightDoc;
			cachedAnchors = computeHeadingAnchors(
				leftDoc.toString(),
				rightDoc.toString(),
				leftSyntax,
				rightSyntax,
			);
		}
		return cachedAnchors;
	};

	const scheduleSync = () => {
		if (rafId != null) return;

		rafId = win.requestAnimationFrame(() => {
			rafId = null;
			const src = source;
			if (!src) return;
			const dst = src === left ? right : left;
			const top = exact ? matchedTop(src, dst) : sectionTop(src, dst);
			const scroller = dst.scrollDOM;
			const target = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
			if (Math.abs(scroller.scrollTop - target) >= 1) scroller.scrollTop = target;
		});
	};

	/**
	 * Scroll position that puts the partner of the source's last matched line above the top
	 * edge at the same height on screen (not just in the pane). Once the gaps level the matched lines this is the
	 * same offset as the source; until then (gaps planned from estimated heights off screen)
	 * it still brings both lines on screen, where the gaps get corrected.
	 */
	const matchedTop = (src: EditorView, dst: EditorView) => {
		const offset = src.scrollDOM.scrollTop - documentOffset(src) + documentOffset(dst);
		const srcAnchors = src.state.field(gapAnchorsField, false);
		const dstAnchors = dst.state.field(gapAnchorsField, false);
		if (!srcAnchors?.length || srcAnchors.length !== dstAnchors?.length) return offset;
		const srcTop = src.scrollDOM.scrollTop - documentOffset(src);
		const topPos = src.lineBlockAtHeight(Math.max(0, srcTop)).from;
		let lo = 0;
		let hi = srcAnchors.length - 1;
		let k = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (srcAnchors[mid]! <= topPos) {
				k = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		if (k < 0) return offset;
		const lineTop = (view: EditorView, pos: number) =>
			mainBlock(view.lineBlockAt(Math.min(pos, view.state.doc.length)), pos).top;
		// Panes can start at different heights on screen (a search bar open in one of them).
		const screenShift = src.scrollDOM.getBoundingClientRect().top - dst.scrollDOM.getBoundingClientRect().top;
		return (
			lineTop(dst, dstAnchors[k]!) + (srcTop - lineTop(src, srcAnchors[k]!)) + documentOffset(dst) - screenShift
		);
	};

	const sectionTop = (src: EditorView, dst: EditorView) => {
		const srcTop = src.scrollDOM.scrollTop - documentOffset(src);
		const srcBlock = src.lineBlockAtHeight(srcTop + 2);
		const srcLine = src.state.doc.lineAt(srcBlock.from).number;
		const dstLine = mapLineWithAnchors(
			srcLine,
			getAnchors(),
			src.state.doc.lines,
			dst.state.doc.lines,
			src === left,
		);
		return dst.lineBlockAt(dst.state.doc.line(dstLine).from).top + documentOffset(dst);
	};

	const inputEvents = ["wheel", "touchmove", "pointerdown", "keydown"];
	const listen = (view: EditorView) => {
		const scroller = view.scrollDOM;
		const onInput = () => { source = view; };
		const onScroll = () => {
			// Writes to scrollTop and CodeMirror's height corrections both emit scroll events
			// later. Keep the same source until the user interacts with the other editor.
			source ??= view;
			scheduleSync(); // always from the source, never back: a follower's events must not drive the source
		};
		for (const event of inputEvents) {
			scroller.addEventListener(event, onInput, { capture: true, passive: true });
		}
		scroller.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			for (const event of inputEvents) scroller.removeEventListener(event, onInput, true);
			scroller.removeEventListener("scroll", onScroll);
		};
	};

	const stopLeft = listen(left);
	const stopRight = listen(right);

	return () => {
		stopLeft();
		stopRight();
		if (rafId != null) win.cancelAnimationFrame(rafId);
	};
}

