"use client";

import { useEffect, useRef, useState } from "react";
import { EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { CHAR_PT, LINE_PT, PAGE, classify, paginate, type Break } from "./screenplay";

// All values are computed here; CSS only gets the final numbers (no calc()).
const pt = (n: number) => `${+n.toFixed(2)}pt`;
const LINE = pt(LINE_PT);
const DIALOGUE_LEFT = 10; // chars
const DIALOGUE_RIGHT = 15; // chars

// Bottom of one page, gap, top of the next. Drawn between lines, or inside a
// line (replacing the space at a sentence end) when dialogue or action splits.
class PageBreak extends WidgetType {
  constructor(readonly b: Break) {
    super();
  }
  eq(o: PageBreak) {
    return o.b.filler === this.b.filler && o.b.page === this.b.page && o.b.more === this.b.more && o.b.mid === this.b.mid;
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
    add("pb-fill").style.height = pt(this.b.filler * LINE_PT + PAGE.bottom);
    add("pb-gap");
    add("pb-top", `${this.b.page}.`);
    if (this.b.more) add("pb-contd", `${this.b.more} (CONT'D)`);
    return el;
  }
}

type Layout = { deco: DecorationSet; pages: number };

function layout(doc: string): Layout {
  const lines = classify(doc);
  const { breaks, hidden } = paginate(lines);
  const hide = new Set(hidden);
  const ranges: Range<Decoration>[] = lines.map((l) =>
    Decoration.line({ class: hide.has(l.from) ? "fx-hidden" : `fx-${l.kind}` }).range(l.from),
  );
  for (const b of breaks) {
    const widget = new PageBreak(b);
    ranges.push(
      b.mid
        ? Decoration.replace({ widget }).range(b.pos, b.pos + 1)
        : Decoration.widget({ widget, block: true, side: -1 }).range(b.pos),
    );
  }
  return { deco: Decoration.set(ranges, true), pages: breaks.length + 1 };
}

// ponytail: re-parses the whole script on every keystroke. Fine while it stays
// under a few ms (measured 1-2 ms for 80 pages); go incremental if typing lags.
const layoutField = StateField.define<Layout>({
  create: (s) => layout(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? layout(tr.state.doc.toString()) : v),
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

const theme = EditorView.theme({
  "&": { background: "#fff", color: "#111", boxShadow: "0 1px 4px rgba(0,0,0,.2)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-script), Courier, monospace", fontSize: "12pt" },
  ".cm-content": {
    width: "60ch",
    padding: `${pt(PAGE.top)} ${pt(PAGE.right)} ${pt(PAGE.bottom)} ${pt(PAGE.left)}`,
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
  ".pb-gap": { height: "24px", background: "#d4d4d4", margin: `0 ${pt(-PAGE.right)} 0 ${pt(-PAGE.left)}` },
  ".pb-top": { height: pt(PAGE.top), textAlign: "right", paddingTop: pt(PAGE.top / 2), boxSizing: "border-box" },
  ".pb-contd": { paddingLeft: "22ch" },
  // inside a dialogue line, the widget starts at the dialogue column
  ".fx-dialogue .pb-gap": {
    margin: `0 ${pt(-(PAGE.right + DIALOGUE_RIGHT * CHAR_PT))} 0 ${pt(-(PAGE.left + DIALOGUE_LEFT * CHAR_PT))}`,
  },
  ".fx-dialogue .pb-top": { marginRight: `-${DIALOGUE_RIGHT}ch` },
  ".fx-dialogue .pb-contd": { paddingLeft: `${22 - DIALOGUE_LEFT}ch` },
});

export default function Editor({ initial }: { initial: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const report = (s: EditorState) => {
      setPages(s.field(layoutField).pages);
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          layoutField,
          theme,
          EditorView.updateListener.of((u) => u.docChanged && report(u.state)),
        ],
      }),
    });
    report(view.state);
    return () => view.destroy();
  }, [initial]);

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 1, textAlign: "center", font: "13px system-ui", padding: 6 }}>
        {pages} pages
      </div>
      <div ref={host} style={{ width: "fit-content", margin: "0 auto" }} />
    </div>
  );
}
