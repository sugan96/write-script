"use client";

import { useEffect, useRef, useState } from "react";
import { EditorState, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { LINES_PER_PAGE, classify, paginate, type Break } from "./screenplay";

// Print geometry: 12pt Courier at 6 lines per inch on US Letter (11in tall).
// The bottom margin is whatever is left after the top margin and the text lines.
const LINE = "12pt";
const BOTTOM = `calc(11in - 1in - ${LINES_PER_PAGE} * ${LINE})`;

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
    add("pb-fill").style.height = `calc(${this.b.filler} * ${LINE} + ${BOTTOM})`;
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
  ".cm-content": { width: "60ch", padding: `1in 1in ${BOTTOM} 1.5in`, boxSizing: "content-box" },
  ".cm-line": { padding: "0", lineHeight: LINE },
  ".fx-character": { paddingLeft: "22ch" },
  ".fx-parenthetical": { paddingLeft: "16ch", paddingRight: "19ch" },
  ".fx-dialogue": { paddingLeft: "10ch", paddingRight: "15ch" },
  ".fx-transition": { textAlign: "right" },
  ".fx-hidden": { height: "0", overflow: "hidden" },
  // CodeMirror's invisible buffers around inline widgets add 2px per side at baseline
  ".cm-line .cm-widgetBuffer": { verticalAlign: "top" },
  ".pb": { display: "block", lineHeight: LINE },
  ".pb-gap": { height: "24px", background: "#d4d4d4", margin: "0 -1in 0 -1.5in" },
  ".pb-top": { height: "1in", textAlign: "right", paddingTop: "0.5in", boxSizing: "border-box" },
  ".pb-contd": { paddingLeft: "22ch" },
  // inside a dialogue line, the widget starts at the dialogue column
  ".fx-dialogue .pb-gap": { margin: "0 calc(-1in - 15ch) 0 calc(-1.5in - 10ch)" },
  ".fx-dialogue .pb-top": { marginRight: "-15ch" },
  ".fx-dialogue .pb-contd": { paddingLeft: "12ch" },
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
