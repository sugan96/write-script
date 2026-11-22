# 0004: Character sheet

- Status: accepted
- Date: 2026-11-22

## Context

Each character has a sheet that the writer fills in while developing the character. The sheet and the scripts share names: the editor suggests names from the sheets, and names typed in a script show up in the character list. The file format is in decision 0003.

## Decisions

### 1. Fields follow the Reedsy character profile structure

Structure based on the [Reedsy character profile template](https://reedsy.com/studio/templates/character-profile/).

Header (front matter, one-line answers):

- Name (required), description (first body paragraph)
- Nickname, Gender, Age, Height, Place of birth, Nationality, Occupation

Front matter keys: `name`, `nickname`, `gender`, `age`, `height`, `birthplace`, `nationality`, `occupation`.

Sections (long answers, `##` headings):

1. Looks & build
2. Style & dress
3. Speech & mannerisms
4. Early life & background
5. Family & key relationships
6. Personality
7. Psychology
8. Goals & fears (covers what Reedsy calls "Id")
9. Character arc: one summary of how the character changes from start to end

Each section has a set of suggested questions.

- The question wording is our own. Reedsy's questions are their own text in a product they sell. Section names and simple field names are generic; the questions are not copied.
- The question list lives in one TypeScript constant. Matching by heading text (decision 0003-2) means rewording a question never loses an answer.

### 2. Custom fields inside any section

The writer can add a field with their own heading and text inside any section, for example "Accent" under Speech & mannerisms. A custom field is a `###` heading like any question. Custom fields can be renamed, removed and reordered within their section.

### 3. Form built with react-hook-form

- `useFieldArray` handles adding, removing and reordering custom fields.
- Inputs are uncontrolled, so typing in one of about 50 text areas does not re-render the form.
- When the file changes on disk or a rename comes from the script, the form is mounted again with the new file, the same way the script editor reloads.
- No submit button. Changes save through the autosave in decision 0002-3.
- No validation library. The only rules are that `name` is required and unique in the project.

### 4. Name suggestions in the editor

On a character line, suggestions come from:

1. names in character files, listed first
2. names used in any script in the project that have no character file

Extensions such as `(V.O.)`, `(O.S.)` and `(CONT'D)` are removed before matching, so `JOHN (V.O.)` is `JOHN`.

### 5. New names in a script do not create files

A name typed in a script with no character file shows in the character list as "no sheet yet" with a **Create sheet** button. Nothing is written until the writer clicks.

- Why: auto-creating files turns every typo (`JHON`) into a file that syncs to every device, and asking each time interrupts writing for every one-line minor character.

The character list is every name used in any script, plus every character file. A sheet whose name no longer appears in any script stays in the list, so the writer can decide whether to delete it.

### 6. The only link that changes both sides is rename

- Deleting a character sheet never changes a script.
- Removing all of a character's lines from the scripts never deletes the sheet.
- Renaming a character (from the sheet or the script) updates the file and every script in the project, as described in decision 0001-2.

### 7. View and edit modes, sections as accordions

Design: `docs/design/project/character-edit.html` and `character-view.html`.

- A switch in the header toggles **View** and **Edit**.
- View is read-only. It shows the name, description, filled-in header fields, and only sections with answers, each with its questions and answers. Empty sections are hidden, with a line that says how many.
- Edit is the form. Each section is a native `<details>` accordion with an "answered" count in its summary. Sections with an answer start open; empty ones start closed.
- A sheet with any content opens in View. An empty sheet (for example one just created) opens in Edit. The mode and open sections are not remembered.

## Out of scope for now

- "Appears in" lists (which scripts and scenes a character is in).
- Nested data such as relationship lists.
- Sorting or grouping by a field such as role.
