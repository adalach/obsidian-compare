import { describe, expect, it } from "vitest";
import { copyChangeEdit } from "../src/diff/copy";
import { wordChanges, type WordChange } from "../src/diff/words";

const show = (left: string, right: string) =>
	wordChanges(left, right).map((c) => [left.slice(c.leftFrom, c.leftTo), right.slice(c.rightFrom, c.rightTo)]);

function copyChange(left: string, right: string, change: WordChange, from: "left" | "right") {
	const { fromCh, toCh, text } = copyChangeEdit(left, right, change, from);
	return from === "left"
		? { left, right: right.slice(0, fromCh) + text + right.slice(toCh) }
		: { left: left.slice(0, fromCh) + text + left.slice(toCh), right };
}

describe("wordChanges", () => {
	it("marks whole words", () => {
		expect(show("nisi ut hendrerit", "nisi urttt hendrerit")).toEqual([["ut", "urttt"]]);
	});

	it("keeps separate changes apart and joins words next to each other", () => {
		expect(show("We ran three tests on Monday.", "We ran four tests on Friday.")).toEqual([
			["three", "four"],
			["Monday", "Friday"],
		]);
		expect(show("three red tests", "four blue tests")).toEqual([["three red", "four blue"]]);
	});

	it("marks added words on one side only", () => {
		const [change] = wordChanges("a b", "a new b");
		expect(change!.leftTo - change!.leftFrom).toBe(0);
		expect("a new b".slice(change!.rightFrom, change!.rightTo).trim()).toBe("new");
	});
});

describe("copying single changes", () => {
	it("keeps one change from each side", () => {
		let left = "We ran three tests on Monday.";
		let right = "We ran four tests on Friday.";
		const [first] = wordChanges(left, right);
		({ left, right } = copyChange(left, right, first!, "left"));
		expect(right).toBe("We ran three tests on Friday.");
		const [second] = wordChanges(left, right);
		({ left, right } = copyChange(left, right, second!, "right"));
		expect(left).toBe("We ran three tests on Friday.");
		expect(wordChanges(left, right)).toEqual([]);
	});

	const pairs: Array<[string, string]> = [
		["a b", "a new b"],
		["a old b", "a b"],
		["Start here.", "Here we start."],
		["**Bold** words, and a [[link]].", "Bold words and a [[other link]]!"],
		["", "only right"],
	];
	for (const from of ["left", "right"] as const) {
		it(`makes lines equal when every change is copied from the ${from}`, () => {
			for (const [startLeft, startRight] of pairs) {
				let left = startLeft;
				let right = startRight;
				for (let step = 0; step < 20; step++) {
					const [change] = wordChanges(left, right);
					if (!change) break;
					({ left, right } = copyChange(left, right, change, from));
				}
				expect(left).toBe(right);
				expect(from === "left" ? left : right).toBe(from === "left" ? startLeft : startRight);
			}
		});
	}
});
