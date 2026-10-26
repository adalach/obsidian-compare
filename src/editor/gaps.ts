import { RangeSetBuilder, StateEffect, StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

/**
 * A blank block in the editor, so that matched lines of the two notes sit level. Side 1 puts it
 * after the line ending at `pos`, side -1 before the line starting at `pos` (only used at 0).
 */
export interface Gap {
	pos: number;
	side: 1 | -1;
	height: number;
}

/** Start positions of this note's matched lines, in the same order as in the other note. */
export const setGapAnchors = StateEffect.define<number[]>();
export const setGaps = StateEffect.define<Gap[]>();

export const gapAnchorsField = StateField.define<number[]>({
	create: () => [],
	update(anchors, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setGapAnchors)) return effect.value;
		}
		if (!tr.docChanged || anchors.length === 0) return anchors;
		return anchors.map((pos) => tr.changes.mapPos(pos, -1));
	},
});

// Block widgets change the editor's height, so they must come from a state field, as a set.
export const gapsField = StateField.define<{ gaps: Gap[]; decorations: DecorationSet }>({
	create: () => ({ gaps: [], decorations: Decoration.none }),
	update(value, tr) {
		let gaps = value.gaps;
		for (const effect of tr.effects) {
			if (effect.is(setGaps)) gaps = effect.value;
		}
		if (gaps === value.gaps) {
			if (!tr.docChanged || gaps.length === 0) return value;
			gaps = gaps.map((gap) => ({ ...gap, pos: tr.changes.mapPos(gap.pos, -gap.side) }));
		}
		return { gaps, decorations: buildGapDecorations(gaps, tr.state) };
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

export function getGaps(state: EditorState) {
	return state.field(gapsField, false)?.gaps ?? [];
}

class GapWidget extends WidgetType {
	constructor(readonly height: number) {
		super();
	}

	eq(other: GapWidget) {
		return Math.abs(other.height - this.height) < 0.5;
	}

	get estimatedHeight() {
		return this.height;
	}

	toDOM() {
		const el = createDiv({ cls: "markdowncompare-gap" });
		el.setCssProps({ "--markdowncompare-gap-height": `${this.height}px` });
		el.setAttr("aria-hidden", "true");
		return el;
	}

	ignoreEvent() {
		return true;
	}
}

function buildGapDecorations(gaps: Gap[], state: EditorState): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const placed = gaps
		.filter((gap) => gap.height >= 0.5 && gap.pos <= state.doc.length)
		.map((gap) => {
			// Keep the gap at a line boundary even after edits nearby.
			const line = state.doc.lineAt(gap.pos);
			return { ...gap, pos: gap.side === 1 ? line.to : line.from };
		})
		.sort((a, b) => a.pos - b.pos || a.side - b.side);
	for (const gap of placed) {
		builder.add(
			gap.pos,
			gap.pos,
			Decoration.widget({ widget: new GapWidget(gap.height), block: true, side: gap.side }),
		);
	}
	return builder.finish();
}

export const gapsExtension = [gapAnchorsField, gapsField];

export function clearGaps(view: EditorView) {
	if (getGaps(view.state).length || view.state.field(gapAnchorsField, false)?.length) {
		view.dispatch({ effects: [setGaps.of([]), setGapAnchors.of([])] });
	}
}
