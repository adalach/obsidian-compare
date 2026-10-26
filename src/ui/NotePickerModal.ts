import { FuzzySuggestModal, renderResults, type App, type FuzzyMatch, type TFile } from "obsidian";
import { getOpenNoteFiles } from "../compare/panes";

function getDisplayPath(file: TFile) {
	return file.extension === "md" ? file.path.slice(0, -3) : file.path;
}

/** Pick the note to compare with: notes open in tabs first, then recent notes, then the rest by last edit. */
export class NotePickerModal extends FuzzySuggestModal<TFile> {
	private readonly baseFile: TFile;
	private readonly onPick: (file: TFile) => void;
	private readonly openFiles: Set<TFile>;

	constructor(app: App, baseFile: TFile, onPick: (file: TFile) => void) {
		super(app);
		this.baseFile = baseFile;
		this.onPick = onPick;
		this.openFiles = new Set(getOpenNoteFiles(app));
		this.setPlaceholder(`Compare ${baseFile.basename} with…`);
		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to compare" },
			{ command: "esc", purpose: "to dismiss" },
		]);
	}

	getItems(): TFile[] {
		const notes = this.app.vault.getMarkdownFiles().filter((file) => file !== this.baseFile);
		const recentPaths = this.app.workspace.getLastOpenFiles();
		const rank = (file: TFile) => {
			if (this.openFiles.has(file)) return 0;
			return recentPaths.includes(file.path) ? 1 : 2;
		};
		const recency = (file: TFile) => {
			const index = recentPaths.indexOf(file.path);
			return index === -1 ? recentPaths.length : index;
		};

		return notes.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				recency(a) - recency(b) ||
				b.stat.mtime - a.stat.mtime,
		);
	}

	getItemText(file: TFile) {
		return getDisplayPath(file);
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement) {
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		renderResults(
			content.createDiv({ cls: "suggestion-title" }),
			getDisplayPath(match.item),
			match.match,
		);

		if (this.openFiles.has(match.item)) {
			el.createDiv({ cls: "suggestion-aux" }).createSpan({
				cls: "markdowncompare-picker-open",
				text: "open",
			});
		}
	}

	onChooseItem(file: TFile) {
		this.onPick(file);
	}
}
