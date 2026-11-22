"use client";

// Home page: recent projects, new project, open folder (design: docs/design/home/).
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Cloud, FileText, Folder, FolderX, Lock, MoreHorizontal, Monitor, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject, nameError, projectError } from "./project";
import { listRecent, removeRecent, touchRecent, type Recent } from "./recent";

type Status = "ready" | "needs-access" | "missing";
type Row = Recent & { status: Status; opened: string };

const SCRIPT_FONT = "font-[family-name:var(--font-script)]";
const RW = { mode: "readwrite" } as const;

// null on the server (static build), then the real answer in the browser.
const noop = () => () => {};
function useSupported(): boolean | null {
  return useSyncExternalStore(noop, () => "showDirectoryPicker" in window, () => null);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
function ago(t: number): string {
  const s = (t - Date.now()) / 1000;
  for (const [unit, n] of UNITS) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "just now";
}

async function statusOf(handle: FileSystemDirectoryHandle): Promise<Status> {
  if ((await handle.queryPermission(RW)) !== "granted") return "needs-access";
  try {
    await handle.getFileHandle("project.json");
    return "ready";
  } catch {
    return "missing";
  }
}

async function loadRows(): Promise<Row[]> {
  const recent = await listRecent();
  return Promise.all(recent.map(async (r) => ({ ...r, status: await statusOf(r.handle), opened: ago(r.openedAt) })));
}

const isAbort =(e: unknown) => (e as DOMException)?.name === "AbortError";

export function Home() {
  const supported = useSupported();
  if (supported === null) return null;
  return (
    <div className="min-h-screen bg-[#FAFAF9] text-zinc-900">
      <Header />
      {supported ? <Projects /> : <Unsupported />}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#EBEBE9] bg-white">
      <div className="mx-auto flex h-15 max-w-[1120px] items-center justify-between gap-4 px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-[7px] bg-zinc-900">
            <FileText aria-hidden className="size-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Write Script</span>
        </div>
        <div className="hidden items-center gap-2 text-[13px] text-zinc-600 sm:flex">
          <Lock aria-hidden className="size-[15px]" />
          Files stay on your computer
        </div>
      </div>
    </header>
  );
}

function Projects() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<FileSystemDirectoryHandle | null>(null);

  const load = async () => setRows(await loadRows());

  useEffect(() => {
    loadRows().then(setRows, (e) => setError(`Could not read recent projects: ${(e as Error).message}`));
  }, []);

  const open = async (handle: FileSystemDirectoryHandle) => {
    setError(null);
    try {
      if ((await handle.queryPermission(RW)) !== "granted" && (await handle.requestPermission(RW)) !== "granted") return;
      const problem = await projectError(handle);
      if (problem) {
        setError(`${handle.name}: ${problem}`);
        await load();
        return;
      }
      await touchRecent(handle);
      setOpened(handle);
    } catch (e) {
      setError(`${handle.name}: ${(e as Error).message}`);
      await load();
    }
  };

  const openFolder = async () => {
    try {
      await open(await window.showDirectoryPicker({ ...RW, id: "open-project" }));
    } catch (e) {
      if (!isAbort(e)) setError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    await removeRecent(id);
    await load();
  };

  // ponytail: placeholder until the project screen exists (build step 3).
  if (opened) {
    return (
      <main className="mx-auto flex max-w-[1120px] flex-col items-start gap-4 px-8 py-14">
        <h1 className={`${SCRIPT_FONT} text-3xl font-bold`}>{opened.name}</h1>
        <p className="text-zinc-600">Project opened. The project screen comes next.</p>
        <Button variant="outline" onClick={() => { setOpened(null); void load(); }}>Back to projects</Button>
      </main>
    );
  }

  if (rows === null) return null;

  return (
    <>
      {rows.length === 0 ? (
        <Empty onNew={() => setCreating(true)} onOpen={openFolder} />
      ) : (
        <main className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 pb-16 pt-14">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[30px] font-semibold tracking-tight">Projects</h1>
              <p className="text-[15px] text-zinc-600">Recent projects on this computer.</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="outline" className="h-10" onClick={openFolder}><Folder aria-hidden />Open folder</Button>
              <Button className="h-10" onClick={() => setCreating(true)}><Plus aria-hidden />New project</Button>
            </div>
          </div>
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
            <li className="flex">
              <button type="button" onClick={() => setCreating(true)} className="flex min-h-[268px] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#D4D4D1] p-6 text-zinc-700 hover:border-zinc-400 hover:bg-white">
                <span className="flex size-10 items-center justify-center rounded-full border border-[#E4E4E2] bg-white shadow-xs"><Plus aria-hidden className="size-[18px]" /></span>
                <span className="text-sm font-semibold text-zinc-900">New project</span>
                <span className="text-[13px] text-zinc-600">Create a folder for a new script</span>
              </button>
            </li>
            {rows.map((r) => (
              <ProjectCard key={r.id} row={r} onOpen={() => open(r.handle)} onRemove={() => remove(r.id)} />
            ))}
          </ul>
          <p className="border-t border-[#EBEBE9] pt-2 text-[13px] text-zinc-600">Each project is a folder on your computer. This list is kept only in this browser.</p>
        </main>
      )}
      {rows.length === 0 && error && (
        <div className="mx-auto max-w-[560px] px-6"><ErrorBanner message={error} onClose={() => setError(null)} /></div>
      )}
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={async (handle) => {
          setCreating(false);
          await touchRecent(handle);
          setOpened(handle);
        }}
      />
    </>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose} className="cursor-pointer rounded p-0.5 text-red-800 hover:bg-red-100"><X aria-hidden className="size-4" /></button>
    </div>
  );
}

function PagePreview() {
  const bar = "h-[3px] rounded-sm bg-[#D4D4D1]";
  return (
    <div className="flex h-[168px] items-end justify-center border-b border-[#EDEDEB] bg-[#F4F4F2]">
      <div aria-hidden className="flex h-[150px] w-[132px] flex-col gap-1.5 rounded-t-[3px] bg-white pl-[18px] pr-3.5 pt-4 shadow-[0_0_0_1px_rgba(16,16,20,0.06),0_6px_16px_rgba(16,16,20,0.08)]">
        <div className="h-1 w-[62px] rounded-sm bg-zinc-700" />
        <div className={`${bar} w-[92px]`} />
        <div className={`${bar} w-20`} />
        <div className="ml-[34px] mt-1.5 h-[3px] w-7 rounded-sm bg-zinc-500" />
        <div className={`${bar} ml-[18px] w-14`} />
        <div className={`${bar} ml-[18px] w-12`} />
        <div className={`${bar} mt-1.5 w-[88px]`} />
      </div>
    </div>
  );
}

function ProjectCard({ row, onOpen, onRemove }: { row: Row; onOpen: () => void; onRemove: () => void }) {
  if (row.status === "missing") {
    return (
      <li className="flex flex-col overflow-hidden rounded-xl border border-[#E8E8E6] bg-white">
        <div className="flex h-[168px] items-center justify-center border-b border-[#EDEDEB] bg-[#FAFAF9] text-zinc-400"><FolderX aria-hidden className="size-10" strokeWidth={1.5} /></div>
        <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
          <div className="flex flex-col gap-1">
            <span className={`${SCRIPT_FONT} text-base font-bold text-zinc-500`}>{row.name}</span>
            <span className="text-[13px] text-zinc-600">Opened {row.opened}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800">Folder not found</span>
            <Button variant="outline" size="sm" onClick={onRemove}>Remove</Button>
          </div>
        </div>
      </li>
    );
  }
  return (
    <li className="relative flex flex-col overflow-hidden rounded-xl border border-[#E8E8E6] bg-white shadow-[0_1px_2px_rgba(16,16,20,0.04),0_4px_12px_rgba(16,16,20,0.04)] hover:border-zinc-300">
      <button type="button" onClick={onOpen} className="flex cursor-pointer flex-col text-left">
        <PagePreview />
        <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
          <div className="flex flex-col gap-1">
            <span className={`${SCRIPT_FONT} text-base font-bold`}>{row.name}</span>
            <span className="text-[13px] text-zinc-600">Opened {row.opened}</span>
          </div>
          {row.status === "needs-access" && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-200 bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              <Lock aria-hidden className="size-3" />Click to allow access
            </span>
          )}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for ${row.name}`} className="absolute right-2 top-2 size-8 bg-white/90 text-zinc-600">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onRemove}>Remove from list</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function Empty({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }) {
  const points = [
    { icon: FileText, title: "Plain Fountain files", text: "Open them in any screenwriting app." },
    { icon: Cloud, title: "Sync with your cloud", text: "Use a Dropbox, iCloud or Drive folder." },
    { icon: Lock, title: "No account needed", text: "Nothing is stored on our servers." },
  ];
  return (
    <main className="mx-auto flex max-w-[560px] flex-col items-center gap-7 px-6 py-18 text-center">
      <div aria-hidden className="relative h-[120px] w-[150px]">
        <div className="absolute left-[22px] top-2.5 h-[110px] w-[92px] -rotate-6 rounded bg-[#F4F4F2] shadow-[0_0_0_1px_rgba(16,16,20,0.06)]" />
        <div className="absolute left-9 top-1 flex h-28 w-[92px] flex-col gap-1.5 rounded bg-white px-3 py-3.5 shadow-[0_0_0_1px_rgba(16,16,20,0.07),0_10px_24px_rgba(16,16,20,0.10)]">
          <div className="h-1 w-11 rounded-sm bg-zinc-700" />
          <div className="h-[3px] w-16 rounded-sm bg-[#D4D4D1]" />
          <div className="ml-6 mt-1 h-[3px] w-[22px] rounded-sm bg-zinc-500" />
          <div className="ml-3 h-[3px] w-10 rounded-sm bg-[#D4D4D1]" />
          <div className="mt-1 h-[3px] w-[58px] rounded-sm bg-[#D4D4D1]" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[30px] font-semibold tracking-tight">Write your first screenplay</h1>
        <p className="text-base leading-relaxed text-zinc-600">A project is a folder on your computer. Your scripts and character sheets live there as plain files you own.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button className="h-11 px-[18px] text-[15px]" onClick={onNew}><Plus aria-hidden />New project</Button>
        <Button variant="outline" className="h-11 px-4 text-[15px]" onClick={onOpen}><Folder aria-hidden />Open existing folder</Button>
      </div>
      <ul className="mt-2 grid w-full grid-cols-1 gap-4 border-t border-[#EBEBE9] pt-5 text-left sm:grid-cols-3">
        {points.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col gap-1.5">
            <Icon aria-hidden className="size-[18px] text-zinc-700" />
            <span className="text-[13px] font-semibold">{title}</span>
            <span className="text-[13px] leading-normal text-zinc-600">{text}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (h: FileSystemDirectoryHandle) => void }) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<FileSystemDirectoryHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const invalid = name ? nameError(name) : null;

  const choose = async () => {
    try {
      setParent(await window.showDirectoryPicker({ ...RW, id: "new-project" }));
      setError(null);
    } catch (e) {
      if (!isAbort(e)) setError((e as Error).message);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parent || nameError(name)) return;
    setBusy(true);
    setError(null);
    try {
      const handle = await createProject(parent, name);
      setName("");
      setParent(null);
      onCreated(handle);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tree = trimmed && !invalid ? [`${parent?.name ?? "…"}/${trimmed}/`, "project.json", `scripts/${trimmed}.fountain`, "characters/"] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]">
        <form onSubmit={create}>
          <DialogHeader className="px-6 pt-6 text-left">
            <DialogTitle className="text-lg">New project</DialogTitle>
            <DialogDescription>A folder for your scripts and character sheets.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-[18px] px-6 pb-6 pt-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="np-name">Project name</Label>
              <Input id="np-name" className="h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Heist" autoFocus aria-invalid={!!invalid} aria-describedby={invalid ? "np-name-error" : undefined} />
              {invalid && <p id="np-name-error" className="text-[13px] text-red-700">{invalid}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <span id="np-loc" className="text-sm font-medium">Location</span>
              <div className="flex h-10 items-center gap-2.5 rounded-md border border-[#E4E4E2] pl-3 pr-1">
                <Folder aria-hidden className="size-4 text-zinc-600" />
                <span className={`flex-1 truncate text-[15px] ${parent ? "" : "text-zinc-500"}`}>{parent ? parent.name : "No folder chosen"}</span>
                <Button type="button" variant="outline" size="sm" className="h-[30px]" aria-describedby="np-loc" onClick={choose}>{parent ? "Change" : "Choose"}</Button>
              </div>
            </div>
            {tree && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-[#EDEDEB] bg-[#FAFAF9] px-3.5 py-3">
                <span className="text-xs font-semibold text-zinc-600">Will be created</span>
                <ul className={`${SCRIPT_FONT} flex flex-col gap-1 text-[13px] text-zinc-800`}>
                  {tree.map((line, i) => {
                    const Icon = line.endsWith("/") ? Folder : FileText;
                    return (
                      <li key={line} className={`flex items-center gap-2 ${i ? "pl-[22px]" : ""}`}><Icon aria-hidden className="size-3.5 text-zinc-500" />{line}</li>
                    );
                  })}
                </ul>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>
          <DialogFooter className="border-t border-[#EDEDEB] bg-[#FAFAF9] px-6 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !parent || !trimmed || !!invalid}>{busy ? "Creating…" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Unsupported() {
  const browsers = ["Google Chrome", "Microsoft Edge", "Opera, Vivaldi and Arc"];
  return (
    <main className="mx-auto max-w-[520px] px-6 py-18">
      <div className="overflow-hidden rounded-[14px] border border-[#E8E8E6] bg-white shadow-[0_1px_2px_rgba(16,16,20,0.04),0_8px_24px_rgba(16,16,20,0.05)]">
        <div className="flex flex-col gap-4 px-7 pb-6 pt-7">
          <div className="flex size-10 items-center justify-center rounded-[10px] border border-amber-200 bg-yellow-50 text-yellow-800"><Monitor aria-hidden className="size-5" /></div>
          <div className="flex flex-col gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight">Open Write Script in a desktop browser</h1>
            <p className="text-[15px] leading-relaxed text-zinc-600">Write Script saves your work straight into a folder on your computer. This browser can&apos;t open folders yet.</p>
          </div>
        </div>
        <div className="px-7 pb-6">
          <h2 className="mb-2.5 text-xs font-semibold text-zinc-600">Works in</h2>
          <ul className="rounded-[10px] border border-[#EDEDEB]">
            {browsers.map((b) => (
              <li key={b} className="flex items-center gap-2.5 border-b border-[#EDEDEB] px-3.5 py-2.5 text-sm last:border-b-0"><Check aria-hidden className="size-4 text-green-700" strokeWidth={2.4} />{b}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-[#EDEDEB] bg-[#FAFAF9] px-7 py-4 text-[13px] leading-normal text-zinc-600">
          <p>Using Brave? Turn on File System Access in brave://flags, then reload.</p>
          <p>Firefox, Safari, iPhone, iPad and Android will work once Google Drive support is added.</p>
        </div>
      </div>
    </main>
  );
}
