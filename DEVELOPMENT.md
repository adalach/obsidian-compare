# Developing Compare

## Build and test

```bash
npm install
npm run build   # typecheck, then a minified main.js
npm run dev     # watch build with an inline source map, for debugging
npm test        # the diff and heading tests in test/
npm run lint    # eslint with Obsidian's plugin review rules (eslint-plugin-obsidianmd)
```

Obsidian loads `main.js`, `manifest.json` and `styles.css` from `<vault>/.obsidian/plugins/compare/`. Each build copies the three files there: into the folder named by the `COMPARE_PLUGIN_DIR` environment variable, or else into `~/Documents/Obsidian Vault/.obsidian/plugins/compare/` when that folder exists. After a rebuild, turn the plugin off and on under **Settings → Community plugins** to load the new code.

## How it works

`src/main.ts` wires the parts together and keeps the state: the pair being compared, live updates, the differences shown in the panel and the scroll sync. Class names and CSS classes (`markdowncompare-…`) keep the plugin's first name, MarkdownCompare; the plugin id is `compare`, and the panel's view type is `compare-diff-view`, so Compare loads next to an old MarkdownCompare install.

`src/compare/comparison.ts` starts, refreshes and ends a comparison. A comparison is a pair of tabs (`ComparePair`), not "the two notes on screen": it is set when a comparison starts and ends when either tab closes or shows another note, so other panes, sidebars and pop-out windows do not affect it. `compareNotes` compares the two visible notes when there are exactly two, and otherwise opens the note picker (`src/ui/NotePickerModal.ts`) for the current note. `src/compare/panes.ts` finds tabs: the visible notes outside the sidebars, the current note, and a tab for the picked note (an already visible tab, a background tab in another tab group brought to the front, or a new split to the right). Left and right are ordered by position on screen, so focus does not swap them. `src/commands/registerMenus.ts` adds the file, tab and two-file menu items. The picker and menus offer every file Obsidian opens in its editor (`opensInEditor`): Markdown, plus extensions another plugin registered for the editor, such as `.tex`. Obsidian has no public API for that lookup, so it reads `app.viewRegistry` and falls back to Markdown only.

`src/headings/headings.ts` finds each file's headings by its extension: `#` headings in `.md` (outside code fences), sectioning commands in `.tex` (`src/headings/latex.ts`, outside comments and verbatim environments), none in other files. `src/diff/highlights.ts` turns two texts into line and character highlights and the list of differences. Headings found in both files (`src/scroll/headingAnchors.ts`, matched by title, so a Markdown heading can match a LaTeX section) are fenced with sentinel lines before the line diff (`src/diff/myersDiff.ts`), so lines are only matched within the same section; changed line pairs get a character diff. `src/editor/diffHighlight.ts` draws the highlights as CodeMirror decorations, `src/scroll/scrollSync.ts` keeps the two editors scrolled to the same section, and `src/ui/DiffView.ts` is the right-sidebar panel.

With live updates on, edits in either note of the pair re-run the comparison 300 ms after the last keystroke.

The plugin uses no Node or Electron APIs and makes no network requests, so `isDesktopOnly` is `false`.

## Release

1. `npm version <x.y.z>` sets the version in `package.json`, `manifest.json` and `versions.json` (through `version-bump.mjs`), commits, and tags the commit `x.y.z` without a `v`.
2. `git push --follow-tags` starts `.github/workflows/release.yml`, which checks that the tag matches `manifest.json`, builds, tests, lints and opens a draft release with `main.js`, `manifest.json` and `styles.css` attached.
3. Review the draft on GitHub and publish it. Obsidian offers the update to users once the release is published.

Raise `minAppVersion` in `manifest.json` before `npm version` when a release needs a newer Obsidian.
