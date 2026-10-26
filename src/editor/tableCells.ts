/**
 * The cells of a Markdown table row, as character ranges of their trimmed text in the line.
 * Cells are split at unescaped pipes; the leading and trailing pipes are optional.
 */
export function tableCells(line: string): Array<{ from: number; to: number }> {
	const pipes: number[] = [];
	for (let i = 0; i < line.length; i++) {
		if (line[i] === "|" && line[i - 1] !== "\\") pipes.push(i);
	}
	const start = line.length - line.trimStart().length;
	const end = line.trimEnd().length;
	const bounds = [...pipes];
	if (pipes[0] !== start) bounds.unshift(start - 1);
	if (pipes[pipes.length - 1] !== end - 1) bounds.push(end);

	const cells: Array<{ from: number; to: number }> = [];
	for (let k = 0; k + 1 < bounds.length; k++) {
		let from = bounds[k]! + 1;
		let to = bounds[k + 1]!;
		while (from < to && /\s/.test(line[from]!)) from++;
		while (to > from && /\s/.test(line[to - 1]!)) to--;
		cells.push({ from, to });
	}
	return cells;
}

/** Index of the cell holding character `ch`, or -1. */
export function cellAt(cells: Array<{ from: number; to: number }>, ch: number) {
	return cells.findIndex(({ from, to }) => ch >= from && ch <= to);
}
