import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from "obsidian";
import type MarkdownComparePlugin from "../main";

export interface CompareSettings {
	/** Add blank gaps so matched lines sit level, and scroll both notes together exactly. */
	alignWithGaps: boolean;
}

export const DEFAULT_SETTINGS: CompareSettings = {
	alignWithGaps: true,
};

const ALIGN_NAME = "Line up matching text";
const ALIGN_DESC =
	"While comparing, add blank space to the note that is shorter at a spot, so that matching text sits side by side, and scroll both notes together. The space is only shown on screen; it is never added to the notes.";

export class CompareSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MarkdownComparePlugin,
	) {
		super(app, plugin);
	}

	// Obsidian 1.13 and later: declared settings, which also appear in the settings search.
	getSettingDefinitions(): SettingDefinitionItem<keyof CompareSettings>[] {
		return [
			{
				name: ALIGN_NAME,
				desc: ALIGN_DESC,
				control: { type: "toggle", key: "alignWithGaps", defaultValue: DEFAULT_SETTINGS.alignWithGaps },
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof CompareSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "alignWithGaps") await this.plugin.setAlignWithGaps(value === true);
	}

	// Earlier Obsidian versions draw the settings here.
	display() {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName(ALIGN_NAME)
			.setDesc(ALIGN_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alignWithGaps)
					.onChange((value) => this.plugin.setAlignWithGaps(value)),
			);
	}
}
