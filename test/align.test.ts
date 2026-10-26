import { describe, expect, it } from "vitest";
import { computeHighlights } from "../src/diff/highlights";

const P1 =
	"Quisque scelerisque augue non feugiat luctus. Nulla vitae nulla ac elit euismod sagittis. Phasellus nunec mauris, ultrices ornare dapibus sit amet, iaculis id nisl.";
const P2 =
	"Aliquam scelerisque lectus id ipsum suscipit fringilla. Curabitur sem urna, congue nec tortor ut, ornare semper orci. Ut ultrices nisi ut hendrerit rhoncus. Proin velit dolor, aliquam quis arcu molestie, luctus maximus nulla.";
const P2_EDITED = P2.replace("nisi ut hendrerit", "nisi urttt hendrerit");
const P3 =
	"Pellentesque ipsum eros, egestas eget congue quis, imperdiet a ligula. Donec feugiat maximus augue in placerat.";
const TABLE = [
	"| Week | Milestone | Owner | Status |",
	"| ---: | --- | --- | --- |",
	"| 1 | Kick-off meeting | Anna | Done |",
	"| 2 | Requirements draft | Ben | Done |",
	"| 3 | First prototype | Clara | Done |",
	"| 4 | User interviews | Anna | In progress |",
	"| 5 | Design review | David | Planned |",
];
const LIST = ["- In convallis nulla at nisi blandit.", "- Cras ac dolor lobortis, finibus nisi quis."];

const note = (...blocks: string[][]) => blocks.map((block) => block.join("\n")).join("\n\n");

describe("pairing similar lines", () => {
	it("finds an edited paragraph again after a table was added before it", () => {
		const left = note(["# Title sth"], [P1], TABLE, [P2], LIST, [P3]);
		const right = note(["# Title sth"], [P1], [P2_EDITED], LIST, [P3]);
		const { left: leftSpec, right: rightSpec, hunks } = computeHighlights(left, right);

		expect(hunks.map((hunk) => [hunk.kind, hunk.leftCount, hunk.rightCount])).toEqual([
			["removed", TABLE.length + 1, 0],
			["changed", 1, 1],
		]);

		const p2Line = left.split("\n").indexOf(P2) + 1;
		const p2EditedLine = right.split("\n").indexOf(P2_EDITED) + 1;
		expect(hunks[1]).toMatchObject({ leftStart: p2Line, rightStart: p2EditedLine });
		expect(leftSpec.lines).toContainEqual({ line: p2Line, className: "markdowncompare-diff-changed" });
		// Only the edited word is marked, not the whole paragraph.
		const marked = rightSpec.marks.map(({ from, to }) => P2_EDITED.slice(from, to)).join("");
		expect(marked.length).toBeLessThan(6);
	});

	it("keeps a one-line replacement as one changed line", () => {
		const { hunks, left } = computeHighlights("a\nDone\nb", "a\nPlanned\nb");
		expect(hunks.map((hunk) => hunk.kind)).toEqual(["changed"]);
		expect(left.lines).toEqual([{ line: 2, className: "markdowncompare-diff-changed" }]);
	});

	it("shows unrelated replaced lines as removed and added, in one difference", () => {
		const { hunks, left, right } = computeHighlights(
			"keep\nfirst old line\nsecond old line\nkeep too",
			"keep\nbrand new text here\nnothing in common\nkeep too",
		);
		expect(hunks.map((hunk) => [hunk.kind, hunk.leftCount, hunk.rightCount])).toEqual([["changed", 2, 2]]);
		expect(left.lines.map((line) => line.className)).toEqual([
			"markdowncompare-diff-removed",
			"markdowncompare-diff-removed",
		]);
		expect(right.lines.map((line) => line.className)).toEqual([
			"markdowncompare-diff-added",
			"markdowncompare-diff-added",
		]);
	});

	it("stays within sections and handles long notes", () => {
		const many = (prefix: string) =>
			Array.from({ length: 700 }, (_, i) => `${prefix} line number ${i} with some words`);
		const { hunks } = computeHighlights(many("left").join("\n"), many("right").join("\n"));
		expect(hunks.length).toBeGreaterThan(0);
	});
});
