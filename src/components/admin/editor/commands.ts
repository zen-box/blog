import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** 用标记包裹选区；已包裹时取消。没有选区时插入占位文字并选中 */
export function wrap(view: EditorView, before: string, after = before, placeholder = "文字") {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const outerFrom = range.from - before.length;
      const outerTo = range.to + after.length;
      const wrapped =
        outerFrom >= 0 &&
        state.sliceDoc(outerFrom, range.from) === before &&
        state.sliceDoc(range.to, outerTo) === after;
      if (wrapped) {
        return {
          changes: [
            { from: outerFrom, to: range.from, insert: "" },
            { from: range.to, to: outerTo, insert: "" },
          ],
          range: EditorSelection.range(outerFrom, range.to - before.length),
        };
      }
      const inner = text || placeholder;
      return {
        changes: { from: range.from, to: range.to, insert: before + inner + after },
        range: EditorSelection.range(
          range.from + before.length,
          range.from + before.length + inner.length,
        ),
      };
    }),
  );
  view.focus();
}

/** 对选中的每一行切换前缀（引用、列表、任务） */
export function toggleLinePrefix(
  view: EditorView,
  prefix: string | ((i: number) => string),
  match: RegExp,
) {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const start = state.doc.lineAt(r.from).number;
    const end = state.doc.lineAt(r.to).number;
    for (let n = start; n <= end; n++) lines.add(n);
  }
  const numbers = [...lines].sort((a, b) => a - b);
  const all = numbers.every((n) => match.test(state.doc.line(n).text));
  const changes = numbers.map((n, i) => {
    const line = state.doc.line(n);
    const m = match.exec(line.text);
    if (all && m) return { from: line.from, to: line.from + m[0].length, insert: "" };
    const cleaned = line.text.replace(
      /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+|>\s?)/,
      "$1",
    );
    const p = typeof prefix === "function" ? prefix(i) : prefix;
    return { from: line.from, to: line.to, insert: p + cleaned };
  });
  view.dispatch({ changes });
  view.focus();
}

export function setHeading(view: EditorView, level: number) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const m = /^(#{1,6})\s+/.exec(line.text);
  const current = m ? m[1].length : 0;
  const hashes = current === level ? "" : "#".repeat(level) + " ";
  view.dispatch({
    changes: { from: line.from, to: line.from + (m ? m[0].length : 0), insert: hashes },
  });
  view.focus();
}

/** 在光标处插入独立成段的块，前后自动补空行 */
export function insertBlock(
  view: EditorView,
  block: string,
  selectFrom?: number,
  selectTo?: number,
) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : null;
  let from: number;
  let to: number;
  let prefix: string;
  if (!line.text.trim()) {
    // 空行：替换这一行
    const prev = line.number > 1 ? state.doc.line(line.number - 1).text : "";
    from = line.from;
    to = line.to;
    prefix = prev.trim() ? "\n" : "";
  } else {
    // 非空行：插在这一行之后
    from = to = line.to;
    prefix = "\n\n";
  }
  const suffix = next === null || next.trim() ? "\n" : "";
  const base = from + prefix.length;
  view.dispatch({
    changes: { from, to, insert: prefix + block + suffix },
    selection:
      selectFrom !== undefined
        ? EditorSelection.range(base + selectFrom, base + (selectTo ?? selectFrom))
        : EditorSelection.cursor(base + block.length),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertText(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertLink(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const text = state.sliceDoc(from, to) || "链接文字";
  const insert = `[${text}](https://)`;
  const urlStart = from + text.length + 3;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(urlStart, urlStart + "https://".length),
  });
  view.focus();
}

/** 用最终内容替换占位文字（例如上传完成后替换“上传中”） */
export function replacePlaceholder(view: EditorView, placeholder: string, text: string) {
  const at = view.state.doc.toString().indexOf(placeholder);
  if (at < 0) return insertText(view, text);
  view.dispatch({ changes: { from: at, to: at + placeholder.length, insert: text } });
}
