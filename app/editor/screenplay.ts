// Prototype: Fountain line classification and screenplay pagination.
// Pure functions, no DOM. The editor and (later) PDF export share these.

export type Kind =
  | "blank"
  | "scene"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition";

export type Line = { from: number; text: string; kind: Kind };

// Text width in characters per element (Courier 12pt = 10 chars per inch).
// US Letter 8.5in minus 1.5in left and 1in right margins = 6in = 60 chars.
export const WIDTH: Record<Kind, number> = {
  blank: 60,
  scene: 60,
  action: 60,
  character: 38,
  parenthetical: 25,
  dialogue: 35,
  transition: 60,
};

export const LINES_PER_PAGE = 55;

const SCENE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
const isUpper = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();

export function classify(doc: string): Line[] {
  const texts = doc.split("\n");
  const out: Line[] = [];
  let from = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i].trim();
    const prev = out[i - 1]?.kind ?? "blank";
    const nextBlank = (texts[i + 1] ?? "").trim() === "";
    let kind: Kind;
    if (t === "") kind = "blank";
    else if (t.startsWith("!")) kind = "action";
    else if (prev === "character" || prev === "parenthetical" || prev === "dialogue")
      kind = t.startsWith("(") ? "parenthetical" : "dialogue";
    else if (prev !== "blank") kind = "action";
    else if (SCENE.test(t) || /^\.[^.]/.test(t)) kind = "scene";
    else if (t.startsWith(">") && !t.endsWith("<")) kind = "transition";
    else if (isUpper(t) && t.endsWith("TO:") && nextBlank) kind = "transition";
    else if (t.startsWith("@") || (isUpper(t) && !nextBlank)) kind = "character";
    else kind = "action";
    out.push({ from, text: texts[i], kind });
    from += texts[i].length + 1;
  }
  return out;
}

// Greedy word wrap at a fixed width. Matches how the browser wraps monospace
// text with `white-space: break-spaces` (what CodeMirror uses): a trailing
// space takes up width. Returns the start offset of each visual line.
export function wrap(text: string, width: number): number[] {
  const starts = [0];
  let start = 0;
  while (text.length - start > width) {
    const space = text.slice(start, start + width).lastIndexOf(" ");
    start = space > 0 ? start + space + 1 : start + width;
    starts.push(start);
  }
  return starts;
}

const height = (l: Line) => wrap(l.text, WIDTH[l.kind]).length;
const blockHeight = (b: Line[]) => b.reduce((n, l) => n + height(l), 0);

export type Break = {
  pos: number; // doc offset where the new page starts
  mid: boolean; // true: split inside a line at a sentence end; pos is the space to hide
  filler: number; // empty lines left at the bottom of the page that ends here
  page: number; // number of the page that starts here
  more?: string; // character name, when dialogue continues on the next page
};

// A speech (character + parentheticals + dialogue) is one block; every other line is its own block.
function group(lines: Line[]): Line[][] {
  const blocks: Line[][] = [];
  for (const l of lines) {
    const last = blocks[blocks.length - 1];
    if (last && (l.kind === "parenthetical" || l.kind === "dialogue")) last.push(l);
    else blocks.push([l]);
  }
  return blocks;
}

type Split = { pos: number; before: number; after: number; more?: string };

// Split a block at the last sentence end that fits in `remaining` lines.
// ponytail: only splits at sentence ends inside a line; splitting between two
// dialogue lines that end with a period is not handled yet.
function trySplit(block: Line[], remaining: number): Split | null {
  const speech = block[0].kind === "character";
  if (!speech && block[0].kind !== "action") return null;
  const more = speech ? block[0].text.trim().replace(/^@/, "").replace(/\s*\(CONT'D\)$/i, "") : undefined;
  const reserve = speech ? 1 : 0; // the (MORE) line
  for (let i = block.length - 1; i >= (speech ? 1 : 0); i--) {
    const line = block[i];
    if (line.kind === "parenthetical") continue;
    const ends = [...line.text.matchAll(/[.!?]["')]?( )/g)].map((m) => m.index! + m[0].length - 1);
    for (let e = ends.length - 1; e >= 0; e--) {
      const idx = ends[e];
      const head = line.text.slice(0, idx);
      const tail = line.text.slice(idx + 1);
      if (tail.trim() === "") continue;
      const before = blockHeight(block.slice(0, i)) + wrap(head, WIDTH[line.kind]).length;
      const after = wrap(tail, WIDTH[line.kind]).length + blockHeight(block.slice(i + 1));
      if (before + reserve <= remaining && before >= 2) return { pos: line.from + idx, before, after, more };
    }
  }
  return null;
}

// `hidden`: blank lines that fall past the end of a full page. A printed
// screenplay drops them, so the editor hides them too.
export function paginate(lines: Line[], perPage = LINES_PER_PAGE): { breaks: Break[]; hidden: number[] } {
  const blocks = group(lines);
  const breaks: Break[] = [];
  const hidden: number[] = [];
  let used = 0;
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const first = block[0];
    if (first.kind === "blank") {
      if (used < perPage) used++;
      else hidden.push(first.from);
      continue;
    }
    const h = blockHeight(block);
    // Keep a scene heading on the same page as the first 2 lines of what follows it.
    let need = h;
    if (first.kind === "scene" && blocks[b + 1]?.[0].kind === "blank" && blocks[b + 2])
      need += 1 + Math.min(2, blockHeight(blocks[b + 2]));
    if (used + need <= perPage) {
      used += h;
      continue;
    }
    const remaining = perPage - used;
    const split = trySplit(block, remaining);
    if (split) {
      const extra = split.more ? 1 : 0;
      breaks.push({ pos: split.pos, mid: true, filler: remaining - split.before - extra, page: breaks.length + 2, more: split.more });
      used = split.after + extra;
      continue;
    }
    if (used === 0) {
      used = h; // taller than a page and cannot split: let it overflow
      continue;
    }
    breaks.push({ pos: first.from, mid: false, filler: remaining, page: breaks.length + 2 });
    used = h;
  }
  return { breaks, hidden };
}
