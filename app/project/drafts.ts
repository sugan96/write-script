// Unsaved edits kept in IndexedDB for crash protection (docs/0002-storage-byos.md decisions 3 and 4).
// A draft is deleted once the file save succeeds.

export type Draft = { id: number; handle: FileSystemFileHandle; text: string; base: number };

const STORE = "drafts";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("write-script-drafts", 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function findDraft(handle: FileSystemFileHandle): Promise<Draft | null> {
  for (const d of await run<Draft[]>("readonly", (s) => s.getAll())) if (await d.handle.isSameEntry(handle)) return d;
  return null;
}

/** `base` is the file's lastModified when the unsaved edits started. */
export async function putDraft(handle: FileSystemFileHandle, text: string, base: number): Promise<void> {
  const old = await findDraft(handle);
  await run("readwrite", (s) => s.put(old ? { ...old, text, base } : { handle, text, base }));
}

export async function deleteDraft(handle: FileSystemFileHandle): Promise<void> {
  const old = await findDraft(handle);
  if (old) await run("readwrite", (s) => s.delete(old.id));
}
