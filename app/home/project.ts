// Create and open project folders (docs/0003-project-format.md decision 1).

export const FORMAT_VERSION = 1;

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;

/** Error message for an invalid project name, or null when the name is fine. */
export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Enter a project name.";
  if (INVALID_CHARS.test(name) || name === "." || name === "..") return 'A name can\'t contain \\ / : * ? " < > |';
  return null;
}

async function has(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch (e) {
    const err = e as DOMException;
    if (err.name === "NotFoundError") return false;
    if (err.name === "TypeMismatchError") return true; // a file with that name
    throw e;
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(text);
  await w.close();
}

/** Creates `<name>/` inside `parent` with project.json, scripts/<name>.fountain and characters/. */
export async function createProject(parent: FileSystemDirectoryHandle, raw: string): Promise<FileSystemDirectoryHandle> {
  const error = nameError(raw);
  if (error) throw new Error(error);
  const name = raw.trim();
  if (await has(parent, name)) throw new Error(`"${name}" already exists in this folder. Choose another name.`);
  const dir = await parent.getDirectoryHandle(name, { create: true });
  await writeText(dir, "project.json", JSON.stringify({ version: FORMAT_VERSION }) + "\n");
  const scripts = await dir.getDirectoryHandle("scripts", { create: true });
  await writeText(scripts, `${name}.fountain`, "");
  await dir.getDirectoryHandle("characters", { create: true });
  return dir;
}

/** Error message when `dir` is not a project this app can open, or null when it is. */
export async function projectError(dir: FileSystemDirectoryHandle): Promise<string | null> {
  let text: string;
  try {
    text = await (await (await dir.getFileHandle("project.json")).getFile()).text();
  } catch (e) {
    if ((e as DOMException).name === "NotFoundError") return "Not a project folder. It has no project.json.";
    throw e;
  }
  let version: unknown;
  try {
    version = (JSON.parse(text) as { version?: unknown }).version;
  } catch {
    return "project.json is not valid JSON.";
  }
  if (!Number.isInteger(version) || (version as number) < 1) return "project.json has no valid version.";
  if ((version as number) > FORMAT_VERSION) return "Made by a newer version of the app. Reload to update.";
  return null;
}
