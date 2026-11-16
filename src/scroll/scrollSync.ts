import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewNS } from "@codemirror/view";
import { computeHeadingAnchors, mapLineWithAnchors, type HeadingAnchor } from "./headingAnchors";
import type { HeadingSyntax } from "../headings/headings";

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
			const top = exact
				? src.scrollDOM.scrollTop - documentOffset(src) + documentOffset(dst)
				: sectionTop(src, dst);
			const scroller = dst.scrollDOM;
			const target = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
			if (Math.abs(scroller.scrollTop - target) >= 1) scroller.scrollTop = target;
		});
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

