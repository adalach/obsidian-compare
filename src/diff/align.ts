/**
 * Line alignment by similarity, for the stretch between two lines that both notes share.
 *
 * The line diff only knows equal and unequal lines, so an edited paragraph after an inserted
 * table is just "different", and blank lines can match across it. This pairs lines in order so
 * that the total similarity is highest: identical lines first, then lines with at least half of
 * their words in common. Unpaired lines are only on one side.
 */

export type AlignOp =
	| { type: "equal" | "changed"; left: number; right: number }
	| { type: "delete"; left: number }
	| { type: "insert"; right: number };

/** Above this many cells the alignment is skipped (too slow to redo while typing). */
const MAX_CELLS = 250_000;
/** Share of words two lines need in common to count as the same line, edited. */
const MIN_SIMILARITY = 0.5;

const IDENTICAL_SCORE = 2;
const IDENTICAL_WEAK_SCORE = 0.25;

/** A line without letters or digits (blank, `---`, a code fence) says little about where it belongs. */
export function isWeakLine(line: string) {
	return !/[\p{L}\p{N}]/u.test(line);
}

function countWords(line: string) {
	const counts = new Map<string, number>();
	for (const word of line.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return counts;
}

function wordTotal(counts: Map<string, number>) {
	let total = 0;
	for (const count of counts.values()) total += count;
	return total;
}

/** Dice similarity of two lines' words: 1 for the same words, 0 for none in common. */
function similarity(a: Map<string, number>, aTotal: number, b: Map<string, number>, bTotal: number) {
	if (aTotal === 0 || bTotal === 0) return 0;
	const [small, large] = a.size <= b.size ? [a, b] : [b, a];
	let shared = 0;
	for (const [word, count] of small) shared += Math.min(count, large.get(word) ?? 0);
	return (2 * shared) / (aTotal + bTotal);
}

/** Align two runs of lines; null when they are too long to align while typing. */
export function alignLines(left: string[], right: string[]): AlignOp[] | null {
	const m = left.length;
	const n = right.length;
	const width = n + 1;
	if ((m + 1) * width > MAX_CELLS) return null;

	const leftWords = left.map(countWords);
	const rightWords = right.map(countWords);
	const leftTotals = leftWords.map(wordTotal);
	const rightTotals = rightWords.map(wordTotal);

	const score = (i: number, j: number) => {
		if (left[i] === right[j]) return isWeakLine(left[i]!) ? IDENTICAL_WEAK_SCORE : IDENTICAL_SCORE;
		const s = similarity(leftWords[i]!, leftTotals[i]!, rightWords[j]!, rightTotals[j]!);
		return s >= MIN_SIMILARITY ? s : 0;
	};

	// best[i][j]: highest total score aligning left[0..i) with right[0..j).
	const DELETE = 1;
	const INSERT = 2;
	const PAIR = 3;
	const best = new Float64Array((m + 1) * width);
	const step = new Uint8Array((m + 1) * width);
	for (let i = 1; i <= m; i++) step[i * width] = DELETE;
	for (let j = 1; j <= n; j++) step[j] = INSERT;

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			let value = best[(i - 1) * width + j]!;
			let move = DELETE;
			const insertValue = best[i * width + j - 1]!;
			if (insertValue > value) {
				value = insertValue;
				move = INSERT;
			}
			const pairScore = score(i - 1, j - 1);
			if (pairScore > 0) {
				const pairValue = best[(i - 1) * width + j - 1]! + pairScore;
				if (pairValue > value) {
					value = pairValue;
					move = PAIR;
				}
			}
			best[i * width + j] = value;
			step[i * width + j] = move;
		}
	}

	const ops: AlignOp[] = [];
	let i = m;
	let j = n;
	while (i > 0 || j > 0) {
		const move = step[i * width + j];
		if (move === PAIR) {
			i--;
			j--;
			ops.push({ type: left[i] === right[j] ? "equal" : "changed", left: i, right: j });
		} else if (move === DELETE) {
			i--;
			ops.push({ type: "delete", left: i });
		} else {
			j--;
			ops.push({ type: "insert", right: j });
		}
	}
	return ops.reverse();
}
