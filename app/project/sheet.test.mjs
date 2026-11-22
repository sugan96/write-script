// Run: node --test app/project/sheet.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { answered, fromForm, hasContent, SECTIONS, toForm } from "./sheet.ts";

const RAW = `---
name: JOHN
age: 42
mood: tense
---
Ex-safecracker.

## Speech & mannerisms

### Accent
Glaswegian.

### Words or phrases they keep using
"Right then."

## Looks & build

### What do people notice first about them?
A scar.

## Weapons

### Favourite
A crowbar.
`;

test("questions match by heading, other headings become custom fields", () => {
  const v = toForm(RAW);
  assert.equal(v.sections.length, SECTIONS.length + 1);
  const speech = v.sections.find((s) => s.heading === "Speech & mannerisms");
  assert.equal(speech.questions[1].text, '"Right then."');
  assert.deepEqual(speech.custom, [{ heading: "Accent", text: "Glaswegian." }]);
  assert.equal(answered(speech), 2);
  assert.deepEqual(v.sections.at(-1), { heading: "Weapons", text: "", questions: [], custom: [{ heading: "Favourite", text: "A crowbar." }] });
  assert.equal(v.front.mood, "tense");
  assert.equal(v.front.nickname, "");
});

test("writes sections in sheet order, keeps unknown keys and sections", () => {
  assert.equal(
    fromForm(toForm(RAW)),
    `---
name: JOHN
age: 42
mood: tense
---
Ex-safecracker.

## Looks & build

### What do people notice first about them?
A scar.

## Speech & mannerisms

### Words or phrases they keep using
"Right then."

### Accent
Glaswegian.

## Weapons

### Favourite
A crowbar.
`,
  );
});

test("a file written by the sheet loads back unchanged", () => {
  const once = fromForm(toForm(RAW));
  assert.equal(fromForm(toForm(once)), once);
});

test("hasContent ignores the name", () => {
  assert.equal(hasContent(toForm("---\nname: GUARD\n---\n")), false);
  assert.equal(hasContent(toForm(RAW)), true);
});
