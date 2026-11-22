// File reads and writes with the conflict check (docs/0002-storage-byos.md decision 3).

export type Loaded = { text: string; lastModified: number };

/** The file changed on disk since we last read or wrote it. */
export class ConflictError extends Error {
  constructor() {
    super("The file changed on disk.");
    this.name = "ConflictError";
  }
}

export async function readFile(handle: FileSystemFileHandle): Promise<Loaded> {
  const file = await handle.getFile();
  return { text: await file.text(), lastModified: file.lastModified };
}

/**
 * Writes `text` only if the file still has the `expected` lastModified (pass null to overwrite).
 * Returns the new lastModified. createWritable() swaps the file in on close(), so a crash keeps the old file.
 * ponytail: check-then-write is not atomic; another writer in the same few milliseconds wins. Fine for one writer per file.
 */
export async function saveFile(handle: FileSystemFileHandle, text: string, expected: number | null): Promise<number> {
  if (expected !== null && (await handle.getFile()).lastModified !== expected) throw new ConflictError();
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
  return (await handle.getFile()).lastModified;
}

/** Writes `text` to "<name> (copy).fountain", or "(copy 2)" and so on if taken. Returns the new file's name. */
export async function saveCopy(dir: FileSystemDirectoryHandle, name: string, text: string): Promise<string> {
  const base = name.replace(/\.fountain$/, "");
  for (let n = 1; ; n++) {
    const copy = `${base} (copy${n > 1 ? ` ${n}` : ""}).fountain`;
    try {
      await dir.getFileHandle(copy);
    } catch (e) {
      if ((e as DOMException).name !== "NotFoundError") throw e;
      await saveFile(await dir.getFileHandle(copy, { create: true }), text, null);
      return copy;
    }
  }
}
