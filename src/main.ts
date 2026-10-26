import { EditorView, type ViewUpdate } from "@codemirror/view";
import { Notice, Platform, Plugin, TFile, debounce, setIcon } from "obsidian";
import { MarkdownCompareDiffView, type DiffHunk, type DiffState } from "./ui/DiffView";
import { MARKDOWNCOMPARE_DIFF_VIEW_TYPE } from "./ui/constants";
import { registerMarkdownCompareCommands } from "./commands/registerCommands";
import { registerMarkdownCompareMenus } from "./commands/registerMenus";
import { diffHighlightExtension } from "./editor/diffHighlight";
import { headingSyntaxFor } from "./headings/headings";
import { copyDifferenceHandlers } from "./compare/copyDifference";
import {
	checkComparison,
	compareNotes,
	endComparison,
	refreshComparison,
	type ComparePair,
} from "./compare/comparison";
import {
	scrollBothEditorsToLines,
	startScrollSync,
	type CompareTargets,
} from "./scroll/scrollSync";
import {
	clearJumpLineHighlights,
	setJumpLineHighlights,
} from "./editor/diffHighlight";

export default class MarkdownComparePlugin extends Plugin {
	private liveCompare = false;
	private comparePair: ComparePair | null = null;
	private statusBarToggleEl: HTMLElement | null = null;
	private diffState: DiffState | null = null;
	private diffStateListeners = new Set<(state: DiffState | null) => void>();
	private compareTargets: CompareTargets | null = null;
	private stopScrollSync: (() => void) | null = null;
	private clearJumpTimeoutId: number | null = null;
	private readonly scheduleRefresh = debounce(() => refreshComparison(this), 300, true);

	async onload() {
		this.registerView(MARKDOWNCOMPARE_DIFF_VIEW_TYPE, (leaf) => {
			return new MarkdownCompareDiffView(leaf, this);
		});

		this.registerEditorExtension([
			diffHighlightExtension,
			copyDifferenceHandlers(this),
			EditorView.updateListener.of((update) => this.onEditorUpdate(update)),
		]);
		registerMarkdownCompareCommands(this);
		registerMarkdownCompareMenus(this);

		if (!Platform.isMobile) {
			this.statusBarToggleEl = this.addStatusBarItem();
			this.statusBarToggleEl.addClass("markdowncompare-status-toggle");
			this.statusBarToggleEl.setAttr("role", "button");
			this.statusBarToggleEl.setAttr("tabindex", "0");
			setIcon(this.statusBarToggleEl, "scale");

			const onActivate = () => this.toggleLiveCompare();
			this.registerDomEvent(this.statusBarToggleEl, "click", onActivate);
			this.registerDomEvent(this.statusBarToggleEl, "keydown", (evt: KeyboardEvent) => {
				if (evt.key !== "Enter" && evt.key !== " ") return;
				evt.preventDefault();
				onActivate();
			});

			this.updateStatusBar();
		}

		this.registerEvent(this.app.workspace.on("layout-change", () => checkComparison(this)));
		this.registerEvent(this.app.workspace.on("file-open", () => checkComparison(this)));
	}

	/**
	 * Refresh after edits to either note of the comparison: every edit with live updates on,
	 * else only undo and redo, so undoing a copied difference brings its highlights back.
	 */
	private onEditorUpdate(update: ViewUpdate) {
		const targets = this.compareTargets;
		if (!update.docChanged || !targets) return;
		if (update.view !== targets.leftEditorView && update.view !== targets.rightEditorView) return;
		const undoOrRedo = update.transactions.some(
			(tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"),
		);
		if (this.liveCompare || undoOrRedo) this.scheduleRefresh();
	}

	onunload() {
		this.scheduleRefresh.cancel();
		endComparison(this);
		this.stopScrollSync?.();
		this.stopScrollSync = null;
		if (this.clearJumpTimeoutId != null) window.clearTimeout(this.clearJumpTimeoutId);
		this.clearJumpTimeoutId = null;
	}

	/** Live updates refresh the highlights while you edit either note of the comparison. */
	toggleLiveCompare() {
		if (this.liveCompare) {
			this.stopComparing();
			new Notice("Live updates off.");
			return;
		}

		this.liveCompare = true;
		this.updateStatusBar();
		new Notice("Live updates on.");
		if (this.comparePair) refreshComparison(this);
		else compareNotes(this);
	}

	stopComparing() {
		this.liveCompare = false;
		this.scheduleRefresh.cancel();
		this.updateStatusBar();
		endComparison(this);
	}

	private updateStatusBar() {
		if (!this.statusBarToggleEl) return;
		const on = this.liveCompare;
		this.statusBarToggleEl.toggleClass("is-active", on);
		this.statusBarToggleEl.setAttr(
			"aria-label",
			on ? "Live updates on" : "Live updates off",
		);
		this.statusBarToggleEl.setAttr(
			"title",
			on ? "Live updates on" : "Live updates off",
		);
	}

	getComparePair() {
		return this.comparePair;
	}

	setComparePair(pair: ComparePair | null) {
		this.comparePair = pair;
	}

	getDiffState() {
		return this.diffState;
	}

	setDiffState(state: DiffState | null) {
		this.diffState = state;
		for (const listener of this.diffStateListeners) listener(state);
	}

	onDiffStateChange(listener: (state: DiffState | null) => void) {
		this.diffStateListeners.add(listener);
		return () => {
			this.diffStateListeners.delete(listener);
		};
	}

	getCompareTargets() {
		return this.compareTargets;
	}

	setCompareTargets(targets: CompareTargets | null) {
		if (!targets && !this.compareTargets) return;

		if (
			targets &&
			this.compareTargets &&
			targets.leftEditorView === this.compareTargets.leftEditorView &&
			targets.rightEditorView === this.compareTargets.rightEditorView
		) {
			this.compareTargets = targets;
			return;
		}

		this.compareTargets = targets;
		this.stopScrollSync?.();
		this.stopScrollSync = null;

		if (!targets) return;
		this.stopScrollSync = startScrollSync(
			targets.leftEditorView,
			targets.rightEditorView,
			headingSyntaxFor(targets.leftPath),
			headingSyntaxFor(targets.rightPath),
		);
	}

	scrollToDiffHunk(hunk: DiffHunk) {
		if (!this.compareTargets) return;
		const leftLine = hunk.leftLine ?? hunk.leftStart;
		const rightLine = hunk.rightLine ?? hunk.rightStart;
		scrollBothEditorsToLines(
			this.compareTargets.leftEditorView,
			this.compareTargets.rightEditorView,
			leftLine,
			rightLine,
		);
		this.flashLines(leftLine, rightLine);
	}

	/** Flash a line in each note of the comparison (1-based line numbers). */
	flashLines(leftLine: number, rightLine: number) {
		if (!this.compareTargets) return;

		if (this.clearJumpTimeoutId != null) window.clearTimeout(this.clearJumpTimeoutId);
		this.clearJumpTimeoutId = null;

		setJumpLineHighlights(this.compareTargets.leftEditorView, [leftLine]);
		setJumpLineHighlights(this.compareTargets.rightEditorView, [rightLine]);

		this.clearJumpTimeoutId = window.setTimeout(() => {
			if (!this.compareTargets) return;
			clearJumpLineHighlights(this.compareTargets.leftEditorView);
			clearJumpLineHighlights(this.compareTargets.rightEditorView);
			this.clearJumpTimeoutId = null;
		}, 500);
	}

	async ensureDiffView() {
		await this.app.workspace.ensureSideLeaf(MARKDOWNCOMPARE_DIFF_VIEW_TYPE, "right", {
			active: false,
			reveal: true,
			split: false,
		});
	}

	revealFileInFileExplorer(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			new Notice("File not found in vault.");
			return;
		}

		type RevealInFolderTarget = {
			revealInFolder?: (target: TFile, open?: boolean) => void;
		};

		const candidates: RevealInFolderTarget[] = [];
		const addCandidate = (candidate: unknown) => {
			if (candidate && typeof candidate === "object") {
				candidates.push(candidate);
			}
		};

		try {
			const leaves = this.app.workspace.getLeavesOfType("file-explorer");
			for (const leaf of leaves) addCandidate(leaf.view);
		} catch {
			// ignore
		}

		type InternalPluginInstance = RevealInFolderTarget & {
			view?: unknown;
			fileExplorerView?: unknown;
			views?: { fileExplorer?: unknown };
		};
		type InternalPlugins = {
			getPluginById?: (id: string) => { instance?: unknown } | undefined;
		};

		const internalPlugins = (
			this.app as typeof this.app & {
				internalPlugins?: InternalPlugins;
			}
		).internalPlugins;
		const internal = internalPlugins?.getPluginById?.("file-explorer");
		const instance = internal?.instance as InternalPluginInstance | undefined;
		if (instance) {
			addCandidate(instance.view);
			addCandidate(instance.fileExplorerView);
			addCandidate(instance);
			addCandidate(instance.views?.fileExplorer);
		}

		for (const view of candidates) {
			if (!view) continue;
			const reveal = view.revealInFolder;
			if (typeof reveal !== "function") continue;

			try {
				reveal.call(view, file);
				return;
			} catch {
				try {
					reveal.call(view, file, true);
					return;
				} catch {
					// ignore
				}
			}
		}

		void this.app.workspace.getLeaf(false).openFile(file);
	}
}
