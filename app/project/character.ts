// Character file format (docs/0003-project-format.md decisions 2 and 3).

export type Field = { heading: string; text: string };
/** `text` is anything between the `##` heading and the first `###`. The app does not write it, but keeps it. */
export type Section = { heading: string; text: string; fields: Field[] };
export type Character = {
  /** Front matter in file order. Unknown keys are kept as written. */
  front: Record<string, string>;
  /** Everything before the first `##` heading. */
  description: string;
  sections: Section[];
};

const KEY = /^([^\s:#-][^:]*):(.*)$/;

export function parseCharacter(raw: string): Character {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const front: Record<string, string> = {};
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      let last = "";
      for (const line of lines.slice(1, end)) {
        const m = KEY.exec(line);
        if (m) front[(last = m[1].trim())] = m[2].trim();
        // Indented or list lines (nested YAML) stay with the key above, so nothing is lost.
        else if (last && line.trim()) front[last] += "\n" + line;
      }
      start = end + 1;
    }
  }

  // Each heading opens a block; its text is the lines up to the next heading.
  const blocks: { obj: { text: string }; lines: string[] }[] = [];
  const description = { text: "" };
  const sections: Section[] = [];
  let cur: string[] = [];
  blocks.push({ obj: description, lines: cur });
  for (const line of lines.slice(start)) {
    let obj: { text: string } | undefined;
    if (line.startsWith("## ")) {
      const s: Section = { heading: line.slice(3).trim(), text: "", fields: [] };
      sections.push(s);
      obj = s;
    } else if (line.startsWith("### ") && sections.length) {
      const f: Field = { heading: line.slice(4).trim(), text: "" };
      sections[sections.length - 1].fields.push(f);
      obj = f;
    }
    if (obj) blocks.push({ obj, lines: (cur = []) });
    else cur.push(line);
  }
  for (const b of blocks) b.obj.text = b.lines.join("\n").trim();
  return { front, description: description.text, sections };
}

/** Writes only filled-in values, so files stay short. */
export function writeCharacter(c: Character): string {
  const out: string[] = [];
  const front = Object.entries(c.front).filter(([, v]) => v.trim());
  if (front.length) {
    out.push("---");
    for (const [k, v] of front) out.push(v.startsWith("\n") ? `${k}:${v}` : `${k}: ${v}`);
    out.push("---");
  }
  if (c.description.trim()) out.push(c.description.trim());
  for (const s of c.sections) {
    const fields = s.fields.filter((f) => f.text.trim());
    if (!fields.length && !s.text.trim()) continue;
    out.push("", `## ${s.heading}`);
    if (s.text.trim()) out.push("", s.text.trim());
    for (const f of fields) out.push("", `### ${f.heading}`, f.text.trim());
  }
  return out.join("\n").replace(/^\n+/, "") + "\n";
}

/**
 * The character list (decision 0004-5): every character file, plus every name used in a script
 * that has no file. Names match without regard to case. Sorted by name.
 */
export function cast<F extends { name: string }>(files: F[], used: string[]): { name: string; file?: F }[] {
  const byKey = new Map<string, { name: string; file?: F }>();
  for (const file of files) byKey.set(file.name.toUpperCase(), { name: file.name, file });
  for (const name of used) if (!byKey.has(name.toUpperCase())) byKey.set(name.toUpperCase(), { name });
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Filename for a character, without the extension: "Guard 1" -> "guard-1". */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "character";
}
