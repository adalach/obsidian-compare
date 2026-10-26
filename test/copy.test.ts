import { describe, expect, it } from "vitest";
import { copyBlockEdit, type TextEdit } from "../src/diff/copy";
import { computeHighlights } from "../src/diff/highlights";
import type { DiffHunk } from "../src/ui/DiffView";

function applyEdit(text: string, edit: TextEdit) {
	const lines = text.split("\n");
	const offset = (pos: TextEdit["from"]) =>
		lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
	return text.slice(0, offset(edit.from)) + edit.text + text.slice(offset(edit.to));
}

/** Copy one difference from one side to the other, as the plugin does. */
function copyHunk(left: string, right: string, hunk: DiffHunk, from: "left" | "right") {
	const leftBlock = { start: hunk.leftStart, count: hunk.leftCount };
	const rightBlock = { start: hunk.rightStart, count: hunk.rightCount };
	return from === "left"
		? { left, right: applyEdit(right, copyBlockEdit(left, right, leftBlock, rightBlock)) }
		: { left: applyEdit(left, copyBlockEdit(right, left, rightBlock, leftBlock)), right };
}

const pairs: Array<[string, string]> = [
	["one\ntwo\nthree", "one\nTWO\nthree"],
	["one\ntwo\nthree", "one\nthree"],
	["one\nthree", "one\ntwo\nthree"],
	["first\nsame", "same"],
	["same", "same\nlast"],
	["same\nlast", "same"],
	["only left", ""],
	["a\nb\nc\n", "a\nx\ny\nz\nc\n"],
	["# A\nalpha\n# B\nbeta\nend", "# A\nbeta\n# B\nalpha\nmore\nend"],
	[
		"# T\n\nIntro text here.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nAliquam lorem ipsum dolor sit amet ut nisi.\n\n- x",
		"# T\n\nIntro text here.\n\nAliquam lorem ipsum dolor sit amet urttt nisi.\n\n- x\n- y",
	],
];

describe("copying differences", () => {
	for (const from of ["left", "right"] as const) {
		it(`makes both sides equal when every difference is copied from the ${from}`, () => {
			for (const [startLeft, startRight] of pairs) {
				let left = startLeft;
				let right = startRight;
				for (let step = 0; step < 20; step++) {
					const [hunk] = computeHighlights(left, right).hunks;
					if (!hunk) break;
					({ left, right } = copyHunk(left, right, hunk, from));
				}
				expect(from === "left" ? right : left).toBe(from === "left" ? startLeft : startRight);
				expect(computeHighlights(left, right).hunks).toEqual([]);
			}
		});
	}

	it("copies only the difference it is given", () => {
		const left = "a\nB\nc\nD\ne";
		const right = "a\nb\nc\nd\ne";
		const [first] = computeHighlights(left, right).hunks;
		expect(first).toMatchObject({ kind: "changed", leftStart: 2, rightStart: 2 });
		expect(copyHunk(left, right, first!, "left").right).toBe("a\nB\nc\nd\ne");
	});

	it("copies an added table in front of the paragraph it came before", () => {
		const left = "Intro.\n\n| a | b |\n| - | - |\n\nSame paragraph with words.";
		const right = "Intro.\n\nSame paragraph with words.";
		const [table] = computeHighlights(left, right).hunks;
		expect(table).toMatchObject({ kind: "removed", leftCount: 3, rightCount: 0 });
		expect(copyHunk(left, right, table!, "left").right).toBe(left);
	});

	it("puts lines missing on one side where they belong", () => {
		const left = "a\nnew\nb";
		const right = "a\nb";
		const [hunk] = computeHighlights(left, right).hunks;
		expect(hunk).toMatchObject({ kind: "removed", leftStart: 2, rightStart: 2, rightCount: 0 });
		expect(copyHunk(left, right, hunk!, "left").right).toBe("a\nnew\nb");
		expect(copyHunk(left, right, hunk!, "right").left).toBe("a\nb");
	});
});
