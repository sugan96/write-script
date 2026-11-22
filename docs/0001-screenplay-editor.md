# 0001: Screenplay editor

- Status: accepted
- Date: 2026-11-22

## Context

The app is a screenplay writer. It needs a text editor that runs fully in the browser, is open source, is widely used, and can be customised heavily. The app also has character sheets, and the same characters drive name suggestions in the editor.

Candidates (npm, November 2026, all MIT):

| Library | Version | Weekly downloads |
|---|---|---|
| ProseMirror | 1.25 | 44M |
| Tiptap | 3.35 | 39M |
| CodeMirror 6 | 6.43 | 26M |
| Lexical | 0.53 | 9.5M |
| Slate | 0.147 | 4.9M |

Lexical and Slate were dropped early: both are still pre-1.0 with changing APIs. The real choice was CodeMirror 6 (plain text) or Tiptap (structured rich text).

## Decisions

### 1. Storage format: Fountain plain text

The saved script is a [Fountain](https://fountain.io) text file. The editor only adds visual formatting on top of the text.

- Why: the file is readable without the app, diffs cleanly in git, and opens in other screenwriting tools (Highland, Slugline, Beat, Fade In) without conversion. No custom schema to version and migrate.
- Cost: element types come from parsing, not from stored data. When the parser guesses wrong, the writer uses Fountain markers (`@NAME` forces a character, `!` forces action, `.` forces a scene heading).

### 2. Character identity: the name

In the script, a character is its name as text (`JOHN`). The character sheet links to the script by name.

- Why: this matches how screenplays work and how Final Draft, Fade In and Highland build their character lists. Storing IDs in the script would create two sources of truth and need rules for names typed outside the sheet, deleted sheet entries, and pasted text.
- Rename: a bulk replace in the script (character lines and caps mentions in action), shown to the writer as "N changes" and applied as one undoable transaction.
- Limit: two different characters cannot share a name. Writers use `GUARD #1` / `GUARD #2`.

### 3. Element entry: Fountain rules plus shortcuts

Fountain rules decide each line's type. On top of that, a few keys rewrite the text for the writer:

- Tab on an empty line starts a character line (caps) and opens name suggestions.
- Enter after a character line goes to dialogue.
- Enter twice after dialogue goes back to action.

The shortcuts only insert or change text, so the saved file stays plain Fountain.

### 4. Live page breaks in the editor

The editor shows real page breaks while the writer types, following screenplay rules:

- Dialogue splits only at a sentence end, with `(MORE)` at the bottom and `NAME (CONT'D)` at the top of the next page.
- A scene heading is never the last thing on a page; it stays with the first 2 lines after it.
- Blank lines that fall past the end of a full page are dropped (hidden in the editor).

Page breaks come from a pure function over the parsed lines (`app/editor/screenplay.ts`). The same function will drive PDF export, so the editor and the PDF always agree.

### 5. Editor library: CodeMirror 6

Decisions 1 to 4 point to CodeMirror 6. It edits plain text, its decorations draw the screenplay formatting and the page-break widgets, and `@codemirror/autocomplete` covers name suggestions. Tiptap would fit only if the script were stored as structured JSON with typed elements or character IDs, which decisions 1 and 2 rule out.

A prototype confirmed live page breaks work in CodeMirror 6, including a dialogue split in the middle of a line, cursor movement across the break, and undo. A full recalculation takes 1 to 2 ms per keystroke for an 80-page script.

### 6. Print geometry and units

The script page uses physical units so it prints at true size: `in` for margins, `pt` for the font and line height, `ch` for text widths. `rem` is not used for the page, because it follows the user's browser font-size setting. App UI outside the page (sidebar, character sheet) can use `rem`.

- US Letter, 12pt Courier at 10 characters and 6 lines per inch. Line height 12pt.
- Margins: 1.5in left, 1in right, 1in top. The bottom margin is what remains after 55 lines, so a page is exactly 11in.
- Text widths: action and scene headings 60 characters, character names start at 22ch, dialogue 35 characters from 10ch, parentheticals 25 characters from 16ch.

### 7. Font: Courier Prime, bundled

Courier Prime (SIL Open Font License) is bundled in `app/fonts/` with its `OFL.txt` and loaded with `next/font/local`, so every writer sees and prints the same font. Latin subset only.

## Things to know when changing the editor

- CodeMirror wraps lines with `white-space: break-spaces`: a trailing space takes up width. The wrap function in `screenplay.ts` must match this, or page breaks drift by a line.
- CodeMirror puts invisible buffer images around inline widgets. They need `vertical-align: top`, or each adds 2px.

## Not done yet

- Dialogue only splits at a sentence end inside a line, not between two dialogue lines.
- The Fountain parser skips dual dialogue, notes, boneyard, centered text and title pages.
- The whole script is re-parsed on every keystroke. Make it incremental if typing lags on long scripts.
- The Tab/Enter shortcuts and character name suggestions are not built.
