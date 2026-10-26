import { extractHeadings, type Heading, type HeadingSyntax } from "../headings/headings";

export interface HeadingAnchor {
	leftLine: number;
	rightLine: number;
}

interface Section {
	level: number;
	text: string;
	line: number;
	children: Section[];
}

/**
 * Build a section tree from a flat heading list. Each section owns the lines
 * from its heading up to (but not including) the next same-or-higher-level heading.
 */
function buildSectionTree(headings: Heading[]): Section[] {
	const root: Section = { level: 0, text: "", line: 0, children: [] };
	const stack: Section[] = [root];

	for (const h of headings) {
		while (stack.length > 1 && stack[stack.length - 1]!.level >= h.level) {
			stack.pop();
		}
		const section: Section = { level: h.level, text: h.text, line: h.line, children: [] };
		stack[stack.length - 1]!.children.push(section);
		stack.push(section);
	}

	return root.children;
}

/**
 * Recursively match sections by heading text between two section lists,
 * preserving document order (each match advances the right-side search cursor
 * forward so order is respected).
 */
function matchSectionsRecursive(
	leftSections: Section[],
	rightSections: Section[],
	anchors: HeadingAnchor[],
): void {
	let rightSearchStart = 0;
	const rightUsed = new Set<number>();

	for (const left of leftSections) {
		let rightIdx = -1;
		for (let i = rightSearchStart; i < rightSections.length; i++) {
			if (!rightUsed.has(i) && rightSections[i]!.text === left.text) {
				rightIdx = i;
				break;
			}
		}
		if (rightIdx === -1) continue;

		rightUsed.add(rightIdx);
		rightSearchStart = rightIdx + 1;

		const right = rightSections[rightIdx]!;
		anchors.push({ leftLine: left.line, rightLine: right.line });

		matchSectionsRecursive(left.children, right.children, anchors);
	}
}

/**
 * Compute heading anchors: pairs of (leftLine, rightLine) where the same
 * heading appears in both documents, matched hierarchically by text. Each side
 * is read with its own syntax, so a Markdown note can be matched to a LaTeX file.
 * The returned list is sorted ascending by leftLine.
 */
export function computeHeadingAnchors(
	leftDocText: string,
	rightDocText: string,
	leftSyntax: HeadingSyntax = "markdown",
	rightSyntax: HeadingSyntax = "markdown",
): HeadingAnchor[] {
	const leftTree = buildSectionTree(extractHeadings(leftDocText, leftSyntax));
	const rightTree = buildSectionTree(extractHeadings(rightDocText, rightSyntax));

	const anchors: HeadingAnchor[] = [];
	matchSectionsRecursive(leftTree, rightTree, anchors);
	anchors.sort((a, b) => a.leftLine - b.leftLine);
	return anchors;
}

/**
 * Map a source line number to a destination line number using a piecewise
 * linear interpolation defined by the heading anchors.
 *
 * Implicit boundary anchors are added at line 0 on both sides and at
 * (srcTotal + 1, dstTotal + 1), so content between the document start and the
 * first heading, between headings, and after the last heading is spread
 * proportionally — without inserting any blank lines into the documents.
 */
export function mapLineWithAnchors(
	srcLine: number,
	anchors: HeadingAnchor[],
	srcTotal: number,
	dstTotal: number,
	leftToRight: boolean,
): number {
	const points: Array<{ src: number; dst: number }> = [
		{ src: 0, dst: 0 },
		...anchors.map((a) =>
			leftToRight
				? { src: a.leftLine, dst: a.rightLine }
				: { src: a.rightLine, dst: a.leftLine },
		),
		{ src: srcTotal + 1, dst: dstTotal + 1 },
	];

	// When mapping right-to-left the anchors (sorted by leftLine) may not be
	// sorted by rightLine, so re-sort by src to guarantee a monotone sequence.
	if (!leftToRight) {
		points.sort((a, b) => a.src - b.src);
	}

	for (let i = 0; i < points.length - 1; i++) {
		const lo = points[i]!;
		const hi = points[i + 1]!;
		if (lo.src <= srcLine && srcLine <= hi.src) {
			const span = hi.src - lo.src;
			if (span === 0) return Math.max(1, Math.min(Math.round(lo.dst), dstTotal));
			const t = (srcLine - lo.src) / span;
			return Math.max(1, Math.min(Math.round(lo.dst + t * (hi.dst - lo.dst)), dstTotal));
		}
	}

	// Fallback: clamp to destination bounds
	return Math.max(1, Math.min(srcLine, dstTotal));
}
