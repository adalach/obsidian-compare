# Compare

Compare two notes side by side, right in the editor. Changed lines and the changed words are highlighted in both notes while you keep writing, sections are matched by their headings, and both notes scroll together. Cmd+click a difference, or a single changed word, to copy it to the other note. LaTeX files are matched by their `\section{…}` commands.

![Compare highlighting the differences between two notes](assets/markdowncompare-preview.webp)

## Start a comparison

- **Two notes open side by side:** run **Compare: Two notes** from the command palette. They are compared straight away.
- **Any other layout:** the same command, or **Compare: Current note with…**, asks which note to compare the current one with. Notes open in tabs come first, then recently opened ones. A note that is not on screen opens in a split to the right.
- **From a menu:**
  - Right-click a note in the file explorer, a link or a search result, and choose **Compare with *current note***.
  - Right-click a tab and choose **Compare with…**.
  - Select two notes in the file explorer, right-click and choose **Compare the two notes**.

A comparison stays with its two tabs. You can open other notes, split panes or use the sidebars, and it keeps going. It ends when you close either tab, open another note in it, or run **Compare: Stop comparing**.

## What you see

- Lines only in the left note are red, lines only in the right note are green, and changed lines are yellow with the changed words marked.
- Left and right are where the notes sit on screen (top and bottom in a horizontal split), so the colours stay the same wherever you click.
- Headings that appear in both notes anchor the comparison: text is only matched within the same section, and scrolling one note keeps the same section in view in the other.
- An edited paragraph is found again even when text was added or removed around it, such as a new table above it: lines with at least half of their words in common are paired, so only the changed words are marked, and the added lines show on their own.
- The **Compare** panel in the right sidebar lists the differences under their headings, one row for each run of consecutive changed lines. Click a difference to jump to it in both notes, or a file name to reveal the file in the file explorer.

## Copy a difference to the other note

- **Cmd+click** (Ctrl+click on Windows and Linux) a marked word in a changed line to copy just that change to the other note. That way you can keep one change from the left and another from the right in the same paragraph. Cmd+click elsewhere on a highlighted line copies its whole difference, so both notes read the same there. On a link, Cmd+click still opens the link; click beside it instead. Cmd+click on a framed table, callout or embed copies its difference too.
- **Right-click** a highlighted line and choose **Copy to *other note*** or **Use *other note*'s version**. For lines only one note has, the second item deletes them. On a marked word, the menu also offers **Copy this change to *other note*** and **Use *other note*'s version of this change**.
- **Compare: Copy difference to the other note** and **Compare: Use the other note's version** do the same for the difference at the cursor, so you can give them hotkeys.

After a copy, the cursor moves to the changed lines, so **Cmd+Z** (Ctrl+Z) undoes the copy straight away, and the highlights come back.

## LaTeX and other text files

Any file that Obsidian opens in its editor can be compared, for example `.tex` files when a plugin such as Custom File Extensions opens them as text.

- In `.tex` files the sections are `\part`, `\chapter`, `\section`, `\subsection`, `\subsubsection`, `\paragraph` and `\subparagraph`. Commands in `%` comments and in `verbatim`, `lstlisting`, `minted` or `comment` environments are ignored.
- A Markdown note and a `.tex` file can be compared too: a `# Methods` heading matches `\section{Methods}`.
- Other files are compared line by line, without sections.

## Live updates

**Compare: Toggle live updates**, or the scale icon in the status bar on desktop, keeps the highlights up to date while you edit either note. It stays on for later comparisons until you turn it off or run **Stop comparing**.

## Good to know

- Highlights show in Source mode and Live Preview. Reading view is not highlighted. In Live Preview, a table, callout or embed that is part of a difference gets a coloured frame, since Obsidian draws it as one block in place of its lines. Inside tables, the changed words are marked in their cells too.
- The plugin changes a note only when you copy a difference into it. That is an ordinary edit, saved like typing. Highlights disappear when the comparison ends.
- It makes no network requests.

## Install

In Obsidian, open **Settings → Community plugins → Browse**, search for **Compare**, install it and turn it on.

To install by hand, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/adalach/obsidian-compare/releases/latest) into `<vault>/.obsidian/plugins/compare/`, then turn the plugin on under **Settings → Community plugins**.
