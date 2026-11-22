// Run: node --test app/project/character.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCharacter, slug, writeCharacter } from "./character.ts";

// The example from docs/0003-project-format.md decision 2.
const JOHN = `---
name: JOHN
nickname: Johnny
age: 42
occupation: Safecracker
---
Ex-safecracker. Wants out, gets pulled back in.

## Looks & build

### What do people notice first about them?
A scar through the left eyebrow.

### Accent
Glaswegian, softened by years in London.

## Psychology

### What do they want most?
To be left alone.
`;

test("parses the documented example", () => {
  const c = parseCharacter(JOHN);
  assert.deepEqual(c.front, { name: "JOHN", nickname: "Johnny", age: "42", occupation: "Safecracker" });
  assert.equal(c.description, "Ex-safecracker. Wants out, gets pulled back in.");
  assert.equal(c.sections.length, 2);
  assert.deepEqual(c.sections[0], {
    heading: "Looks & build",
    text: "",
    fields: [
      { heading: "What do people notice first about them?", text: "A scar through the left eyebrow." },
      { heading: "Accent", text: "Glaswegian, softened by years in London." },
    ],
  });
});

test("writes the documented example back unchanged", () => {
  assert.equal(writeCharacter(parseCharacter(JOHN)), JOHN);
  assert.equal(writeCharacter(parseCharacter(JOHN.replace(/\n/g, "\r\n"))), JOHN);
});

test("leaves out empty values and empty sections", () => {
  const out = writeCharacter({
    front: { name: "MARIA", age: "", gender: "  " },
    description: "",
    sections: [
      { heading: "Style & dress", text: "", fields: [{ heading: "Q", text: " " }] },
      { heading: "Personality", text: "", fields: [{ heading: "Q", text: "Calm." }, { heading: "R", text: "" }] },
    ],
  });
  assert.equal(out, "---\nname: MARIA\n---\n\n## Personality\n\n### Q\nCalm.\n");
});

test("keeps text the app does not write itself", () => {
  const raw = `---
name: ANA
tags:
  - lead
  - pilot
aliases: [A, Annie]
---
First paragraph.

Second paragraph.

### Loose question
Before any section.

## Personality

Intro under the section.

### Temper
Short.

#### Deeper heading
Still part of the answer.
`;
  const c = parseCharacter(raw);
  assert.equal(c.front.tags, "\n  - lead\n  - pilot");
  assert.equal(c.front.aliases, "[A, Annie]");
  assert.match(c.description, /Second paragraph\.\n\n### Loose question\nBefore any section\.$/);
  assert.equal(c.sections[0].text, "Intro under the section.");
  assert.equal(c.sections[0].fields[0].text, "Short.\n\n#### Deeper heading\nStill part of the answer.");
  assert.equal(writeCharacter(c), raw);
});

test("a file without front matter is all body", () => {
  const c = parseCharacter("Just a note.\n\n## Psychology\n\n### Fear\nWater.\n");
  assert.deepEqual(c.front, {});
  assert.equal(c.description, "Just a note.");
  assert.equal(c.sections[0].fields[0].text, "Water.");
});

test("slug", () => {
  assert.equal(slug("JOHN"), "john");
  assert.equal(slug("Guard 1"), "guard-1");
  assert.equal(slug("  Mrs. O'Neil "), "mrs-o-neil");
  assert.equal(slug("அருண் குமார்"), "அருண்-குமார்");
  assert.equal(slug("???"), "character");
});
