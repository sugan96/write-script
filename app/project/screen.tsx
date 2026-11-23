"use client";

// Project screen: script list, editor, autosave with conflict check (docs/0002-storage-byos.md decision 3,
// docs/0003-project-format.md decision 1). Design: docs/design/project/.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, FileText, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Editor from "../editor/editor";
import { renameCharacter, speakers, type Paper } from "../editor/screenplay";
import { readPaper, writePaper } from "../home/project";
import { cast, parseCharacter, slug, withName, writeCharacter } from "./character";
import { CharacterSheet, initialMode, type Mode, ModeSwitch, type Rename } from "./character-sheet";
import { deleteDraft, findDraft, putDraft } from "./drafts";
import { ConflictError, readFile, saveCopy, saveFile } from "./save";
import { byName, scriptNameError } from "./scripts";

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Doc = { handle: FileSystemFileHandle; name: string; text: string; key: number };
type CharacterFile = { handle: FileSystemFileHandle; name: string };

const SCRIPT_FONT = "font-[family-name:var(--font-script)]";
const SAVE_DELAY_MS = 1000;
const STATUS: Record<Status, { label: string; dot: string; pill: string }> = {
  saved: { label: "Saved", dot: "bg-green-600", pill: "bg-[#F4F4F2] text-zinc-700" },
  unsaved: { label: "Unsaved changes", dot: "bg-zinc-400", pill: "bg-[#F4F4F2] text-zinc-700" },
  saving: { label: "Saving…", dot: "bg-zinc-400", pill: "bg-[#F4F4F2] text-zinc-700" },
  conflict: { label: "Not saved", dot: "bg-red-600", pill: "bg-red-50 text-red-800" },
  error: { label: "Save failed", dot: "bg-red-600", pill: "bg-red-50 text-red-800" },
};
const PAPER_LABEL: Record<Paper, string> = { a4: "A4", letter: "US Letter" };

async function listScripts(dir: FileSystemDirectoryHandle): Promise<{ folder: FileSystemDirectoryHandle; files: FileSystemFileHandle[] }> {
  const folder = await dir.getDirectoryHandle("scripts", { create: true });
  const files: FileSystemFileHandle[] = [];
  for await (const h of folder.values()) if (h.kind === "file" && h.name.endsWith(".fountain")) files.push(h as FileSystemFileHandle);
  files.sort((a, b) => byName(title(a), title(b)));
  return { folder, files };
}

// Writes `text` under `to` and removes `from` (docs/0006-script-management.md decision 3).
// A change of case only is the same file on macOS and Windows, so it goes through a temporary name.
async function moveFile(folder: FileSystemDirectoryHandle, from: string, to: string, text: string): Promise<FileSystemFileHandle> {
  if (from.toLowerCase() === to.toLowerCase()) {
    const tmp = `${to}.renaming`;
    await saveFile(await folder.getFileHandle(tmp, { create: true }), text, null);
    await folder.removeEntry(from);
    from = tmp;
  }
  const handle = await folder.getFileHandle(to, { create: true });
  await saveFile(handle, text, null);
  await folder.removeEntry(from);
  return handle;
}

// Name field for a new script or a rename (docs/0006-script-management.md decisions 2 and 3).
function NameField({ initial, label, hint, error, onSubmit, onCancel }: { initial: string; label: string; hint: string; error: string | null; onSubmit: (name: string) => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 pb-1.5">
      <div className={`flex h-[34px] items-center gap-2 rounded-[7px] border bg-white px-2 ${error ? "border-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : "border-zinc-400 shadow-[0_0_0_3px_rgba(24,24,27,0.08)]"}`}>
        <FileText aria-hidden className="size-[15px] flex-none text-zinc-500" />
        <input
          autoFocus
          aria-label={label}
          defaultValue={initial}
          aria-invalid={!!error}
          aria-describedby={error ? "script-name-error" : undefined}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(e.currentTarget.value);
            else if (e.key === "Escape") onCancel();
          }}
          onBlur={(e) => onSubmit(e.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-900 outline-none"
        />
      </div>
      {error && <p id="script-name-error" className="px-2 text-xs text-red-700">{error}</p>}
      <p className="px-2 text-[11px] text-zinc-500">{hint}</p>
    </div>
  );
}

async function mostRecent(files: FileSystemFileHandle[]): Promise<FileSystemFileHandle | undefined> {
  const times = await Promise.all(files.map(async (f) => (await f.getFile()).lastModified));
  return files[times.indexOf(Math.max(...times))];
}

const title = (h: FileSystemFileHandle) => h.name.replace(/\.(fountain|md)$/, "");
const isSheet = (h: FileSystemFileHandle) => h.name.endsWith(".md");
// The name: field is the identity (docs/0003-project-format.md decision 3); the filename is a fallback.
const characterName = (h: FileSystemFileHandle, text: string) => parseCharacter(text).front.name?.trim() || title(h);

async function listCharacters(dir: FileSystemDirectoryHandle): Promise<CharacterFile[]> {
  const folder = await dir.getDirectoryHandle("characters", { create: true });
  const files: CharacterFile[] = [];
  for await (const h of folder.values()) {
    if (h.kind !== "file" || !h.name.endsWith(".md")) continue;
    const handle = h as FileSystemFileHandle;
    files.push({ handle, name: characterName(handle, (await readFile(handle)).text) });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function exists(folder: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await folder.getFileHandle(name);
    return true;
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return false;
    throw e;
  }
}

// What the undo bar needs to put a rename back (decision 0004-6). Kept in memory only.
type Undo = {
  from: string;
  to: string;
  changes: number;
  /** Text before the rename, and lastModified after our write, per changed script. */
  scripts: { handle: FileSystemFileHandle; text: string; lastModified: number }[];
  sheet: FileSystemFileHandle;
};

// Names that speak in each script, keyed by script filename (decision 0004-5).
type Used = Record<string, string[]>;
async function readSpeakers(files: FileSystemFileHandle[]): Promise<Used> {
  const texts = await Promise.all(files.map(async (f) => (await readFile(f)).text));
  return Object.fromEntries(files.map((f, i) => [f.name, speakers(texts[i])]));
}
// Keeps the same object when nothing changed, so typing does not re-render the sidebar.
const withSpeakers = (u: Used, file: string, text: string): Used => {
  const names = speakers(text);
  return u[file]?.join("\n") === names.join("\n") ? u : { ...u, [file]: names };
};

export function ProjectScreen({ dir, onClose }: { dir: FileSystemDirectoryHandle; onClose: () => void }) {
  const [scripts, setScripts] = useState<FileSystemFileHandle[]>([]);
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [used, setUsed] = useState<Used>({});
  const [undo, setUndo] = useState<Undo | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>("a4");
  const [pages, setPages] = useState(0);
  const [ready, setReady] = useState(false); // script list loaded
  // The open name field: file is null for a new script, else the script being renamed.
  const [naming, setNaming] = useState<{ file: FileSystemFileHandle | null; error: string | null } | null>(null);
  const [deleting, setDeleting] = useState<FileSystemFileHandle | null>(null);
  const busy = useRef(false); // a create or rename is running

  const folder = useRef<FileSystemDirectoryHandle | null>(null);
  const current = useRef<FileSystemFileHandle | null>(null);
  const text = useRef(""); // latest editor text
  const base = useRef(0); // file lastModified at our last read or write
  const dirty = useRef(false); // text not yet on disk
  const blocked = useRef(false); // conflict: autosave stopped for this file
  const timer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    setStatus("error");
    setError((e as Error).message);
  }, []);

  // Load a script, restoring a draft of unsaved edits when one exists.
  // Returns true when a restored draft is waiting to be saved.
  const show = useCallback(async (handle: FileSystemFileHandle): Promise<boolean> => {
    window.clearTimeout(timer.current);
    const disk = await readFile(handle);
    const draft = await findDraft(handle);
    current.current = handle;
    base.current = disk.lastModified;
    dirty.current = false;
    blocked.current = false;
    let next: Status = "saved";
    text.current = disk.text;
    if (draft && draft.text !== disk.text) {
      text.current = draft.text;
      dirty.current = true;
      // Disk unchanged since the draft started: the draft is simply newer. Otherwise both changed.
      blocked.current = draft.base !== disk.lastModified;
      next = blocked.current ? "conflict" : "unsaved";
    }
    const sheet = isSheet(handle);
    if (sheet) setMode(initialMode(text.current));
    else setUsed((u) => withSpeakers(u, handle.name, text.current));
    setDoc({ handle, name: sheet ? characterName(handle, text.current) : title(handle), text: text.current, key: Date.now() });
    setStatus(next);
    setError(null);
    return next === "unsaved";
  }, []);

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    const handle = current.current;
    if (!handle || !dirty.current || blocked.current) return;
    const snapshot = text.current;
    setStatus("saving");
    try {
      base.current = await saveFile(handle, snapshot, base.current);
      if (text.current !== snapshot) {
        // Edited during the save: onChange already set a new timer for the rest.
        setStatus("unsaved");
        return;
      }
      dirty.current = false;
      await deleteDraft(handle);
      setStatus("saved");
    } catch (e) {
      if (e instanceof ConflictError) {
        blocked.current = true;
        setStatus("conflict");
      } else fail(e);
    }
  }, [fail]);

  const onChange = (t: string) => {
    const handle = current.current;
    if (!handle) return;
    text.current = t;
    dirty.current = true;
    putDraft(handle, t, base.current).catch(fail);
    // ponytail: re-parses the script on every keystroke, like the editor layout (1-2 ms for 80 pages).
    if (!isSheet(handle)) setUsed((u) => withSpeakers(u, handle.name, t));
    if (blocked.current) return;
    setStatus("unsaved");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  };

  // On focus: reload a file changed on disk, or flag a conflict when we have unsaved edits.
  const check = useCallback(async () => {
    const handle = current.current;
    if (!handle || blocked.current) return;
    if ((await handle.getFile()).lastModified === base.current) return;
    if (dirty.current) {
      blocked.current = true;
      setStatus("conflict");
    } else await show(handle);
  }, [show]);

  useEffect(() => {
    Promise.all([readPaper(dir), listScripts(dir), listCharacters(dir)])
      .then(async ([p, { folder: f, files }, sheets]) => {
        setPaper(p);
        folder.current = f;
        setScripts(files);
        setCharacters(sheets);
        setReady(true);
        setUsed(await readSpeakers(files));
        const first = await mostRecent(files);
        if (first && (await show(first))) timer.current = window.setTimeout(save, SAVE_DELAY_MS);
      })
      .catch(fail);
  }, [dir, show, save, fail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    const onHide = () => document.visibilityState === "hidden" && save();
    const onFocus = () => check().catch(fail);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onFocus);
    };
  }, [save, check, fail]);

  const open = async (handle: FileSystemFileHandle) => {
    setUndo(null); // decision 0004-6: opening another document ends the undo
    await save();
    try {
      if (await show(handle)) timer.current = window.setTimeout(save, SAVE_DELAY_MS);
    } catch (e) {
      fail(e);
    }
  };

  const back = async () => {
    await save();
    onClose();
  };

  const changePaper = async (value: string) => {
    const next = value as Paper;
    if (next === paper) return;
    try {
      await writePaper(dir, next);
      setPaper(next);
      // The editor rebuilds for the new paper; hand it the latest text, not the text it opened with.
      setDoc((d) => d && { ...d, text: text.current, key: Date.now() });
    } catch (e) {
      fail(e);
    }
  };

  // Conflict choices (docs/0002-storage-byos.md decision 3).
  const loadDisk = async () => {
    const handle = current.current!;
    await deleteDraft(handle);
    await show(handle);
  };
  const keepMine = async () => {
    const handle = current.current!;
    blocked.current = false;
    try {
      base.current = await saveFile(handle, text.current, null);
      dirty.current = false;
      await deleteDraft(handle);
      setStatus("saved");
    } catch (e) {
      fail(e);
    }
  };
  const keepCopy = async () => {
    const handle = current.current!;
    try {
      await saveCopy(folder.current!, handle.name, text.current);
      await deleteDraft(handle);
      const { files } = await listScripts(dir);
      setScripts(files);
      setUsed(await readSpeakers(files));
      await show(handle);
    } catch (e) {
      fail(e);
    }
  };

  // Decision 0004-5: writes only `name:`; never overwrites a file with the same slug.
  const createSheet = async (name: string) => {
    try {
      const folder = await dir.getDirectoryHandle("characters", { create: true });
      const file = `${slug(name)}.md`;
      if (await exists(folder, file)) throw new Error(`Cannot create a sheet for ${name}: another character sheet already uses that file name.`);
      const handle = await folder.getFileHandle(file, { create: true });
      await saveFile(handle, writeCharacter({ front: { name }, description: "", sections: [] }), null);
      setCharacters(await listCharacters(dir));
      await open(handle);
    } catch (e) {
      // Not a save failure of the open document, so only show the message.
      setError((e as Error).message);
    }
  };

  const list = cast(characters, Object.values(used).flat());
  const names = list.map((c) => ({ name: c.name, sheet: !!c.file }));

  // Reload the lists and show the sheet in Edit, where rename and undo start.
  const reopen = async (handle: FileSystemFileHandle) => {
    const { files } = await listScripts(dir);
    setScripts(files);
    setUsed(await readSpeakers(files));
    setCharacters(await listCharacters(dir));
    await show(handle);
    setMode("edit");
  };

  // Project-wide rename from the sheet (docs/0004-character-sheet.md decision 6, docs/0001-screenplay-editor.md decision 2).
  const rename: Rename = async (to) => {
    const handle = current.current!;
    const from = doc!.name;
    if (!to) return "A character needs a name.";
    const other = list.find((c) => c.name.toUpperCase() === to && c.file?.handle.name !== handle.name);
    if (other) return `Another character is already called ${to}. Pick a different name, or press Esc to keep ${from}.`;
    const folder = await dir.getDirectoryHandle("characters");
    const file = `${slug(to)}.md`;
    if (file !== handle.name && (await exists(folder, file))) return `Another file already uses the file name for ${to}. Pick a different name, or press Esc to keep ${from}.`;
    await save();
    if (dirty.current) return "Save this sheet before renaming it.";

    setUndo(null);
    const done: Undo["scripts"] = [];
    let changes = 0;
    try {
      for (const script of (await listScripts(dir)).files) {
        const disk = await readFile(script);
        const r = renameCharacter(disk.text, from, to);
        if (!r.changes) continue;
        done.push({ handle: script, text: disk.text, lastModified: await saveFile(script, r.text, disk.lastModified) });
        changes += r.changes;
      }
      const renamed = file === handle.name ? handle : await folder.getFileHandle(file, { create: true });
      await saveFile(renamed, withName((await readFile(handle)).text, to), renamed === handle ? base.current : null);
      if (renamed !== handle) await folder.removeEntry(handle.name);
      setUndo({ from, to, changes, scripts: done, sheet: renamed });
      await reopen(renamed);
    } catch (e) {
      // Decision 0004-6: stop, name what changed, and let the undo bar put it back.
      const changed = done.map((d) => title(d.handle)).join(", ") || "none";
      setUndo({ from, to, changes, scripts: done, sheet: handle });
      setError(`Rename stopped: ${(e as Error).message} Scripts already changed: ${changed}. Use Undo to put them back.`);
    }
    return null;
  };

  // Writes the old texts back with the conflict check and renames the sheet back (decision 0004-6).
  const undoRename = async () => {
    const u = undo!;
    setUndo(null);
    await save();
    const skipped: string[] = [];
    try {
      for (const s of u.scripts) {
        try {
          await saveFile(s.handle, s.text, s.lastModified);
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          skipped.push(title(s.handle));
        }
      }
      // The sheet keeps edits made since the rename; only its name goes back.
      const folder = await dir.getDirectoryHandle("characters");
      const file = `${slug(u.from)}.md`;
      const sheetText = withName((await readFile(u.sheet)).text, u.from);
      let back = u.sheet;
      if (file === u.sheet.name) await saveFile(u.sheet, sheetText, null);
      else if (await exists(folder, file)) skipped.push(`the sheet (another file is called ${u.from})`);
      else {
        back = await folder.getFileHandle(file, { create: true });
        await saveFile(back, sheetText, null);
        await folder.removeEntry(u.sheet.name);
      }
      await reopen(back);
      if (skipped.length) setError(`Undo skipped files that changed since the rename: ${skipped.join(", ")}.`);
    } catch (e) {
      setError(`Undo stopped: ${(e as Error).message}`);
    }
  };
  const reloadScripts = async () => {
    const { files } = await listScripts(dir);
    setScripts(files);
    setUsed(await readSpeakers(files));
    return files;
  };

  // New script or rename from the name field (docs/0006-script-management.md decisions 2 and 3).
  const submitName = async (raw: string) => {
    if (!naming || busy.current) return;
    const from = naming.file;
    const name = raw.trim();
    if (!name || (from && name === title(from))) return setNaming(null);
    busy.current = true;
    try {
      const { folder: scriptsDir, files } = await listScripts(dir);
      const bad = scriptNameError(name, files.filter((h) => h.name !== from?.name).map(title));
      if (bad) return setNaming({ file: from, error: bad });
      const file = `${name}.fountain`;
      if (!from) {
        const handle = await scriptsDir.getFileHandle(file, { create: true });
        setNaming(null);
        await reloadScripts();
        await open(handle);
        return;
      }
      const wasOpen = current.current?.name === from.name;
      if (wasOpen) await save();
      // A draft means edits not on disk yet (a conflict, or left from an earlier session).
      if (await findDraft(from)) return setNaming({ file: from, error: `${title(from)} has unsaved edits. Open it and save them before renaming.` });
      setUndo(null); // a character rename undo holds the old script handles
      const moved = await moveFile(scriptsDir, from.name, file, (await readFile(from)).text);
      setNaming(null);
      await reloadScripts();
      if (wasOpen) await show(moved);
    } catch (e) {
      setNaming(null);
      setError((e as Error).message);
    } finally {
      busy.current = false;
    }
  };

  // Delete after the confirm dialog (docs/0006-script-management.md decision 4).
  const deleteScript = async () => {
    const handle = deleting!;
    setDeleting(null);
    setUndo(null);
    const wasOpen = current.current?.name === handle.name;
    if (wasOpen) {
      window.clearTimeout(timer.current);
      current.current = null;
      dirty.current = false;
      setDoc(null);
      setStatus("saved");
    }
    try {
      await deleteDraft(handle);
      await folder.current!.removeEntry(handle.name);
      const next = await mostRecent(await reloadScripts());
      if (wasOpen && next) await open(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const s = STATUS[status];
  const unsavedName = status === "conflict" || status === "error" ? doc?.handle.name : undefined;
  const sheet = doc ? isSheet(doc.handle) : false;
  const navItem = (active: boolean) =>
    `flex cursor-pointer items-center gap-2 rounded-[7px] px-2 text-left text-[13px] ${active ? "bg-white font-medium text-zinc-900 shadow-[0_0_0_1px_#E4E4E2,0_1px_2px_rgba(16,16,20,0.04)]" : "text-zinc-700 hover:bg-white"}`;

  return (
    <div className="flex h-screen flex-col bg-[#EDEDEB]">
      <header className="flex h-13 flex-none items-center justify-between gap-4 border-b border-[#E4E4E2] bg-white px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" className="text-zinc-600" onClick={back}><ChevronLeft aria-hidden />Projects</Button>
          <span aria-hidden className="text-[#D4D4D1]">/</span>
          <span className={`${SCRIPT_FONT} truncate px-1.5 text-sm font-bold`}>{dir.name}</span>
          {doc && (
            <>
              <span aria-hidden className="text-[#D4D4D1]">/</span>
              <span className={`truncate px-1.5 text-[13px] ${sheet ? SCRIPT_FONT : ""}`}>{doc.name}</span>
            </>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {/* View mode changes nothing, so it hides the save status unless something needs attention. */}
          {doc && (!sheet || mode === "edit" || status !== "saved") && (
            <span role="status" className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${s.pill}`}>
              <span aria-hidden className={`size-[7px] rounded-full ${s.dot}`} />{s.label}
            </span>
          )}
          {doc && !sheet && <span className="px-1.5 text-xs text-zinc-600">{pages} {pages === 1 ? "page" : "pages"}</span>}
          {sheet && <ModeSwitch mode={mode} onMode={setMode} />}
          {doc && !sheet && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" aria-label={`Paper size: ${PAPER_LABEL[paper]}`}>
                {PAPER_LABEL[paper]}<ChevronDown aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Paper size</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={paper} onValueChange={changePaper}>
                <DropdownMenuRadioItem value="a4" className="min-h-11 flex-col items-start gap-0.5">
                  <span className="text-[13px] font-medium">A4</span>
                  <span className="text-xs text-zinc-600">210 × 297 mm · UK, Europe, Asia</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="letter" className="min-h-11 flex-col items-start gap-0.5">
                  <span className="text-[13px] font-medium">US Letter</span>
                  <span className="text-xs text-zinc-600">8.5 × 11 in · US industry standard</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs leading-normal text-zinc-600">Applies to every script in this project. Page breaks and page count change.</p>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </header>

      {status === "conflict" && doc && (
        <div role="alert" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-3 border-b border-amber-200 bg-amber-50 py-3 pl-5 pr-4">
          <div className="flex min-w-[320px] flex-1 items-start gap-2.5">
            <AlertTriangle aria-hidden className="mt-px size-[18px] flex-none text-amber-700" />
            <div className="flex flex-col gap-0.5 text-[13px]">
              <span className="font-semibold text-amber-950">{doc.name} changed on disk</span>
              <span className="text-amber-800">Another device or app saved this {sheet ? "character sheet" : "script"} while you had unsaved edits. Autosave is paused until you choose.</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={loadDisk}>Load disk version</Button>
            {/* A copy of a sheet would repeat its name, and names are unique (docs/0003-project-format.md decision 3). */}
            {!sheet && <Button size="sm" variant="outline" onClick={keepCopy}>Save mine as a copy</Button>}
            <Button size="sm" onClick={keepMine}>Keep mine</Button>
          </div>
        </div>
      )}
      {undo && (
        <div role="status" className="flex flex-none items-center gap-4 border-b border-[#E4E4E2] bg-white py-2.5 pl-5 pr-3">
          <div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
            <Check aria-hidden className="size-[18px] flex-none text-green-600" />
            <span className="font-semibold text-zinc-900">
              Renamed <span className={SCRIPT_FONT}>{undo.from}</span> to <span className={SCRIPT_FONT}>{undo.to}</span>
            </span>
            <span className="text-zinc-600">
              {undo.changes} {undo.changes === 1 ? "change" : "changes"} in {undo.scripts.length} {undo.scripts.length === 1 ? "script" : "scripts"}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={undoRename}>Undo</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Close" className="text-zinc-600" onClick={() => setUndo(null)}><X aria-hidden /></Button>
        </div>
      )}
      {error && <p role="alert" className="flex-none border-b border-red-200 bg-red-50 px-5 py-3 text-[13px] text-red-900">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] flex-none flex-col gap-[22px] overflow-y-auto border-r border-[#E4E4E2] bg-[#FAFAF9] px-3 py-4 md:flex">
          <nav aria-label="Scripts" className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Scripts</span>
              <button type="button" aria-label="New script" onClick={() => setNaming({ file: null, error: null })} className="flex size-6 cursor-pointer items-center justify-center rounded-md text-zinc-600 hover:bg-[#EDEDEB] hover:text-zinc-900">
                <Plus aria-hidden className="size-3.5" />
              </button>
            </div>
            {naming && !naming.file && (
              <NameField initial="" label="New script name" hint="Enter to create · Esc to cancel" error={naming.error} onSubmit={submitName} onCancel={() => setNaming(null)} />
            )}
            {scripts.map((f) => {
              const name = title(f);
              if (naming?.file?.name === f.name)
                return <NameField key={f.name} initial={name} label={`Rename ${name}`} hint={`Enter to rename · Esc to keep ${name}`} error={naming.error} onSubmit={submitName} onCancel={() => setNaming(null)} />;
              const active = doc?.handle.name === f.name;
              return (
                <div key={f.name} className={`group h-[34px] pr-1 ${navItem(active)}`}>
                  <button type="button" onClick={() => open(f)} aria-current={active ? "page" : undefined} className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                    <FileText aria-hidden className={`size-[15px] flex-none ${active ? "text-zinc-700" : "text-zinc-500"}`} />
                    <span className="truncate">{name}</span>
                    {unsavedName === f.name && <span aria-label="Not saved" className="ml-auto size-[7px] flex-none rounded-full bg-red-600" />}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${name}`}
                        className="flex size-[26px] flex-none cursor-pointer items-center justify-center rounded-md text-zinc-600 opacity-0 hover:bg-[#EDEDEB] hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[#EDEDEB] data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal aria-hidden className="size-[15px]" />
                      </button>
                    </DropdownMenuTrigger>
                    {/* Focus goes to the name field or the dialog, not back to this button. */}
                    <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
                      <DropdownMenuItem className="text-[13px]" onSelect={() => setNaming({ file: f, error: null })}><Pencil aria-hidden />Rename</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-[13px]" variant="destructive" onSelect={() => setDeleting(f)}><Trash2 aria-hidden />Delete…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </nav>
          {list.length > 0 && (
            <nav aria-label="Characters" className="flex flex-col gap-0.5">
              <span className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Characters</span>
              {list.map(({ name, file }) => {
                if (!file)
                  return (
                    <div key={name} className="flex h-8 items-center justify-between gap-1.5 pl-2 pr-1">
                      <span className={`${SCRIPT_FONT} truncate text-[13px] text-zinc-600`}>{name}</span>
                      <button
                        type="button"
                        onClick={() => createSheet(name)}
                        aria-label={`Create sheet for ${name}`}
                        className="h-6 flex-none cursor-pointer rounded-md border border-dashed border-[#D4D4D1] px-2 text-[11px] font-medium text-zinc-600 hover:bg-white"
                      >
                        Create sheet
                      </button>
                    </div>
                  );
                const active = doc?.handle.name === file.handle.name;
                return (
                  <button key={file.handle.name} type="button" onClick={() => open(file.handle)} aria-current={active ? "page" : undefined} className={`h-8 ${SCRIPT_FONT} ${navItem(active)}`}>
                    <span className="truncate">{name}</span>
                    {unsavedName === file.handle.name && <span aria-label="Not saved" className="ml-auto size-[7px] flex-none rounded-full bg-red-600" />}
                  </button>
                );
              })}
            </nav>
          )}
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">
          {doc && sheet && <CharacterSheet key={doc.key} initial={doc.text} mode={mode} onMode={setMode} onChange={onChange} onRename={rename} />}
          {doc && !sheet && <Editor key={doc.key} initial={doc.text} paper={paper} names={names} onChange={onChange} onPages={setPages} />}
          {!doc && ready && scripts.length === 0 && (
            // Decision 0006-5.
            <div className="flex h-full items-center justify-center p-6">
              <div className="flex w-80 flex-col items-center gap-4 text-center">
                <div aria-hidden className="flex size-12 items-center justify-center rounded-xl bg-white shadow-[0_0_0_1px_#E4E4E2,0_1px_2px_rgba(16,16,20,0.04)]">
                  <FileText className="size-[22px] text-zinc-600" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-semibold text-zinc-900">No scripts yet</h2>
                  <p className="text-[13px] leading-5 text-zinc-600">Start a script in this project. Your characters stay as they are.</p>
                </div>
                <Button onClick={() => setNaming({ file: null, error: null })}><Plus aria-hidden />New script</Button>
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete {deleting ? title(deleting) : ""}?</DialogTitle>
            <DialogDescription>The file is removed from your project folder. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteScript}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
