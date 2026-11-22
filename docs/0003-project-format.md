# 0003: Project format

- Status: accepted
- Date: 2026-11-22

## Context

Decision 0002 stores work in a folder the writer owns. This doc sets what goes in that folder. The app will grow beyond scripts and characters, and one cast can appear in several scripts (a series, or several films in one world).

## Decisions

### 1. One project is one folder

```
Heist/
  project.json
  scripts/
    ep01.fountain
    ep02.fountain
  characters/
    john.md
    maria.md
```

- `project.json` marks the folder as a project and holds a format version and the paper size: `{ "version": 1, "paper": "a4" }`. Later features use the version to migrate files. `paper` is `"a4"` or `"letter"` (decision 0001-6); new projects get `"a4"`, and a missing `paper` reads as `"a4"`.
- `scripts/` holds one or more Fountain files (decision 0001-1). All scripts share the cast in `characters/`.
- Later features add their own folders next to these (for example `locations/`, `notes/`).
- Why a folder and not one file: the app will grow, and separate files sync better. Dropbox, iCloud and Drive sync whole files, so edits on two devices to different characters never collide.
- Opening a project opens the most recently edited script. The other scripts are listed in a sidebar, sorted by filename.
- New project: the writer enters a name and picks a parent folder. The app creates `<name>/` inside it with `project.json`, `scripts/<name>.fountain` (empty) and `characters/`. If `<name>/` already exists, the app refuses and asks for another name. The project name is the folder name; it is not stored in `project.json`.
- Open project: the writer picks a folder. A folder without `project.json` is refused with "Not a project folder". A `version` newer than the app knows is refused with "Made by a newer version of the app".

### 2. One Markdown file per character

```markdown
---
name: JOHN
nickname: Johnny
age: 42
occupation: Safecracker
---
Ex-safecracker. Wants out, gets pulled back in.

## Looks & build

### What do people notice first about them?
A scar through the left eyebrow.

### Accent
Glaswegian, softened by years in London.

## Psychology

### What do they want most?
To be left alone.
```

- Front matter: flat `key: value` lines only, parsed with our own code. No YAML library. Short header fields go here.
- First paragraph of the body: the short description.
- `##` headings are sections. `###` headings are questions or custom fields. The text under a heading is the answer.
- Only answered questions are written. Empty ones are left out, so files stay short.
- On load, answers match questions by heading text. A heading that matches no known question loads as a custom field in that section. Nothing is dropped, so files edited outside the app (Obsidian, a text editor) are safe, and rewording a question later only turns old answers into custom fields.
- Unknown front matter keys are kept as written.

Files edited outside the app can hold text the app never writes itself. It is kept, so nothing is lost:

- Indented or list lines in the front matter (nested YAML such as `tags:` followed by `  - lead`) stay with the key above and are written back unchanged. The app does not read their meaning.
- Text between a `##` heading and its first `###` heading is kept with that section.
- Everything before the first `##` heading is the description, including any `###` heading there.
- Quoted values such as `name: "JOHN"` keep their quotes. The app does not unquote them.
- Front matter keys with an empty value are dropped on save, like empty answers.
- The filename slug keeps letters, combining marks and digits from any script, so non-Latin names such as Tamil work. Everything else becomes `-`. A name with no letters or digits gets `character`.

### 3. The `name` field is the identity

The script links to a character by name (decision 0001-2). The `name:` field is that name. The filename is a slug of the name (`john.md`, `guard-1.md`) and carries no meaning.

- Rename: the app renames the file and runs the project-wide bulk replace from decision 0001-2.
- Two characters cannot share a name, so no two files share a `name:`.
- Nested front matter (lists, objects) is out of scope. Adding it later means adding a YAML library.
