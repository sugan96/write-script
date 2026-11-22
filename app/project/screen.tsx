"use client";

// Project screen: script list, editor, autosave with conflict check (docs/0002-storage-byos.md decision 3,
// docs/0003-project-format.md decision 1).
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import Editor from "../editor/editor";
import { deleteDraft, findDraft, putDraft } from "./drafts";
import { ConflictError, readFile, saveCopy, saveFile } from "./save";

type Status = "saved" | "unsaved" | "saving" | "conflict" | "error";
type Doc = { handle: FileSystemFileHandle; text: string; key: number };

const SCRIPT_FONT = "font-[family-name:var(--font-script)]";
const SAVE_DELAY_MS = 1000;
const LABEL: Record<Status, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  conflict: "Not saved",
  error: "Save failed",
};

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
    listScripts(dir)
      .then(async ({ folder: f, files }) => {
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

  return (
    <div className="flex flex-1 flex-wrap">
      <aside className="flex w-full flex-col gap-4 border-b border-[#EBEBE9] bg-white p-4 md:w-60 md:border-b-0 md:border-r">
        <Button variant="ghost" size="sm" className="self-start text-zinc-600" onClick={back}><ChevronLeft aria-hidden />Projects</Button>
        <h1 className={`${SCRIPT_FONT} px-2 text-lg font-bold`}>{dir.name}</h1>
        <nav aria-label="Scripts" className="flex flex-col gap-1">
          <span className="px-2 text-xs font-semibold text-zinc-500">Scripts</span>
          {scripts.map((s) => {
            const active = doc?.handle.name === s.name;
            return (
              <button key={s.name} type="button" onClick={() => open(s)} aria-current={active ? "page" : undefined} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"}`}>
                <FileText aria-hidden className="size-4 shrink-0 text-zinc-500" />
                <span className="truncate">{title(s)}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-[999_1_560px] flex-col">
        {doc && (
          <div className="flex items-center justify-between gap-4 border-b border-[#EBEBE9] bg-white px-6 py-3">
            <span className={`${SCRIPT_FONT} font-bold`}>{title(doc.handle)}</span>
            <span role="status" className={`text-[13px] ${status === "conflict" || status === "error" ? "text-red-700" : "text-zinc-500"}`}>{LABEL[status]}</span>
          </div>
        )}
        {status === "conflict" && (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-yellow-50 px-6 py-3 text-sm text-yellow-900">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span className="flex-1">This script changed on disk while you had unsaved edits. Autosave is paused.</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={loadDisk}>Load disk version</Button>
              <Button size="sm" variant="outline" onClick={keepCopy}>Save mine as a copy</Button>
              <Button size="sm" onClick={keepMine}>Keep mine</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-900">{error}</p>}
        {doc ? <Editor key={doc.key} initial={doc.text} onChange={onChange} /> : null}
      </section>
    </div>
  );
}
