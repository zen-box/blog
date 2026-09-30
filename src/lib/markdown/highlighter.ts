import "server-only";

import { createHighlighter, type Highlighter } from "shiki";

export const CODE_THEMES = {
  light: "rose-pine-dawn",
  dark: "rose-pine-moon",
} as const;

/** 预加载的常用语言，其余语言按需加载 */
const PRELOAD_LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "jsonc",
  "html",
  "css",
  "scss",
  "vue",
  "bash",
  "shellscript",
  "powershell",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "php",
  "sql",
  "yaml",
  "toml",
  "markdown",
  "diff",
  "dockerfile",
  "nginx",
  "ini",
  "xml",
];

const holder = globalThis as typeof globalThis & {
  __blogHighlighter?: Promise<Highlighter>;
};

export function getHighlighter(): Promise<Highlighter> {
  holder.__blogHighlighter ??= createHighlighter({
    themes: [CODE_THEMES.light, CODE_THEMES.dark],
    langs: PRELOAD_LANGS,
  });
  return holder.__blogHighlighter;
}
