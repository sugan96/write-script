// File System Access API parts missing from TypeScript's DOM types (Chromium only).

type FsPermissionMode = { mode?: "read" | "readwrite" };

interface FileSystemHandle {
  queryPermission(descriptor?: FsPermissionMode): Promise<PermissionState>;
  requestPermission(descriptor?: FsPermissionMode): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: FsPermissionMode & { id?: string }): Promise<FileSystemDirectoryHandle>;
}
