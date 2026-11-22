// Recent projects in IndexedDB (docs/0002-storage-byos.md decision 4).
// Holds folder handles only, never file contents.

export type Recent = { id: number; name: string; handle: FileSystemDirectoryHandle; openedAt: number };

const STORE = "recent";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("write-script", 1);
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

export async function listRecent(): Promise<Recent[]> {
  const all = await run<Recent[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.openedAt - a.openedAt);
}

/** Adds the folder, or moves it to the top when it is already in the list. */
export async function touchRecent(handle: FileSystemDirectoryHandle): Promise<void> {
  for (const r of await listRecent()) {
    if (await r.handle.isSameEntry(handle)) {
      await run("readwrite", (s) => s.put({ ...r, name: handle.name, handle, openedAt: Date.now() }));
      return;
    }
  }
  await run("readwrite", (s) => s.add({ name: handle.name, handle, openedAt: Date.now() }));
}

export async function removeRecent(id: number): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}
