import { describe, expect, it } from "vitest";
import { computeHighlights } from "../src/diff/highlights";
import { extractHeadings, headingSyntaxFor } from "../src/headings/headings";
import { computeHeadingAnchors } from "../src/scroll/headingAnchors";

describe("headingSyntaxFor", () => {
	it("reads Markdown headings in .md, sections in .tex, and none elsewhere", () => {
		expect(headingSyntaxFor("Papers/Draft.md")).toBe("markdown");
		expect(headingSyntaxFor("paper/main.TEX")).toBe("latex");
		expect(headingSyntaxFor("scripts/run.py")).toBe("none");
		expect(headingSyntaxFor("README")).toBe("none");
	});
});

describe("LaTeX sections", () => {
	it("finds sectioning commands, but not in comments or verbatim environments", () => {
		const tex = [
			"\\section{Introduction}",
			"% \\section{Commented out}",
			"\\begin{verbatim}",
			"\\section{Inside verbatim}",
			"\\end{verbatim}",
			"\\subsection*[Short]{Related \\emph{work}}",
		].join("\n");
		expect(extractHeadings(tex, "latex").map(({ label, line }) => [label, line])).toEqual([
			["\\section{Introduction}", 1],
			["\\subsection{Related \\emph{work}}", 6],
		]);
	});

	it("labels differences with the section they are in", () => {
		const left = "\\section{Intro}\nOld sentence.\n\\section{Methods}\nWe ran three tests.";
		const right = "\\section{Intro}\nOld sentence.\n\\section{Methods}\nWe ran four tests.";
		const { hunks } = computeHighlights(left, right, "latex", "latex");
		expect(hunks).toHaveLength(1);
		expect(hunks[0]).toMatchObject({
			kind: "changed",
			leftHeader: "\\section{Methods}",
			rightHeader: "\\section{Methods}",
		});
	});

	it("matches a Markdown note's headings to a LaTeX file's sections by title", () => {
		const md = "# Intro\ntext\n# Methods\nmore";
		const tex = "\\section{Intro}\ntext\n\\section{Methods}\nmore";
		expect(computeHeadingAnchors(md, tex, "markdown", "latex")).toEqual([
			{ leftLine: 1, rightLine: 1 },
			{ leftLine: 3, rightLine: 3 },
		]);
	});

	it("treats # lines in other files as text, not headings", () => {
		expect(extractHeadings("# a comment\nx = 1", "none")).toEqual([]);
	});
});
