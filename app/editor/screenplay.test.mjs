// Run: node --test app/editor/screenplay.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAR_PT, LINES_PER_PAGE, LINE_PT, PAGE, PAPERS, WIDTH, classify, cueName, cuePrefix, paginate, renameCharacter, speakers, wrap } from "./screenplay.ts";

test("A4 keeps the 60-character line and fills the page exactly", () => {
  const g = PAPERS.a4;
  const r = (n) => +n.toFixed(2);
  assert.equal(g.lines, 58);
  assert.equal(r(g.right), 55.28);
  assert.equal(r(g.bottom), 73.89);
  assert.equal(r(g.left + 60 * CHAR_PT + g.right), 595.28);
  assert.equal(r(g.top + g.lines * LINE_PT + g.bottom), 841.89);
});

test("paginate reports the lines used on the last page", () => {
  assert.equal(paginate(classify("INT. ROOM - DAY\n\nShe waits.\n")).used, 4);
});

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

test("page geometry adds up to US Letter (11in = 792pt)", () => {
  assert.equal(PAGE.top + LINES_PER_PAGE * LINE_PT + PAGE.bottom, 792);
  assert.equal(PAGE.bottom, 60);
  assert.equal(PAGE.left + WIDTH.action * CHAR_PT + PAGE.right, 612); // 8.5in
});

test("cueName strips @, extensions and the dual-dialogue mark", () => {
  assert.equal(cueName("JOHN (V.O.)"), "JOHN");
  assert.equal(cueName("  JOHN (CONT'D)"), "JOHN");
  assert.equal(cueName("JOHN (ON PHONE)"), "JOHN");
  assert.equal(cueName("@McCLANE (O.S.) ^"), "McCLANE");
  assert.equal(cueName("GUARD 1"), "GUARD 1");
});

test("speakers lists each name once, in first-use order", () => {
  const doc = "INT. VAN - DAY\n\nJOHN\nLate.\n\nMARA (V.O.)\nNo.\n\nJOHN (CONT'D)\nVery.\n\nA GUARD waits.\n";
  assert.deepEqual(speakers(doc), ["JOHN", "MARA"]);
});

test("cuePrefix finds a cue being typed after a blank line", () => {
  assert.deepEqual(cuePrefix("JO", ""), { start: 0, typed: "JO" });
  assert.deepEqual(cuePrefix("@Mc", ""), { start: 1, typed: "Mc" });
  assert.equal(cuePrefix("JO", "She waits."), null); // not after a blank
  assert.equal(cuePrefix("She", ""), null); // action, not capitals
  assert.equal(cuePrefix("JOHN (V", ""), null); // typing an extension
  assert.equal(cuePrefix("", ""), null); // nothing typed
});

test("renameCharacter changes cues and caps mentions in action, whole words only", () => {
  const doc = [
    "INT. JOHN'S FLAT - DAY", // scene heading: untouched
    "",
    "JOHN enters. JOHNSON follows. John waves.",
    "",
    "JOHN (V.O.)",
    "John? JOHN!", // dialogue: untouched
    "",
    "@john ^",
    "Hi.",
    "",
    "MARA",
    "JOHN.", // dialogue: untouched
    "",
  ].join("\n");
  const { text, changes } = renameCharacter(doc, "John", "JACK");
  assert.equal(changes, 3);
  assert.deepEqual(text.split("\n"), [
    "INT. JOHN'S FLAT - DAY",
    "",
    "JACK enters. JOHNSON follows. John waves.",
    "",
    "JACK (V.O.)",
    "John? JOHN!",
    "",
    "@JACK ^",
    "Hi.",
    "",
    "MARA",
    "JOHN.",
    "",
  ]);
});

test("renameCharacter leaves a script without the name unchanged", () => {
  const doc = "MARA\nHello.\n";
  assert.deepEqual(renameCharacter(doc, "JOHN", "JACK"), { text: doc, changes: 0 });
});
