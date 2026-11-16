import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { startScrollSync } from "../src/scroll/scrollSync";

class Scroller extends EventTarget {
	scrollTop = 0;
	scrollHeight = 2000;
	clientHeight = 500;

	constructor(readonly ownerDocument: { defaultView: object }) {
		super();
	}

	getBoundingClientRect() {
		return { top: 0 };
	}

	scrollTo(top: number) {
		this.scrollTop = top;
		this.dispatchEvent(new Event("scroll"));
	}
}

function setup() {
	const frames: FrameRequestCallback[] = [];
	const win = {
		requestAnimationFrame(callback: FrameRequestCallback) {
			return frames.push(callback);
		},
		cancelAnimationFrame: vi.fn(),
	};

	function editor() {
		const scrollDOM = new Scroller({ defaultView: win });
		const state = EditorState.create({ doc: "# Section\nParagraph\nNext paragraph" });
		const view = {
			scrollDOM,
			state,
			get documentTop() { return -scrollDOM.scrollTop; },
			lineBlockAtHeight: () => ({ from: state.doc.line(2).from }),
			lineBlockAt: () => ({ top: 100 }),
		} as unknown as EditorView;
		return { scrollDOM, view };
	}

	return {
		left: editor(),
		right: editor(),
		render: () => frames.splice(0).forEach((frame) => frame(0)),
	};
}

describe("scroll synchronization", () => {
	it("keeps the source steady when the follower remeasures a wrapped paragraph", () => {
		const { left, right, render } = setup();
		const stop = startScrollSync(left.view, right.view, "markdown", "markdown", true);

		left.scrollDOM.scrollTo(400);
		render();
		expect(right.scrollDOM.scrollTop).toBe(400);

		// CodeMirror can move the follower's own scroll anchor while it measures the paragraph.
		right.scrollDOM.scrollTo(490);
		render();
		expect(left.scrollDOM.scrollTop).toBe(400);
		expect(right.scrollDOM.scrollTop).toBe(400);

		right.scrollDOM.dispatchEvent(new Event("wheel"));
		right.scrollDOM.scrollTo(450);
		render();
		expect(left.scrollDOM.scrollTop).toBe(450);
		stop();
	});

	it("ignores the follower's delayed scroll event when syncing by headings", () => {
		const { left, right, render } = setup();
		const stop = startScrollSync(left.view, right.view, "markdown", "markdown");

		left.scrollDOM.scrollTo(140);
		render();
		expect(right.scrollDOM.scrollTop).toBe(100);

		right.scrollDOM.dispatchEvent(new Event("scroll"));
		render();
		expect(left.scrollDOM.scrollTop).toBe(140);
		stop();
	});
});
