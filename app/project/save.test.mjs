// Run: node --test app/project/save.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictError, readFile, saveCopy, saveFile } from "./save.ts";

let clock = 1000;
const notFound = () => Object.assign(new Error("not found"), { name: "NotFoundError" });

function file(text = "") {
  const f = { text, lastModified: clock++ };
  return {
    f,
    async getFile() { return { text: async () => f.text, lastModified: f.lastModified }; },
    async createWritable() {
      let buf = "";
      return { write: async (t) => { buf += t; }, close: async () => { f.text = buf; f.lastModified = clock++; } };
    },
  };
}

function dir() {
  const files = new Map();
  return {
    files,
    async getFileHandle(name, opts) {
      if (!files.has(name)) {
        if (!opts?.create) throw notFound();
        files.set(name, file());
      }
      return files.get(name);
    },
  };
}

test("saveFile writes when the file is unchanged and returns the new lastModified", async () => {
  const h = file("old");
  const { text, lastModified } = await readFile(h);
  assert.equal(text, "old");
  const next = await saveFile(h, "new", lastModified);
  assert.equal(h.f.text, "new");
  assert.equal(next, h.f.lastModified);
  assert.notEqual(next, lastModified);
});

test("saveFile refuses when the file changed on disk, and null overwrites", async () => {
  const h = file("old");
  const { lastModified } = await readFile(h);
  await saveFile(h, "from another device", null);
  await assert.rejects(saveFile(h, "mine", lastModified), ConflictError);
  assert.equal(h.f.text, "from another device");
  await saveFile(h, "mine", null);
  assert.equal(h.f.text, "mine");
});

test("saveCopy picks the next free copy name", async () => {
  const d = dir();
  assert.equal(await saveCopy(d, "Heist.fountain", "a"), "Heist (copy).fountain");
  assert.equal(await saveCopy(d, "Heist.fountain", "b"), "Heist (copy 2).fountain");
  assert.equal(d.files.get("Heist (copy 2).fountain").f.text, "b");
});
