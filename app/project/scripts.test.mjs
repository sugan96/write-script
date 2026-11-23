// Run: node --test app/project/scripts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { byName, scriptNameError } from "./scripts.ts";

test("refuses empty, forbidden characters and taken names ignoring case", () => {
  assert.ok(scriptNameError("  ", []));
  assert.ok(scriptNameError("a/b", []));
  assert.equal(scriptNameError(" heist ", ["Heist"]), "A script called Heist already exists.");
  assert.equal(scriptNameError("Heist 2", ["Heist"]), null);
});

test("sorts names with numbers in order", () => {
  assert.deepEqual(["Heist 10", "Heist 2", "Heist"].sort(byName), ["Heist", "Heist 2", "Heist 10"]);
});
