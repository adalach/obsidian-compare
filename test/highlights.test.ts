import { describe, expect, it } from "vitest";
import { computeHighlights } from "../src/diff/highlights";

describe("computeHighlights", () => {
	it("finds nothing in identical notes", () => {
		const text = "# Title\n\nSame text.\n";
		const { left, right, hunks } = computeHighlights(text, text);
		expect(hunks).toEqual([]);
		expect(left.lines).toEqual([]);
		expect(right.lines).toEqual([]);
	});

	it("marks a changed line and the changed characters", () => {
		const { left, right, hunks } = computeHighlights("# A\nThe cat sat.\n", "# A\nThe dog sat.\n");
		expect(hunks).toHaveLength(1);
		expect(hunks[0]).toMatchObject({ kind: "changed", leftLine: 2, rightLine: 2, leftHeader: "# A" });
		expect(left.lines).toEqual([{ line: 2, className: "markdowncompare-diff-changed" }]);
		expect(right.lines).toEqual([{ line: 2, className: "markdowncompare-diff-changed" }]);

		const removed = left.marks.map(({ from, to }) => "The cat sat.".slice(from, to)).join("");
		const added = right.marks.map(({ from, to }) => "The dog sat.".slice(from, to)).join("");
		expect(removed).toBe("cat");
		expect(added).toBe("dog");
	});

	it("marks added and removed lines on their own side", () => {
		const { left, right, hunks } = computeHighlights("one\ntwo\nthree", "one\nthree\nfour");
		expect(hunks.map((hunk) => hunk.kind)).toEqual(["removed", "added"]);
		expect(left.lines).toEqual([{ line: 2, className: "markdowncompare-diff-removed" }]);
		expect(right.lines).toEqual([{ line: 3, className: "markdowncompare-diff-added" }]);
	});

	it("keeps differences inside the section they belong to", () => {
		const leftText = "# A\nalpha\n# B\nbeta";
		const rightText = "# A\nbeta\n# B\nalpha";
		const { hunks } = computeHighlights(leftText, rightText);
		expect(hunks.map((hunk) => [hunk.kind, hunk.leftHeader, hunk.rightHeader])).toEqual([
			["changed", "# A", "# A"],
			["changed", "# B", "# B"],
		]);
	});
});
