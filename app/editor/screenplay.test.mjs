// Run: node --test app/editor/screenplay.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, paginate, wrap } from "./screenplay.ts";

test("classify", () => {
  const kinds = classify("INT. KITCHEN - NIGHT\n\nJohn eats.\n\nJOHN\n(quiet)\nHello.\n\nCUT TO:\n").map((l) => l.kind);
  assert.deepEqual(kinds, ["scene", "blank", "action", "blank", "character", "parenthetical", "dialogue", "blank", "transition", "blank"]);
});

test("wrap breaks at spaces", () => {
  // break-spaces: "aaa bbb " needs 8 chars because the trailing space takes width
  assert.deepEqual(wrap("aaa bbb ccc", 7), [0, 4]); // "bbb ccc" then fits in 7
  assert.deepEqual(wrap("aaa bbb ccc", 8), [0, 8]);
  assert.deepEqual(wrap("short", 35), [0]);
});

test("speech splits at a sentence end with MORE / CONT'D", () => {
  const filler = Array(50).fill("x").join("\n"); // 50 one-line action lines
  const speech = "\n\nJOHN\n" + "One two three four five six. ".repeat(10).trim();
  const { breaks } = paginate(classify(filler + speech));
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].mid, true);
  assert.equal(breaks[0].more, "JOHN");
  // 50 action + blank = 51 used, 4 left: JOHN + 2 dialogue lines + (MORE), filler 0
  assert.equal(breaks[0].filler, 0);
});

test("scene heading is never the last line on a page", () => {
  const doc = Array(53).fill("x").join("\n") + "\n\nINT. HOUSE - DAY\n\nAction line.";
  const lines = classify(doc);
  const { breaks } = paginate(lines);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].pos, lines.find((l) => l.kind === "scene").from);
});

test("blank lines past a full page are hidden, not counted", () => {
  const doc = Array(55).fill("x").join("\n") + "\n\nINT. HOUSE - DAY\n\nAction line.";
  const lines = classify(doc);
  const { breaks, hidden } = paginate(lines);
  assert.deepEqual(hidden, [lines[55].from]);
  assert.equal(breaks[0].filler, 0);
});
