import type { WordChange } from "./words";

/** A block of lines on one side of a difference: 1-based first line and line count. */
export interface LineBlock {
	start: number;
	count: number;
}

/** A position like Obsidian's `EditorPosition`: 0-based line and character. */
export interface TextPosition {
	line: number;
	ch: number;
}

export interface TextEdit {
	from: TextPosition;
	to: TextPosition;
	text: string;
}

/**
 * The edit that turns `target`'s lines in `targetText` into `source`'s lines from `sourceText`.
 * An empty target block inserts the source lines where the block would go; an empty source
 * block deletes the target lines, together with one line break.
 */
export function copyBlockEdit(
	sourceText: string,
	targetText: string,
	source: LineBlock,
	target: LineBlock,
): TextEdit {
	const sourceLines = sourceText.split("\n").slice(source.start - 1, source.start - 1 + source.count);
	const targetLines = targetText.split("\n");
	const lastLine = targetLines.length - 1;
	const endOf = (line: number): TextPosition => ({ line, ch: targetLines[line]?.length ?? 0 });
	const first = target.start - 1;
	const last = first + target.count - 1;
	const text = sourceLines.join("\n");

	if (target.count === 0 && source.count === 0) {
		return { from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 }, text: "" };
	}
	if (target.count > 0 && source.count > 0) {
		return { from: { line: first, ch: 0 }, to: endOf(last), text };
	}

	if (target.count === 0) {
		if (first <= lastLine) {
			return { from: { line: first, ch: 0 }, to: { line: first, ch: 0 }, text: `${text}\n` };
		}
		return { from: endOf(lastLine), to: endOf(lastLine), text: `\n${text}` };
	}

	if (last < lastLine) {
		return { from: { line: first, ch: 0 }, to: { line: last + 1, ch: 0 }, text: "" };
	}
	if (first > 0) {
		return { from: endOf(first - 1), to: endOf(last), text: "" };
	}
	return { from: { line: 0, ch: 0 }, to: endOf(last), text: "" };
}

/** The edit within one line that copies a word change from the `from` side over the other side. */
export function copyChangeEdit(
	leftLine: string,
	rightLine: string,
	change: WordChange,
	from: "left" | "right",
) {
	return from === "left"
		? { fromCh: change.rightFrom, toCh: change.rightTo, text: leftLine.slice(change.leftFrom, change.leftTo) }
		: { fromCh: change.leftFrom, toCh: change.leftTo, text: rightLine.slice(change.rightFrom, change.rightTo) };
}
