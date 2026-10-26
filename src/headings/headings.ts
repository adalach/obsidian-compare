import { formatLatexHeader, parseLatexSection, verbatimEnvTransition } from "./latex";

/** How a file marks its sections: Markdown `#` headings, LaTeX `\section{…}` commands, or not at all. */
export type HeadingSyntax = "markdown" | "latex" | "none";

export function headingSyntaxFor(path: string): HeadingSyntax {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	if (extension === "md") return "markdown";
	if (extension === "tex") return "latex";
	return "none";
}

export interface Heading {
	level: number;
	text: string;
	/** 1-based line number. */
	line: number;
	/** The heading as shown in the differences list, such as `## Methods` or `\section{Methods}`. */
	label: string;
}

export function extractHeadings(docText: string, syntax: HeadingSyntax): Heading[] {
	if (syntax === "markdown") return extractMarkdownHeadings(docText);
	if (syntax === "latex") return extractLatexHeadings(docText);
	return [];
}

/** The label of the last heading at or above `line`, or null above the first heading. */
export function headingLabelAt(headings: Heading[], line: number): string | null {
	let label: string | null = null;
	for (const heading of headings) {
		if (heading.line > line) break;
		label = heading.label;
	}
	return label;
}

/** Markdown `#` headings, skipping headings inside fenced code blocks. */
function extractMarkdownHeadings(docText: string): Heading[] {
	const headings: Heading[] = [];
	const lines = docText.split("\n");
	let fenceChar: string | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const trimmed = line.trimStart();

		if (fenceChar === null) {
			if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
				fenceChar = trimmed[0] ?? null;
				continue;
			}
			const m = line.match(/^(#{1,6})\s+(.+)/);
			if (m) {
				const text = m[2]!.trim();
				headings.push({ level: m[1]!.length, text, line: i + 1, label: `${m[1]!} ${text}` });
			}
		} else {
			// Close the fence only when we see 3+ of the same fence character at line start
			if (trimmed.startsWith(fenceChar.repeat(3))) {
				fenceChar = null;
			}
		}
	}

	return headings;
}

/**
 * LaTeX sectioning commands (`\part` … `\subparagraph`), skipping any inside
 * verbatim-like environments (verbatim, lstlisting, minted, …) and comments.
 */
function extractLatexHeadings(docText: string): Heading[] {
	const headings: Heading[] = [];
	const lines = docText.split("\n");
	let verbatimEnv: string | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";

		const transition = verbatimEnvTransition(line, verbatimEnv);
		if (verbatimEnv !== null) {
			if (transition && "exit" in transition) verbatimEnv = null;
			continue;
		}
		if (transition && "enter" in transition) {
			verbatimEnv = transition.enter;
			continue;
		}

		const section = parseLatexSection(line);
		if (section) {
			headings.push({
				level: section.level,
				text: section.title,
				line: i + 1,
				label: formatLatexHeader(section),
			});
		}
	}

	return headings;
}
