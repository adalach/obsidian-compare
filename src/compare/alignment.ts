import { BlockType, type BlockInfo, type EditorView } from "@codemirror/view";
import { clearGaps, gapAnchorsField, getGaps, setGapAnchors, setGaps, type Gap } from "../editor/gaps";

/**
 * Gaps that make each matched line start at the same height in both notes. `left[k]` and
 * `right[k]` are the tops of the k-th matched line without any gaps; the gap before line k goes
 * to the side whose line would otherwise sit higher.
 */
export function planGaps(left: number[], right: number[]) {
	const gaps: Array<{ index: number; side: "left" | "right"; height: number }> = [];
	let shift = 0; // gaps added on the right minus gaps added on the left, so far
	for (let k = 0; k < Math.min(left.length, right.length); k++) {
		const need = left[k]! - right[k]! - shift;
		if (need > 0.5) {
			gaps.push({ index: k, side: "right", height: need });
			shift += need;
		} else if (need < -0.5) {
			gaps.push({ index: k, side: "left", height: -need });
			shift += need;
		}
	}
	return gaps;
}

/** The part of a line block that holds the line itself, without block widgets attached to it. */
function mainBlock(block: BlockInfo, pos: number) {
	if (!Array.isArray(block.type)) return block;
	const parts = block.type as readonly BlockInfo[];
	return (
		parts.find(
			(part) =>
				part.type !== BlockType.WidgetBefore &&
				part.type !== BlockType.WidgetAfter &&
				part.from <= pos &&
				pos <= part.to,
		) ?? block
	);
}

/** Lines inside a widget other than its first (table rows after the header) have no top of their own. */
function isInsideWidget(view: EditorView, pos: number) {
	const block = mainBlock(view.lineBlockAt(pos), pos);
	return block.type === BlockType.WidgetRange && block.from < pos;
}

/** Total height of the gaps above the line starting at `pos`. */
function gapsAbove(gaps: Gap[], pos: number) {
	let sum = 0;
	for (const gap of gaps) {
		if (gap.side === 1 ? gap.pos < pos : gap.pos <= pos) sum += gap.height;
	}
	return sum;
}

function gapBefore(lineStart: number, height: number): Gap {
	return lineStart > 0 ? { pos: lineStart - 1, side: 1, height } : { pos: 0, side: -1, height };
}

function sameGaps(a: Gap[], b: Gap[]) {
	return (
		a.length === b.length &&
		a.every((gap, i) => {
			const other = b[i];
			return other && other.pos === gap.pos && other.side === gap.side && Math.abs(other.height - gap.height) < 1;
		})
	);
}

/**
 * Keeps two editors' matched lines level by adding blank gaps, and keeps them so while the
 * notes are edited and while heights change (wrapping, tables and images drawn, lines measured
 * as they scroll into view). Gaps are only shown on screen; they are not part of the notes.
 */
export class GapAligner {
	private views: { left: EditorView; right: EditorView } | null = null;
	private timer: number | null = null;

	attach(left: EditorView, right: EditorView) {
		if (this.views?.left === left && this.views.right === right) return;
		this.detach();
		this.views = { left, right };
	}

	detach() {
		if (this.timer != null) window.clearTimeout(this.timer);
		this.timer = null;
		if (!this.views) return;
		clearGaps(this.views.left);
		clearGaps(this.views.right);
		this.views = null;
	}

	isAttachedTo(view: EditorView) {
		return this.views?.left === view || this.views?.right === view;
	}

	/** Set the matched lines (1-based [left, right] pairs) to keep level. */
	setMatchedLines(matched: Array<[number, number]>) {
		if (!this.views) return;
		const { left, right } = this.views;
		const starts = (view: EditorView, lines: number[]) =>
			lines.filter((line) => line <= view.state.doc.lines).map((line) => view.state.doc.line(line).from);
		const leftStarts = starts(left, matched.map(([line]) => line));
		const rightStarts = starts(right, matched.map(([, line]) => line));
		if (leftStarts.length !== rightStarts.length) return;
		left.dispatch({ effects: setGapAnchors.of(leftStarts) });
		right.dispatch({ effects: setGapAnchors.of(rightStarts) });
		this.schedule();
	}

	/** Recompute the gaps shortly, once the editors have measured their new heights. */
	schedule() {
		if (!this.views || this.timer != null) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.align();
		}, 50);
	}

	private align() {
		if (!this.views) return;
		const { left, right } = this.views;
		const leftAnchors = left.state.field(gapAnchorsField, false) ?? [];
		const rightAnchors = right.state.field(gapAnchorsField, false) ?? [];
		if (leftAnchors.length !== rightAnchors.length) return;
		const leftGaps = getGaps(left.state);
		const rightGaps = getGaps(right.state);

		const leftStarts: number[] = [];
		const rightStarts: number[] = [];
		const leftTops: number[] = [];
		const rightTops: number[] = [];
		const top = (view: EditorView, gaps: Gap[], pos: number) =>
			mainBlock(view.lineBlockAt(pos), pos).top - gapsAbove(gaps, pos);
		for (let k = 0; k < leftAnchors.length; k++) {
			const leftStart = left.state.doc.lineAt(Math.min(leftAnchors[k]!, left.state.doc.length)).from;
			const rightStart = right.state.doc.lineAt(Math.min(rightAnchors[k]!, right.state.doc.length)).from;
			if (isInsideWidget(left, leftStart) || isInsideWidget(right, rightStart)) continue;
			leftStarts.push(leftStart);
			rightStarts.push(rightStart);
			leftTops.push(top(left, leftGaps, leftStart));
			rightTops.push(top(right, rightGaps, rightStart));
		}

		const nextLeft: Gap[] = [];
		const nextRight: Gap[] = [];
		for (const { index, side, height } of planGaps(leftTops, rightTops)) {
			if (side === "left") nextLeft.push(gapBefore(leftStarts[index]!, height));
			else nextRight.push(gapBefore(rightStarts[index]!, height));
		}
		if (!sameGaps(leftGaps, nextLeft)) left.dispatch({ effects: setGaps.of(nextLeft) });
		if (!sameGaps(rightGaps, nextRight)) right.dispatch({ effects: setGaps.of(nextRight) });
	}
}
