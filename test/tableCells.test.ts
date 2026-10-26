import { describe, expect, it } from "vitest";
import { cellAt, tableCells } from "../src/editor/tableCells";

const texts = (line: string) => tableCells(line).map(({ from, to }) => line.slice(from, to));

describe("tableCells", () => {
	it("splits a row at its pipes", () => {
		expect(texts("| Alpha | 12.40 | 10.0 | 1.24 |")).toEqual(["Alpha", "12.40", "10.0", "1.24"]);
	});

	it("handles rows without outer pipes, escaped pipes and empty cells", () => {
		expect(texts("Alpha | 12.40")).toEqual(["Alpha", "12.40"]);
		expect(texts("| a \\| b | |")).toEqual(["a \\| b", ""]);
	});

	it("finds the cell of a character", () => {
		const line = "| Alpha | 12.40 | 10.0 |";
		expect(cellAt(tableCells(line), line.indexOf("10.0"))).toBe(2);
	});
});
