import { describe, expect, it } from "vitest";
import { correctGaps, planGaps } from "../src/compare/alignment";

describe("planGaps", () => {
	it("adds nothing when matched lines already sit level", () => {
		expect(planGaps([0, 20, 40], [0, 20, 40])).toEqual([]);
	});

	it("puts a gap on the side whose line sits higher, once", () => {
		// A 100px table only on the left before the second matched line.
		expect(planGaps([0, 120, 140], [0, 20, 40])).toEqual([{ index: 1, side: "right", height: 100 }]);
	});

	it("balances additions on both sides", () => {
		// Left has 50px extra before line 1, right has 80px extra before line 2.
		expect(planGaps([0, 70, 90], [0, 20, 120])).toEqual([
			{ index: 1, side: "right", height: 50 },
			{ index: 2, side: "left", height: 80 },
		]);
	});
});

describe("correctGaps", () => {
	it("keeps the gaps when the lines on screen are level, so it settles", () => {
		expect(correctGaps([0, 0.3, -0.2], [60, 0, -30])).toEqual([60, 0, -30]);
	});

	it("grows a gap once and carries it to the lines below", () => {
		// The left line 1 sits 40px lower (an image grew above it); line 2 moved with it.
		expect(correctGaps([0, 40, 40], [0, 10, 0])).toEqual([0, 50, 0]);
	});

	it("shrinks or flips a gap when the other side grew", () => {
		expect(correctGaps([-25, -25], [10, 0])).toEqual([-15, 0]);
	});
});
