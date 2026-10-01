import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { wordDiff } from "@/lib/ai-text";

export type InlineSuggestion = { from: number; to: number; before: string; after: string };
const suggestionEffect = StateEffect.define<InlineSuggestion | null>();
class SuggestionWidget extends WidgetType {
  constructor(
    readonly before: string,
    readonly after: string,
  ) {
    super();
  }
  eq(other: SuggestionWidget) {
    return other.before === this.before && other.after === this.after;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "ai-inline-suggestion";
    el.setAttribute("aria-label", "AI 改写建议");
    el.append(document.createTextNode(" → "));
    for (const part of wordDiff(this.before, this.after)) {
      if (part.kind === "remove") continue;
      const span = document.createElement(part.kind === "add" ? "ins" : "span");
      span.textContent = part.text;
      el.append(span);
    }
    return el;
  }
}
const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects)
      if (effect.is(suggestionEffect)) {
        if (!effect.value) return Decoration.none;
        const { from, to, before, after } = effect.value;
        const ranges = [];
        let cursor = from;
        for (const part of wordDiff(before, after)) {
          if (part.kind === "remove")
            ranges.push(
              Decoration.mark({ class: "ai-original-removed" }).range(
                cursor,
                cursor + part.text.length,
              ),
            );
          if (part.kind !== "add") cursor += part.text.length;
        }
        ranges.push(
          Decoration.widget({ widget: new SuggestionWidget(before, after), side: 1 }).range(to),
        );
        value = Decoration.set(ranges, true);
      }
    return value;
  },
  provide: (value) => EditorView.decorations.from(value),
});
export function showInlineSuggestion(view: EditorView, suggestion: InlineSuggestion | null) {
  if (!view.state.field(field, false))
    view.dispatch({ effects: StateEffect.appendConfig.of(field) });
  view.dispatch({ effects: suggestionEffect.of(suggestion) });
}
