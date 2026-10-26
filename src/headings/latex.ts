/**
 * LaTeX sectioning support.
 *
 * `.tex` files are matched by their sectioning commands — `\section{...}`,
 * `\subsection{...}`, `\subsubsection{...}`, etc. — the way Markdown notes are
 * matched by `#` headings. This module detects and formats those commands.
 */

export interface LatexSection {
	/** Bare command name, e.g. "section" or "subsubsection". */
	command: string;
	/** Hierarchy depth (lower = higher in the document tree). */
	level: number;
	/** The braced title text, e.g. "Introduction". */
	title: string;
}

/**
 * Standard LaTeX sectioning commands mapped to a hierarchy level. Only the
 * relative ordering matters for building the section tree.
 */
const SECTION_LEVELS: Record<string, number> = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5,
	subparagraph: 6,
};

// Longest command names first so alternation never stops early on a prefix.
const SECTION_COMMAND_RE =
	/\\(subparagraph|subsubsection|subsection|paragraph|section|chapter|part)\*?[ \t]*(\[[^\]]*\])?[ \t]*\{/;

/** Environments whose contents are verbatim and must not be scanned for sections. */
const VERBATIM_ENVS = new Set([
	"verbatim",
	"verbatim*",
	"Verbatim",
	"lstlisting",
	"minted",
	"comment",
]);

/**
 * Remove a trailing LaTeX line comment (an unescaped `%` to end of line).
 */
export function stripLatexComment(line: string): string {
	let result = "";
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (ch === "%" && (i === 0 || line[i - 1] !== "\\")) break;
		result += ch;
	}
	return result;
}

/**
 * Extract the contents of a `{...}` group starting at `openIndex`, respecting
 * nested braces (so `\section{A \textbf{B} C}` yields `A \textbf{B} C`). If the
 * group is not closed on the line, returns everything to end of line.
 */
function extractBracedTitle(line: string, openIndex: number): string | null {
	if (line[openIndex] !== "{") return null;
	let depth = 0;
	let result = "";
	for (let i = openIndex; i < line.length; i++) {
		const ch = line[i]!;
		if (ch === "{") {
			depth++;
			if (depth === 1) continue;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) return result;
		}
		result += ch;
	}
	return result;
}

/**
 * Parse a single line for a LaTeX sectioning command. Strips inline comments
 * first. Returns null when the line holds no sectioning command.
 */
export function parseLatexSection(rawLine: string): LatexSection | null {
	const line = stripLatexComment(rawLine);
	const m = line.match(SECTION_COMMAND_RE);
	if (!m || m.index == null) return null;

	const command = m[1]!;
	const level = SECTION_LEVELS[command];
	if (level === undefined) return null;

	const braceStart = m.index + m[0].length - 1;
	const title = extractBracedTitle(line, braceStart);
	if (title == null) return null;

	return { command, level, title: title.trim() };
}

/**
 * Format a section back into its canonical `\command{title}` form for display
 * in the differences list (like `## Heading` for Markdown).
 */
export function formatLatexHeader(section: LatexSection): string {
	return `\\${section.command}{${section.title}}`;
}

/**
 * Determine whether a line opens or closes a verbatim-like environment.
 * Returns the environment name to enter, "end" to close, or null.
 */
export function verbatimEnvTransition(
	line: string,
	current: string | null,
): { enter: string } | { exit: true } | null {
	if (current !== null) {
		const end = line.match(/\\end\{([^}]*)\}/);
		if (end && end[1] === current) return { exit: true };
		return null;
	}
	const begin = line.match(/\\begin\{([^}]*)\}/);
	if (begin && begin[1] != null && VERBATIM_ENVS.has(begin[1])) {
		return { enter: begin[1] };
	}
	return null;
}
