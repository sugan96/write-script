"use client";

// Project screen: script list, editor, autosave with conflict check (docs/0002-storage-byos.md decision 3,
// docs/0003-project-format.md decision 1). Design: docs/design/project/.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Editor from "../editor/editor";
import type { Paper } from "../editor/screenplay";
import { readPaper, writePaper } from "../home/project";
import { deleteDraft, findDraft, putDraft } from "./drafts";
import { ConflictError, readFile, saveCopy, saveFile } from "./save";

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Doc = { handle: FileSystemFileHandle; text: string; key: number };

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
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { folder, files };
}

async function mostRecent(files: FileSystemFileHandle[]): Promise<FileSystemFileHandle | undefined> {
  const times = await Promise.all(files.map(async (f) => (await f.getFile()).lastModified));
  return files[times.indexOf(Math.max(...times))];
}

const title = (h: FileSystemFileHandle) => h.name.replace(/\.fountain$/, "");

export function ProjectScreen({ dir, onClose }: { dir: FileSystemDirectoryHandle; onClose: () => void }) {
  const [scripts, setScripts] = useState<FileSystemFileHandle[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>("a4");
  const [pages, setPages] = useState(0);

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
    setDoc({ handle, text: text.current, key: Date.now() });
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
    Promise.all([readPaper(dir), listScripts(dir)])
      .then(async ([p, { folder: f, files }]) => {
        setPaper(p);
        folder.current = f;
        setScripts(files);
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
      setScripts((await listScripts(dir)).files);
      await show(handle);
    } catch (e) {
      fail(e);
    }
  };

  const s = STATUS[status];
  const unsavedName = status === "conflict" || status === "error" ? doc?.handle.name : undefined;

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
              <span className="truncate px-1.5 text-[13px]">{title(doc.handle)}</span>
            </>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {doc && (
            <>
              <span role="status" className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${s.pill}`}>
                <span aria-hidden className={`size-[7px] rounded-full ${s.dot}`} />{s.label}
              </span>
              <span className="px-1.5 text-xs text-zinc-600">{pages} {pages === 1 ? "page" : "pages"}</span>
            </>
          )}
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
        </div>
      </header>

      {status === "conflict" && doc && (
        <div role="alert" className="flex flex-none flex-wrap items-center gap-x-4 gap-y-3 border-b border-amber-200 bg-amber-50 py-3 pl-5 pr-4">
          <div className="flex min-w-[320px] flex-1 items-start gap-2.5">
            <AlertTriangle aria-hidden className="mt-px size-[18px] flex-none text-amber-700" />
            <div className="flex flex-col gap-0.5 text-[13px]">
              <span className="font-semibold text-amber-950">{title(doc.handle)} changed on disk</span>
              <span className="text-amber-800">Another device or app saved this script while you had unsaved edits. Autosave is paused until you choose.</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={loadDisk}>Load disk version</Button>
            <Button size="sm" variant="outline" onClick={keepCopy}>Save mine as a copy</Button>
            <Button size="sm" onClick={keepMine}>Keep mine</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="flex-none border-b border-red-200 bg-red-50 px-5 py-3 text-[13px] text-red-900">{error}</p>}

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] flex-none flex-col gap-[22px] overflow-y-auto border-r border-[#E4E4E2] bg-[#FAFAF9] px-3 py-4 md:flex">
          <nav aria-label="Scripts" className="flex flex-col gap-0.5">
            <span className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Scripts</span>
            {scripts.map((f) => {
              const active = doc?.handle.name === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => open(f)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2 text-left text-[13px] ${active ? "bg-white font-medium text-zinc-900 shadow-[0_0_0_1px_#E4E4E2,0_1px_2px_rgba(16,16,20,0.04)]" : "text-zinc-700 hover:bg-white"}`}
                >
                  <FileText aria-hidden className={`size-[15px] flex-none ${active ? "text-zinc-700" : "text-zinc-500"}`} />
                  <span className="truncate">{title(f)}</span>
                  {unsavedName === f.name && <span aria-label="Not saved" className="ml-auto size-[7px] flex-none rounded-full bg-red-600" />}
                </button>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">
          {doc && <Editor key={doc.key} initial={doc.text} paper={paper} onChange={onChange} onPages={setPages} />}
        </main>
      </div>
    </div>
  );
}
