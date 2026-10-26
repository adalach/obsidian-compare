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
	let syncing = false;
	let rafId: number | null = null;
	let pending: { source: EditorView } | null = null;

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

	const syncFrom = (source: EditorView) => {
		pending = { source };
		if (rafId != null) return;

		rafId = window.requestAnimationFrame(() => {
			rafId = null;
			if (!pending) return;

			const src = pending.source;
			pending = null;
			const dst = src === left ? right : left;
			const leftToRight = src === left;

			if (syncing) return;
			syncing = true;
			try {
				if (exact) {
					const target = src.scrollDOM.scrollTop - documentOffset(src) + documentOffset(dst);
					if (Math.abs(dst.scrollDOM.scrollTop - target) >= 1) dst.scrollDOM.scrollTop = target;
					return;
				}
				const srcTop = src.scrollDOM.scrollTop;
				const srcBlock = src.lineBlockAtHeight(srcTop + 2);
				const srcLine = src.state.doc.lineAt(srcBlock.from).number;

				const anchors = getAnchors();
				const dstLine = mapLineWithAnchors(
					srcLine,
					anchors,
					src.state.doc.lines,
					dst.state.doc.lines,
					leftToRight,
				);

				const dstPos = dst.state.doc.line(dstLine).from;
				const dstBlock = dst.lineBlockAt(dstPos);
				dst.scrollDOM.scrollTop = dstBlock.top;
			} finally {
				syncing = false;
			}
		});
	};

	const leftHandler = () => syncFrom(left);
	const rightHandler = () => syncFrom(right);

	left.scrollDOM.addEventListener("scroll", leftHandler, { passive: true });
	right.scrollDOM.addEventListener("scroll", rightHandler, { passive: true });

	return () => {
		left.scrollDOM.removeEventListener("scroll", leftHandler);
		right.scrollDOM.removeEventListener("scroll", rightHandler);
		if (rafId != null) window.cancelAnimationFrame(rafId);
	};
}

