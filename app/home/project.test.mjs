// Run: node --test app/home/project.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProject, nameError, projectError } from "./project.ts";

const notFound = () => Object.assign(new Error("not found"), { name: "NotFoundError" });

// Minimal in-memory stand-in for FileSystemDirectoryHandle.
function dir() {
  const entries = new Map();
  return {
    entries,
    async getDirectoryHandle(name, opts) {
      if (!entries.has(name)) {
        if (!opts?.create) throw notFound();
        entries.set(name, dir());
      }
      return entries.get(name);
    },
    async getFileHandle(name, opts) {
      if (!entries.has(name)) {
        if (!opts?.create) throw notFound();
        entries.set(name, { text: "" });
      }
      const f = entries.get(name);
      return {
        async getFile() { return { text: async () => f.text }; },
        async createWritable() {
          let buf = "";
          return { write: async (t) => { buf += t; }, close: async () => { f.text = buf; } };
        },
      };
    },
  };
}

test("nameError", () => {
  assert.equal(nameError("Heist"), null);
  assert.ok(nameError("  "));
  assert.ok(nameError("a/b"));
  assert.ok(nameError(".."));
});

test("createProject writes the folder layout and opens cleanly", async () => {
  const parent = dir();
  const p = await createProject(parent, " Heist ");
  assert.equal(parent.entries.get("Heist"), p);
  assert.equal(p.entries.get("project.json").text, '{"version":1}\n');
  assert.equal(p.entries.get("scripts").entries.get("Heist.fountain").text, "");
  assert.ok(p.entries.get("characters").entries instanceof Map);
  assert.equal(await projectError(p), null);
  await assert.rejects(createProject(parent, "Heist"), /already exists/);
});

test("projectError rejects folders that are not projects", async () => {
  const d = dir();
  assert.match(await projectError(d), /no project.json/);
  const write = async (t) => { const w = await (await d.getFileHandle("project.json", { create: true })).createWritable(); await w.write(t); await w.close(); };
  await write("{oops");
  assert.match(await projectError(d), /not valid JSON/);
  await write('{"version":2}');
  assert.match(await projectError(d), /newer version/);
  await write("{}");
  assert.match(await projectError(d), /no valid version/);
});
