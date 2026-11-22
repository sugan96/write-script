"use client";

import { useEffect, useRef } from "react";
import { EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { CHAR_PT, LINE_PT, PAPERS, classify, cuePrefix, paginate, type Break, type Geometry, type Paper } from "./screenplay";

// All values are computed here; CSS only gets the final numbers (no calc()).
const pt = (n: number) => `${+n.toFixed(2)}pt`;
const LINE = pt(LINE_PT);
const DIALOGUE_LEFT = 10; // chars
const DIALOGUE_RIGHT = 15; // chars
const DESK = "#EDEDEB"; // background between pages (docs/design/project/project.html)
const GAP_PX = 32;

// Bottom of one page, gap, top of the next. Drawn between lines, or inside a
// line (replacing the space at a sentence end) when dialogue or action splits.
class PageBreak extends WidgetType {
  constructor(
    readonly b: Break,
    readonly g: Geometry,
  ) {
    super();
  }
  eq(o: PageBreak) {
    return o.g === this.g && o.b.filler === this.b.filler && o.b.page === this.b.page && o.b.more === this.b.more && o.b.mid === this.b.mid;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "pb";
    const add = (cls: string, text = "") => {
      const d = el.appendChild(document.createElement("div"));
      d.className = cls;
      d.textContent = text;
      return d;
    };
    if (this.b.more) add("pb-more", "(MORE)");
    add("pb-fill").style.height = pt(this.b.filler * LINE_PT + this.g.bottom);
    add("pb-gap");
    add("pb-top", `${this.b.page}.`);
    if (this.b.more) add("pb-contd", `${this.b.more} (CONT'D)`);
    return el;
  }
}

// Empty lines after the text so the last page is drawn at full paper size.
class LastPageFill extends WidgetType {
  constructor(readonly lines: number) {
    super();
  }
  eq(o: LastPageFill) {
    return o.lines === this.lines;
  }
  toDOM() {
    const el = document.createElement("div");
    el.style.height = pt(this.lines * LINE_PT);
    return el;
  }
}

type Layout = { deco: DecorationSet; pages: number };

function layout(doc: string, g: Geometry): Layout {
  const lines = classify(doc);
  const { breaks, hidden, used } = paginate(lines, g.lines);
  const hide = new Set(hidden);
  const ranges: Range<Decoration>[] = lines.map((l) =>
    Decoration.line({ class: hide.has(l.from) ? "fx-hidden" : `fx-${l.kind}` }).range(l.from),
  );
  for (const b of breaks) {
    const widget = new PageBreak(b, g);
    ranges.push(
      b.mid
        ? Decoration.replace({ widget }).range(b.pos, b.pos + 1)
        : Decoration.widget({ widget, block: true, side: -1 }).range(b.pos),
    );
  }
  if (used < g.lines) ranges.push(Decoration.widget({ widget: new LastPageFill(g.lines - used), block: true, side: 1 }).range(doc.length));
  return { deco: Decoration.set(ranges, true), pages: breaks.length + 1 };
}

// ponytail: re-parses the whole script on every keystroke. Fine while it stays
// under a few ms (measured 1-2 ms for 80 pages); go incremental if typing lags.
function layoutField(g: Geometry) {
  return StateField.define<Layout>({
    create: (s) => layout(s.doc.toString(), g),
    update: (v, tr) => (tr.docChanged ? layout(tr.state.doc.toString(), g) : v),
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
}

function theme(g: Geometry) {
  return EditorView.theme({
    "&": { background: "#fff", color: "#111", boxShadow: "0 0 0 1px rgba(16,16,20,0.06), 0 12px 32px rgba(16,16,20,0.08)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-script), Courier, monospace", fontSize: "12pt" },
    ".cm-content": {
      width: "60ch",
      padding: `${pt(g.top)} ${pt(g.right)} ${pt(g.bottom)} ${pt(g.left)}`,
      boxSizing: "content-box",
    },
    ".cm-line": { padding: "0", lineHeight: LINE },
    ".fx-character": { paddingLeft: "22ch" },
    ".fx-parenthetical": { paddingLeft: "16ch", paddingRight: "19ch" },
    ".fx-dialogue": { paddingLeft: `${DIALOGUE_LEFT}ch`, paddingRight: `${DIALOGUE_RIGHT}ch` },
    ".fx-transition": { textAlign: "right" },
    ".fx-hidden": { height: "0", overflow: "hidden" },
    // CodeMirror's invisible buffers around inline widgets add 2px per side at baseline
    ".cm-line .cm-widgetBuffer": { verticalAlign: "top" },
    ".pb": { display: "block", lineHeight: LINE },
    ".pb-gap": { height: `${GAP_PX}px`, background: DESK, margin: `0 ${pt(-g.right)} 0 ${pt(-g.left)}` },
    ".pb-top": { height: pt(g.top), textAlign: "right", paddingTop: pt(g.top / 2), boxSizing: "border-box" },
    ".pb-contd": { paddingLeft: "22ch" },
    // inside a dialogue line, the widget starts at the dialogue column
    ".fx-dialogue .pb-gap": {
      margin: `0 ${pt(-(g.right + DIALOGUE_RIGHT * CHAR_PT))} 0 ${pt(-(g.left + DIALOGUE_LEFT * CHAR_PT))}`,
    },
    ".fx-dialogue .pb-top": { marginRight: `-${DIALOGUE_RIGHT}ch` },
    ".fx-dialogue .pb-contd": { paddingLeft: `${22 - DIALOGUE_LEFT}ch` },
    // Name suggestions, styled like the app's menus (docs/design/project/).
    ".cm-tooltip.cm-tooltip-autocomplete": { background: "#fff", border: "1px solid #E4E4E2", borderRadius: "8px", padding: "4px", boxShadow: "0 8px 24px rgba(16,16,20,0.08)" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-script), Courier, monospace", fontSize: "13px", minWidth: "160px" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "4px 8px", borderRadius: "5px", color: "#27272A" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "#F4F4F2", color: "#18181B" },
    ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "700" },
  });
}

/** A name to suggest on cue lines; names with a sheet rank first (decision 0004-4). */
export type Suggestion = { name: string; sheet: boolean };

type Props = {
  initial: string;
  paper?: Paper;
  names?: Suggestion[];
  onChange?: (text: string) => void;
  onPages?: (pages: number) => void;
};

export default function Editor({ initial, paper = "a4", names = [], onChange, onPages }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Read through a ref so new names do not rebuild the editor.
  const callbacks = useRef({ onChange, onPages, names });
  useEffect(() => {
    callbacks.current = { onChange, onPages, names };
  });

  useEffect(() => {
    const g = PAPERS[paper];
    const field = layoutField(g);
    const report = (s: EditorState, edited = false) => {
      callbacks.current.onPages?.(s.field(field).pages);
      if (edited) callbacks.current.onChange?.(s.doc.toString());
    };
    const suggest = (ctx: CompletionContext) => {
      const line = ctx.state.doc.lineAt(ctx.pos);
      const prev = line.number > 1 ? ctx.state.doc.line(line.number - 1).text : "";
      const cue = cuePrefix(line.text.slice(0, ctx.pos - line.from), prev);
      if (!cue || (!cue.typed.trim() && !ctx.explicit)) return null;
      const options = callbacks.current.names.map((n) => ({ label: n.name, boost: n.sheet ? 1 : 0 }));
      return { from: line.from + cue.start, options, validFor: /^[^(]*$/ };
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          field,
          autocompletion({ override: [suggest], icons: false }),
          theme(g),
          EditorView.updateListener.of((u) => u.docChanged && report(u.state, true)),
        ],
      }),
    });
    report(view.state);
    return () => view.destroy();
  }, [initial, paper]);

  return (
    <div style={{ background: DESK, padding: "40px 24px 64px" }}>
      <div ref={host} style={{ width: "fit-content", margin: "0 auto" }} />
    </div>
  );
}
