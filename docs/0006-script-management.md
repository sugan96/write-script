# 0006: Script management

- Status: accepted
- Date: 2026-11-23

## Context

A project holds one or more scripts in `scripts/` (decision 0003-1). Until now the writer could only add, rename or remove scripts outside the app. This doc sets how the app creates, renames and deletes them. The browser file API has no trash: a removed file is gone from the folder.

## Decisions

### 1. Script names

The script name is the file name without `.fountain`. The app never shows the extension.

- A name is trimmed. It cannot be empty and cannot contain `/ \ : * ? " < > |`.
- A name is taken when another script has the same name ignoring case, because macOS and Windows treat `Heist` and `heist` as one file. A taken name is refused; the app never overwrites a file.
- The sidebar sorts scripts by name with numbers in order, so `Heist`, `Heist 2`, `Heist 10`.

### 2. New script

- The + button next to the Scripts heading shows a name field at the top of the script list.
- Enter creates `scripts/<name>.fountain`, empty, and opens it. Esc or leaving the field empty cancels.
- A refused name keeps the field open with the reason under it.

### 3. Rename

- Each script row has a ⋯ button, shown on hover and on keyboard focus. Its menu has Rename and Delete.
- Rename turns the row into the same name field, filled with the current name. Enter renames, Esc keeps the old name. The rules from decision 1 apply.
- Order: save the open document first (a conflict stops the rename), write the text under the new file name, then remove the old file. If the renamed script was open, it stays open.
- No undo bar: renaming back is the undo.

### 4. Delete

- Delete asks first in a dialog: "Delete Heist 2? The file is removed from your project folder. This cannot be undone." with Cancel and Delete.
- Delete removes the file and its saved draft. If it was open, the app opens the most recently edited remaining script.
- Characters used only in the deleted script leave the character list unless they have a sheet (decision 0004-3). Sheets are never deleted with a script.

### 5. No scripts

- The last script can be deleted.
- A project with no scripts shows "No scripts yet" in the editor area with a New script button, which starts the same name field as decision 2. The same screen shows when the files were removed outside the app.
