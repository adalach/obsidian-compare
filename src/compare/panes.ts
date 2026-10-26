import {
	MarkdownView,
	TFile,
	WorkspaceSidedock,
	type App,
	type TAbstractFile,
	type WorkspaceLeaf,
} from "obsidian";

type ViewRegistry = { getTypeByExtension?: (extension: string) => string | undefined };

/**
 * Whether Obsidian opens the file in its editor: Markdown notes, and files such as `.tex`
 * that another plugin registered for the editor. Obsidian has no public API for this lookup.
 */
export function opensInEditor(app: App, file: TAbstractFile | null | undefined): file is TFile {
	if (!(file instanceof TFile)) return false;
	if (file.extension === "md") return true;
	const viewRegistry = (app as unknown as { viewRegistry?: ViewRegistry }).viewRegistry;
	return viewRegistry?.getTypeByExtension?.(file.extension) === "markdown";
}

/** Every file that opens in the editor, for the note picker (file names only; no file is read). */
export function getEditorFiles(app: App) {
	return app.vault.getFiles().filter((file) => opensInEditor(app, file));
}

export function getNoteView(leaf: WorkspaceLeaf): MarkdownView | null {
	const view = leaf.view;
	return view instanceof MarkdownView && view.file ? view : null;
}

/** The file a leaf shows, also for a background tab whose view has not loaded yet. */
function getLeafFilePath(leaf: WorkspaceLeaf): string | null {
	const loaded = getNoteView(leaf);
	if (loaded) return loaded.file?.path ?? null;
	const file = leaf.getViewState().state?.file;
	return typeof file === "string" ? file : null;
}

export function isLeafVisible(leaf: WorkspaceLeaf) {
	const el = leaf.view.containerEl;
	return el.isConnected && el.offsetParent !== null;
}

export function isLeafInSidedock(leaf: WorkspaceLeaf) {
	const el = leaf.view.containerEl;
	if (
		el.closest(".workspace-split.mod-left-split") ||
		el.closest(".workspace-split.mod-right-split")
	) {
		return true;
	}

	type ParentNode = { parent?: ParentNode };
	let parent: ParentNode | null = leaf.parent;
	while (parent) {
		if (parent instanceof WorkspaceSidedock) return true;
		const next: ParentNode | null = parent.parent ?? null;
		if (!next || next === parent) return false;
		parent = next;
	}
	return false;
}

/** Note leaves in the main window and pop-out windows (not the sidebars). */
function getNoteLeaves(app: App) {
	return app.workspace.getLeavesOfType("markdown").filter((leaf) => !isLeafInSidedock(leaf));
}

/** Notes you can see right now: one per tab group, or every tab of a stacked group. */
export function getVisibleNoteLeaves(app: App) {
	return getNoteLeaves(app).filter((leaf) => isLeafVisible(leaf) && getNoteView(leaf) != null);
}

/** Files open in a tab outside the sidebars. */
export function getOpenNoteFiles(app: App): TFile[] {
	const files: TFile[] = [];
	for (const leaf of getNoteLeaves(app)) {
		const path = getLeafFilePath(leaf);
		const file = path ? app.vault.getAbstractFileByPath(path) : null;
		if (file instanceof TFile && !files.includes(file)) files.push(file);
	}
	return files;
}

/** The note you are working in: the active note, or the last active tab when a sidebar has focus. */
export function getCurrentNoteLeaf(app: App): WorkspaceLeaf | null {
	const active = app.workspace.getActiveViewOfType(MarkdownView);
	if (active?.file) return active.leaf;
	const recent = app.workspace.getMostRecentLeaf();
	return recent && getNoteView(recent) ? recent : null;
}

export function isLeafOpen(app: App, leaf: WorkspaceLeaf) {
	let found = false;
	app.workspace.iterateAllLeaves((candidate) => {
		if (candidate === leaf) found = true;
	});
	return found;
}

function findTabsShowing(app: App, file: TFile, except?: WorkspaceLeaf) {
	return getNoteLeaves(app).filter(
		(leaf) => leaf !== except && getLeafFilePath(leaf) === file.path,
	);
}

/**
 * A tab showing `file` next to `baseLeaf`: a tab already visible, else a background tab in another
 * tab group (brought to front), else a new split to the right of `baseLeaf`.
 */
export async function openBeside(app: App, baseLeaf: WorkspaceLeaf, file: TFile) {
	const tabs = findTabsShowing(app, file, baseLeaf);
	const visible = tabs.find(isLeafVisible);
	if (visible) return visible;

	const background = tabs.find((leaf) => leaf.parent !== baseLeaf.parent);
	if (background) {
		await app.workspace.revealLeaf(background);
		await background.loadIfDeferred();
		return background;
	}

	const leaf = app.workspace.createLeafBySplit(baseLeaf, "vertical");
	await leaf.openFile(file);
	return leaf;
}

/** A visible tab showing `file`: an existing tab brought to front, else a new tab. */
export async function openNote(app: App, file: TFile) {
	const tabs = findTabsShowing(app, file);
	const visible = tabs.find(isLeafVisible);
	if (visible) return visible;

	const background = tabs[0];
	if (background) {
		await app.workspace.revealLeaf(background);
		await background.loadIfDeferred();
		return background;
	}

	const leaf = app.workspace.getLeaf("tab");
	await leaf.openFile(file, { active: true });
	return leaf;
}

/** Order two tabs as they sit on screen: left before right, top before bottom. */
export function orderByPosition(a: WorkspaceLeaf, b: WorkspaceLeaf): [WorkspaceLeaf, WorkspaceLeaf] {
	const elA = a.view.containerEl;
	const elB = b.view.containerEl;
	if (elA.ownerDocument !== elB.ownerDocument) return [a, b];

	const rectA = elA.getBoundingClientRect();
	const rectB = elB.getBoundingClientRect();
	if (rectA.width === 0 || rectB.width === 0) return [a, b];

	if (Math.abs(rectA.left - rectB.left) >= 1) {
		return rectA.left < rectB.left ? [a, b] : [b, a];
	}
	return rectA.top <= rectB.top ? [a, b] : [b, a];
}
