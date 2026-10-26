import { describe, expect, it } from "vitest";
import { planGaps } from "../src/compare/alignment";

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
