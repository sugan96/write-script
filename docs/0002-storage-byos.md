# 0002: Storage: bring your own storage

- Status: accepted
- Date: 2026-11-22

## Context

The app runs fully in the browser with no backend. Writers keep their work in storage they own and control. The app never holds a copy of a script or character file.

## Decisions

### 1. Local folder through the File System Access API

The writer picks a project folder with `showDirectoryPicker()`. The app reads and writes files in it directly.

- Why: one code path covers every cloud. If the folder is inside Dropbox, iCloud Drive, Google Drive or OneDrive on the writer's computer, the provider's desktop client syncs it. No OAuth, no API keys, no per-provider code.
- Later: Google Drive through its API with OAuth PKCE in the browser. It reaches the browsers that decision 2 blocks.

### 2. Desktop Chromium only at launch

Chrome, Edge, Opera, Vivaldi and Arc on desktop are supported. Other browsers see a message that names the supported browsers.

Blocked until Google Drive support ships:

- Firefox: Mozilla will not implement `showDirectoryPicker`.
- Safari on Mac, and every browser on iPhone and iPad (they all use WebKit).
- Chrome on Android: no directory picker.
- Brave: turns the API off by default (`brave://flags` turns it on).

Detection is a feature check (`"showDirectoryPicker" in window`), not a browser name check.

- Why: a fallback based on the Origin Private File System (OPFS) plus zip import and export was considered and rejected. OPFS data lives inside the browser, can be evicted or cleared with site data, and is weaker than real BYOS. Google Drive is the planned route to other browsers. OPFS gives the same directory handle type, so it can still be added later without changing the save code.

### 3. Autosave with a conflict check

- When: 1 second after typing stops, when the tab is hidden or closed, and on Cmd+S. Each file saves on its own, so editing one character only writes that character's file.
- Before every write: compare the file's `lastModified` with the value from the last read or write. If it differs, do not write. Stop autosave for that file and show a banner with three choices: **Load disk version**, **Keep mine (overwrite)**, **Save mine as a copy**.
- On window focus: check open files. A file changed on disk with no unsaved edits in the app reloads silently. A file changed on disk with unsaved edits shows the same banner.
- Writes use `createWritable()`, which writes to a temporary file and replaces the real file on `close()`. A crash during a write leaves the old file intact.
- Why: the File System Access API has no reliable cross-browser change event, so the app checks `lastModified` itself. A conflict happens only when two places edit the same file, so the banner is rare. Line-by-line merge is not built; "Save mine as a copy" means nothing is lost.

### 4. IndexedDB holds convenience state only

IndexedDB lives in the writer's browser profile on their own computer. It is per origin, is not synced by the browser, and is cleared when the writer clears site data. It holds:

- Recent projects: folder handles, project names and last-opened dates. Clicking one asks for permission again if the browser needs it. A folder that was moved or deleted shows "Not found" with a Remove button.
- Drafts of unsaved edits, for crash protection. A draft is deleted once the file save succeeds.

It is never the source of truth. If it is wiped, the writer loses the recent list and at most the last second of edits. The project folder is unaffected.

- Note: a different origin means different storage. `localhost` during development and the production domain do not share it, and moving the app to a new domain leaves recent lists and drafts behind.

### 5. Static build on Cloudflare Pages

The app is built with Next.js `output: 'export'` and served by Cloudflare Pages as static files.

- Why: the build fails on server features (Server Actions, cookies, request-based route handlers, dynamic routes without `generateStaticParams`), so a backend cannot be added by accident.
- One page, no dynamic routes. The open project is client state; a folder handle has no meaningful URL.
- Security headers (including the Content-Security-Policy needed once Google Drive OAuth arrives) go in Cloudflare's `_headers` file, because Next's `headers()` config does not work with static export.
- `cacheComponents` and `partialPrefetching` in `next.config.ts` are checked against static export at build time and removed if they conflict.
