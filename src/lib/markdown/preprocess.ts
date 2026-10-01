/**
 * 解析前的源码整理（逐行处理，跳过代码块）：
 * 1. 兼容 VitePress / NodeSeek / MyST 的容器写法：`::: tip 标题`、`:::: tabs`、
 *    `::: tab-item 标签`、`:::{tab-item} 标签` 统一改成 remark-directive 的 `:::name[标签]`
 * 2. 直接粘贴的测评报告纯文本（NodeQuality、xykt）包进代码块，避免被当成 Markdown 解析
 */
import { hasMarkdownEscapedAnsi } from "./terminal/ansi";
import { bannerAt, reportRegionEnd } from "./terminal/report";

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

const escapeLabel = (s: string) => s.replace(/[\\[\]]/g, (c) => `\\${c}`);

/** 非标准的容器开头改写成指令语法；已经是标准写法或不是容器时返回 null */
function normalizeContainer(line: string): string | null {
  const m = /^( {0,3})(:{3,})(.*)$/.exec(line);
  if (!m) return null;
  const [, indent, colons, rest] = m;
  // :::name、:::name[标签]、:::name{属性}、闭合行
  if (!rest.trim() || /^[A-Za-z][\w-]*(\[.*\])?(\{.*\})?\s*$/.test(rest)) return null;
  const n = /^[ \t]*(?:\{([A-Za-z][\w-]*)\}|([A-Za-z][\w-]*))(?:[ \t]+(.*?))?[ \t]*$/.exec(rest);
  if (!n) return null;
  const name = n[1] ?? n[2];
  let label = n[3] ?? "";
  let attrs = "";
  const a = /^(.*?)\s*(\{[^{}]*\})$/.exec(label);
  if (a) [label, attrs] = [a[1], a[2]];
  return `${indent}${colons}${name}${label ? `[${escapeLabel(label)}]` : ""}${attrs}`;
}

const longestRun = (text: string, ch: string) =>
  Math.max(0, ...(text.match(new RegExp(`\\${ch}+`, "g")) ?? []).map((s) => s.length));

export function preprocessMarkdown(source: string): string {
  const lines = source.split(/\r?\n/);
  const importedReport = hasMarkdownEscapedAnsi(source);
  const out: string[] = [];
  let fence: { ch: string; len: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.ch && close[1].length >= fence.len) fence = null;
      out.push(line);
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { ch: open[1][0], len: open[1].length };
      out.push(line);
      continue;
    }

    const container = normalizeContainer(line);
    if (container !== null) {
      out.push(container);
      continue;
    }

    if (bannerAt(lines, i)) {
      const end = reportRegionEnd(lines, i);
      if (end > i) {
        const body = lines.slice(i, end);
        const ticks = "`".repeat(Math.max(3, longestRun(body.join("\n"), "`") + 1));
        out.push(`${ticks}terminal report`, ...body, ticks);
        i = end - 1;
        continue;
      }
    }
    // 仅修复损坏报告中的独立图片 / 链接行，保留普通正文和代码里的刻意转义。
    out.push(
      importedReport
        ? line.replace(/^( {0,3})(!?)\\\[([^\]]*?)\\?\]\((https?:\/\/\S+)\)[ \t]*$/, "$1$2[$3]($4)")
        : line,
    );
  }
  return out.join("\n");
}
