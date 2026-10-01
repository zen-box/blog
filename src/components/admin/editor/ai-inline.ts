import { type Range, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { readableDiff } from "@/lib/text-diff";

export type InlineSuggestion = {
  from: number;
  to: number;
  before: string;
  after: string;
  /** 还在生成：原文变淡，新文字接在后面；生成完成后原地显示逐词差异 */
  streaming?: boolean;
  /** 只留出状态条的位置（例如生成失败时），不显示文字 */
  anchorOnly?: boolean;
};
const suggestionEffect = StateEffect.define<InlineSuggestion | null>();

class InsertWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly streaming: boolean,
  ) {
    super();
  }
  eq(other: InsertWidget) {
    return other.text === this.text && other.streaming === this.streaming;
  }
  toDOM() {
    const el = document.createElement(this.streaming ? "span" : "ins");
    el.className = `cm-ai-insert diff-add${this.streaming ? " cm-ai-stream" : ""}`;
    el.dataset.aiSuggestion = "";
    el.textContent = this.text;
    return el;
  }
}

const attributes = { "data-ai-suggestion": "" };
const pending = Decoration.mark({ class: "cm-ai-pending", attributes });
const removed = Decoration.mark({ class: "diff-del", attributes });
/** 建议所在段落的最后一行留出空白，放接受 / 放弃的状态条，不遮住下面的正文 */
const anchor = Decoration.line({ class: "cm-ai-anchor" });
const insert = (text: string, streaming = false) =>
  Decoration.widget({ widget: new InsertWidget(text, streaming), side: 1 });

function decorate(doc: Text, s: InlineSuggestion): DecorationSet {
  const ranges: Range<Decoration>[] = [anchor.range(doc.lineAt(Math.min(s.to, doc.length)).from)];
  if (s.anchorOnly) return Decoration.set(ranges);
  if (s.streaming) {
    if (s.to > s.from) ranges.push(pending.range(s.from, s.to));
    ranges.push(insert(s.after, true).range(s.to));
    return Decoration.set(ranges, true);
  }
  let cursor = s.from;
  for (const part of readableDiff(s.before, s.after)) {
    if (part.kind === "add") {
      ranges.push(insert(part.text).range(cursor));
      continue;
    }
    const end = cursor + part.text.length;
    if (part.kind === "remove") ranges.push(removed.range(cursor, end));
    cursor = end;
  }
  return Decoration.set(ranges, true);
}

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects)
      if (effect.is(suggestionEffect))
        value = effect.value ? decorate(transaction.state.doc, effect.value) : Decoration.none;
    return value;
  },
  provide: (value) => EditorView.decorations.from(value),
});

export function showInlineSuggestion(view: EditorView, suggestion: InlineSuggestion | null) {
  if (!view.state.field(field, false))
    view.dispatch({ effects: StateEffect.appendConfig.of(field) });
  view.dispatch({ effects: suggestionEffect.of(suggestion) });
}
