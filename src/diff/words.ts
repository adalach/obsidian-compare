import { diffMyers } from "./myersDiff";

/** One change between two versions of a line, as character ranges [from, to) on each side. */
export interface WordChange {
	leftFrom: number;
	leftTo: number;
	rightFrom: number;
	rightTo: number;
}

interface Token {
	text: string;
	from: number;
	to: number;
}

// Words, runs of spaces, and single other characters (punctuation, Markdown marks).
const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

function tokenize(line: string): Token[] {
	return Array.from(line.matchAll(TOKEN), (match) => ({
		text: match[0],
		from: match.index ?? 0,
		to: (match.index ?? 0) + match[0].length,
	}));
}

/**
 * The changes between two versions of a line, by whole words: a changed word is marked as a
 * whole, and changes separated only by spaces count as one change. Each change can be copied
 * on its own.
 */
export function wordChanges(left: string, right: string): WordChange[] {
	const a = tokenize(left);
	const b = tokenize(right);
	const edits = diffMyers(a, b, (x, y) => x.text === y.text);

	// Runs of unequal tokens, as token index ranges on each side.
	const runs: Array<{ a0: number; a1: number; b0: number; b1: number }> = [];
	let i = 0;
	let j = 0;
	for (const edit of edits) {
		if (edit.type === "equal") {
			i++;
			j++;
			continue;
		}
		const last = runs[runs.length - 1];
		const open = last && last.a1 === i && last.b1 === j;
		const run = open ? last : { a0: i, a1: i, b0: j, b1: j };
		if (!open) runs.push(run);
		if (edit.type === "delete") run.a1 = ++i;
		else run.b1 = ++j;
	}

	// Join runs with only spaces between them.
	const merged: typeof runs = [];
	for (const run of runs) {
		const previous = merged[merged.length - 1];
		const between = previous ? a.slice(previous.a1, run.a0) : [];
		if (previous && between.every((token) => /^\s+$/.test(token.text))) {
			previous.a1 = run.a1;
			previous.b1 = run.b1;
		} else {
			merged.push({ ...run });
		}
	}

	const offset = (tokens: Token[], index: number, text: string) => tokens[index]?.from ?? text.length;
	return merged.map(({ a0, a1, b0, b1 }) => ({
		leftFrom: offset(a, a0, left),
		leftTo: a1 > a0 ? (a[a1 - 1]?.to ?? left.length) : offset(a, a0, left),
		rightFrom: offset(b, b0, right),
		rightTo: b1 > b0 ? (b[b1 - 1]?.to ?? right.length) : offset(b, b0, right),
	}));
}
