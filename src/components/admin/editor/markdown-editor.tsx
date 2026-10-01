"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder as placeholderExt,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import { insertLink, wrap } from "./commands";

const theme = EditorView.theme({
  "&": {
    fontSize: "16px",
    color: "var(--foreground)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    lineHeight: "1.85",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0 0 45vh",
    caretColor: "var(--brand)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--brand)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "color-mix(in oklab, var(--brand) 22%, transparent) !important" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--foreground) 2.5%, transparent)",
    boxShadow:
      "-12px 0 0 color-mix(in oklab, var(--foreground) 2.5%, transparent), 12px 0 0 color-mix(in oklab, var(--foreground) 2.5%, transparent)",
  },
  ".cm-placeholder": { color: "var(--subtle)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--ochre) 22%, transparent)" },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--brand) 14%, transparent)",
    outline: "none",
  },
  ".cm-panels": {
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
    borderColor: "var(--border)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-search input, .cm-search button": { fontSize: "13px" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--ochre) 30%, transparent)" },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--brand) 30%, transparent)",
  },
});

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.5em", fontWeight: "700", fontFamily: "var(--font-serif)" },
  { tag: t.heading2, fontSize: "1.3em", fontWeight: "700", fontFamily: "var(--font-serif)" },
  { tag: t.heading3, fontSize: "1.14em", fontWeight: "700", fontFamily: "var(--font-serif)" },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700", fontFamily: "var(--font-serif)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted-foreground)" },
  { tag: [t.link, t.url], color: "var(--brand)" },
  {
    tag: t.monospace,
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    color: "color-mix(in oklab, var(--ochre) 55%, var(--foreground))",
  },
  { tag: t.quote, color: "var(--muted-foreground)" },
  { tag: [t.processingInstruction, t.meta], color: "var(--subtle)" },
  { tag: t.contentSeparator, color: "var(--subtle)" },
  // 代码块内部
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "var(--brand)" },
  {
    tag: [t.string, t.special(t.string), t.regexp],
    color: "color-mix(in oklab, var(--ochre) 55%, var(--foreground))",
  },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--subtle)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#b8432f" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "color-mix(in oklab, var(--brand) 60%, #7b6aa8)",
  },
  { tag: [t.typeName, t.className], color: "#3e7355" },
  { tag: [t.tagName, t.attributeName], color: "var(--brand)" },
]);

export type EditorCallbacks = {
  onChange: (value: string) => void;
  onUpload?: (files: File[], view: EditorView) => void;
  onScroll?: (ratio: number) => void;
};

/** CodeMirror 6 的 Markdown 编辑器，外部滚动容器负责滚动 */
export function MarkdownEditor({
  value,
  placeholder,
  viewRef,
  scrollParent,
  ...callbacks
}: EditorCallbacks & {
  value: string;
  placeholder?: string;
  viewRef?: React.RefObject<EditorView | null>;
  scrollParent?: React.RefObject<HTMLElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbs = useRef(callbacks);

  useEffect(() => {
    cbs.current = callbacks;
  });

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.contentAttributes.of({ "aria-label": "文章正文（Markdown）" }),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          theme,
          placeholderExt(placeholder ?? "开始写作…（支持粘贴或拖入图片）"),
          keymap.of([
            { key: "Mod-b", run: (v) => (wrap(v, "**"), true) },
            { key: "Mod-i", run: (v) => (wrap(v, "*"), true) },
            { key: "Mod-k", run: (v) => (insertLink(v), true) },
            { key: "Mod-Shift-x", run: (v) => (wrap(v, "~~"), true) },
            { key: "Mod-e", run: (v) => (wrap(v, "`", "`", "code"), true) },
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cbs.current.onChange(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event, v) {
              const files = Array.from(event.clipboardData?.files ?? []);
              if (!files.length || !cbs.current.onUpload) return false;
              event.preventDefault();
              cbs.current.onUpload(files, v);
              return true;
            },
            drop(event, v) {
              const files = Array.from(event.dataTransfer?.files ?? []);
              if (!files.length || !cbs.current.onUpload) return false;
              event.preventDefault();
              const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
              if (pos != null) v.dispatch({ selection: { anchor: pos } });
              cbs.current.onUpload(files, v);
              return true;
            },
          }),
        ],
      }),
    });
    view.current = editor;
    if (viewRef) viewRef.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
      if (viewRef) viewRef.current = null;
    };
    // 编辑器只创建一次，内容变化通过下面的 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部替换内容（例如恢复本地备份）
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const el = scrollParent?.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      cbs.current.onScroll?.(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollParent]);

  return <div ref={host} className="min-h-[50vh]" />;
}
