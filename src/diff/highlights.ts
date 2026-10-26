import type {
	DiffHighlightSpec,
	DiffLineDecoration,
	DiffMarkDecoration,
} from "../editor/diffHighlight";
import { diffLinesMyers } from "./myersLineDiff";
import { wordChanges } from "./words";
import { alignLines, isWeakLine, type AlignOp } from "./align";
import type { DiffHunk } from "../ui/DiffView";
import { computeHeadingAnchors, type HeadingAnchor } from "../scroll/headingAnchors";
import { extractHeadings, headingLabelAt, type HeadingSyntax } from "../headings/headings";

const ADDED_CLASS = "markdowncompare-diff-added";
const REMOVED_CLASS = "markdowncompare-diff-removed";
const CHANGED_CLASS = "markdowncompare-diff-changed";
const ADDED_CHAR_CLASS = "markdowncompare-diff-added-char";
const REMOVED_CHAR_CLASS = "markdowncompare-diff-removed-char";

function splitLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Filter a list of heading anchors (sorted by leftLine) to a strictly
 * monotone-increasing subsequence in rightLine. This is required before
 * inserting sentinels so that both augmented arrays receive sentinels in
 * document order.
 */
function filterMonotoneAnchors(anchors: HeadingAnchor[]): HeadingAnchor[] {
	const result: HeadingAnchor[] = [];
	let maxRight = 0;
	for (const anchor of anchors) {
		if (anchor.rightLine > maxRight) {
			result.push(anchor);
			maxRight = anchor.rightLine;
		}
	}
	return result;
}

export function computeHighlights(
	leftText: string,
	rightText: string,
	leftSyntax: HeadingSyntax = "markdown",
	rightSyntax: HeadingSyntax = "markdown",
): {
	left: DiffHighlightSpec;
	right: DiffHighlightSpec;
	hunks: DiffHunk[];
	/** Matched lines (equal, or edited versions of each other) as 1-based [left, right] pairs, in order. */
	matched: Array<[number, number]>;
} {
	const leftLines = splitLines(leftText);
	const rightLines = splitLines(rightText);

	// Compute section anchors and use them to prevent Myers from matching lines
	// across section boundaries. A unique sentinel string is inserted just before
	// each matched heading in both augmented arrays. Because sentinels are unique,
	// Myers must treat them as "equal", effectively locking the alignment at each
	// matched heading and confining the diff to content within the same section.
	const anchors = filterMonotoneAnchors(
		computeHeadingAnchors(leftText, rightText, leftSyntax, rightSyntax),
	);

	const augLeft: string[] = [];
	const augRight: string[] = [];
	// Map from augmented-array index → 1-based original line number.
	// null means the entry is a sentinel (no corresponding document line).
	const leftLineOf: (number | null)[] = [];
	const rightLineOf: (number | null)[] = [];

	let li = 0; // 0-based cursor into leftLines
	let ri = 0;

	for (let ai = 0; ai < anchors.length; ai++) {
		const anchor = anchors[ai]!;
		const sentinel = `\x00section-boundary\x00${ai}\x00`;

		while (li < anchor.leftLine - 1) {
			augLeft.push(leftLines[li]!);
			leftLineOf.push(li + 1);
			li++;
		}
		while (ri < anchor.rightLine - 1) {
			augRight.push(rightLines[ri]!);
			rightLineOf.push(ri + 1);
			ri++;
		}

		augLeft.push(sentinel);
		augRight.push(sentinel);
		leftLineOf.push(null);
		rightLineOf.push(null);

		augLeft.push(leftLines[li]!);
		leftLineOf.push(li + 1);
		li++;

		augRight.push(rightLines[ri]!);
		rightLineOf.push(ri + 1);
		ri++;
	}

	while (li < leftLines.length) {
		augLeft.push(leftLines[li]!);
		leftLineOf.push(li + 1);
		li++;
	}
	while (ri < rightLines.length) {
		augRight.push(rightLines[ri]!);
		rightLineOf.push(ri + 1);
		ri++;
	}

	const edits = diffLinesMyers(augLeft, augRight);

	// The line diff as 1-based original line numbers; a section sentinel has neither.
	const entries: LineEntry[] = [];
	let augLi = 0;
	let augRi = 0;
	for (const edit of edits) {
		if (edit.type === "equal") {
			entries.push({ type: "equal", left: leftLineOf[augLi] ?? null, right: rightLineOf[augRi] ?? null });
			augLi++;
			augRi++;
		} else if (edit.type === "delete") {
			const left = leftLineOf[augLi++] ?? null;
			if (left !== null) entries.push({ type: "delete", left, right: null });
		} else {
			const right = rightLineOf[augRi++] ?? null;
			if (right !== null) entries.push({ type: "insert", left: null, right });
		}
	}

	// Re-pair the lines between anchors by similarity (see align.ts). Anchors are the section
	// sentinels and equal lines with words in them. Equal blank lines are not anchors: they can
	// match across an edit and split a paragraph from its edited version.
	const ops: AlignOp[] = [];
	let region: LineEntry[] = [];
	for (const entry of entries) {
		const isAnchor =
			entry.type === "equal" &&
			(entry.left === null || !isWeakLine(leftLines[entry.left - 1] ?? ""));
		if (!isAnchor) {
			region.push(entry);
			continue;
		}
		ops.push(...alignRegion(region, leftLines, rightLines));
		region = [];
		if (entry.left !== null && entry.right !== null) {
			ops.push({ type: "equal", left: entry.left, right: entry.right });
		}
	}
	ops.push(...alignRegion(region, leftLines, rightLines));

	const leftDecorations: DiffLineDecoration[] = [];
	const rightDecorations: DiffLineDecoration[] = [];
	const leftMarks: DiffMarkDecoration[] = [];
	const rightMarks: DiffMarkDecoration[] = [];
	const hunks: DiffHunk[] = [];

	const leftHeadings = extractHeadings(leftText, leftSyntax);
	const rightHeadings = extractHeadings(rightText, rightSyntax);

	const getPreview = (kind: DiffHunk["kind"], leftLineN: number | null, rightLineN: number | null) => {
		const raw =
			kind === "added"
				? (rightLineN != null ? (rightLines[rightLineN - 1] ?? "") : "")
				: kind === "removed"
					? (leftLineN != null ? (leftLines[leftLineN - 1] ?? "") : "")
					: (rightLineN != null ? (rightLines[rightLineN - 1] ?? "") : (leftLineN != null ? (leftLines[leftLineN - 1] ?? "") : ""));

		return raw.replace(/\t/g, "    ").slice(0, 80);
	};

	const markChangedPair = (leftLineNo: number, rightLineNo: number) => {
		leftDecorations.push({ line: leftLineNo, className: CHANGED_CLASS });
		rightDecorations.push({ line: rightLineNo, className: CHANGED_CLASS });

		const changes = wordChanges(leftLines[leftLineNo - 1] ?? "", rightLines[rightLineNo - 1] ?? "");
		for (const { leftFrom, leftTo, rightFrom, rightTo } of changes) {
			if (leftTo > leftFrom) {
				leftMarks.push({ line: leftLineNo, from: leftFrom, to: leftTo, className: REMOVED_CHAR_CLASS });
			}
			if (rightTo > rightFrom) {
				rightMarks.push({ line: rightLineNo, from: rightFrom, to: rightTo, className: ADDED_CHAR_CLASS });
			}
		}
	};

	// One hunk per run of differing lines: a run of lines paired as edits of each other, or a
	// run of lines without a partner on the other side. leftStart/rightStart say where the run
	// sits on each side, also on a side where it has no lines (where they would go).
	let consumedLeft = 0;
	let consumedRight = 0;
	let run: { paired: boolean; left: number[]; right: number[] } | null = null;

	const flush = () => {
		if (!run) return;
		const leftCount = run.left.length;
		const rightCount = run.right.length;
		const leftStart = consumedLeft - leftCount + 1;
		const rightStart = consumedRight - rightCount + 1;
		const kind: DiffHunk["kind"] =
			leftCount > 0 && rightCount > 0 ? "changed" : leftCount > 0 ? "removed" : "added";
		const leftLine = leftCount > 0 ? leftStart : null;
		const rightLine = rightCount > 0 ? rightStart : null;
		// Paired lines, and one line replaced by one line, get word marks; other replaced
		// lines show as removed on the left and added on the right.
		const paired = run.paired || (leftCount === 1 && rightCount === 1);
		hunks.push({
			kind,
			paired,
			leftLine,
			rightLine,
			leftCount,
			rightCount,
			leftStart,
			rightStart,
			preview: getPreview(kind, leftLine, rightLine),
			// A side without lines takes the heading of the line above the run.
			leftHeader: headingLabelAt(leftHeadings, Math.max(1, leftLine ?? leftStart - 1)),
			rightHeader: headingLabelAt(rightHeadings, Math.max(1, rightLine ?? rightStart - 1)),
		});

		if (paired) {
			run.left.forEach((leftLineNo, i) => {
				const rightLineNo = run?.right[i];
				if (rightLineNo != null) markChangedPair(leftLineNo, rightLineNo);
			});
		} else {
			for (const line of run.left) leftDecorations.push({ line, className: REMOVED_CLASS });
			for (const line of run.right) rightDecorations.push({ line, className: ADDED_CLASS });
		}
		run = null;
	};

	const matched: Array<[number, number]> = [];
	for (const op of ops) {
		if (op.type === "equal" || op.type === "changed") matched.push([op.left, op.right]);
		if (op.type === "equal") {
			flush();
			consumedLeft++;
			consumedRight++;
			continue;
		}
		const paired = op.type === "changed";
		if (run && run.paired !== paired) flush();
		run ??= { paired, left: [], right: [] };
		if (op.type !== "insert") {
			run.left.push(op.left);
			consumedLeft++;
		}
		if (op.type !== "delete") {
			run.right.push(op.right);
			consumedRight++;
		}
	}
	flush();

	return {
		left: { lines: leftDecorations, marks: leftMarks },
		right: { lines: rightDecorations, marks: rightMarks },
		hunks,
		matched,
	};
}

/** A line of the line diff, as 1-based original line numbers (null on the side it is missing). */
type LineEntry = { type: "equal" | "delete" | "insert"; left: number | null; right: number | null };

/** Pair the lines between two anchors (see align.ts), as 1-based line numbers. */
function alignRegion(region: LineEntry[], leftLines: string[], rightLines: string[]): AlignOp[] {
	const leftNumbers = region.flatMap((entry) => (entry.left === null ? [] : [entry.left]));
	const rightNumbers = region.flatMap((entry) => (entry.right === null ? [] : [entry.right]));
	if (region.every((entry) => entry.type === "equal")) {
		return leftNumbers.map((left, i) => ({ type: "equal", left, right: rightNumbers[i] ?? left }));
	}

	const aligned = alignLines(
		leftNumbers.map((line) => leftLines[line - 1] ?? ""),
		rightNumbers.map((line) => rightLines[line - 1] ?? ""),
	);
	if (!aligned) return pairByPosition(region);

	return aligned.map((op): AlignOp => {
		if (op.type === "delete") return { type: "delete", left: leftNumbers[op.left] ?? 0 };
		if (op.type === "insert") return { type: "insert", right: rightNumbers[op.right] ?? 0 };
		return { type: op.type, left: leftNumbers[op.left] ?? 0, right: rightNumbers[op.right] ?? 0 };
	});
}

/** Too long to align: keep the line diff and pair each run of removed and added lines by position. */
function pairByPosition(region: LineEntry[]): AlignOp[] {
	const ops: AlignOp[] = [];
	let deleted: number[] = [];
	let inserted: number[] = [];
	const flushRun = () => {
		const pairs = Math.min(deleted.length, inserted.length);
		for (let i = 0; i < pairs; i++) {
			ops.push({ type: "changed", left: deleted[i] ?? 0, right: inserted[i] ?? 0 });
		}
		for (const left of deleted.slice(pairs)) ops.push({ type: "delete", left });
		for (const right of inserted.slice(pairs)) ops.push({ type: "insert", right });
		deleted = [];
		inserted = [];
	};
	for (const entry of region) {
		if (entry.type === "delete" && entry.left !== null) deleted.push(entry.left);
		else if (entry.type === "insert" && entry.right !== null) inserted.push(entry.right);
		else if (entry.left !== null && entry.right !== null) {
			flushRun();
			ops.push({ type: "equal", left: entry.left, right: entry.right });
		}
	}
	flushRun();
	return ops;
}
