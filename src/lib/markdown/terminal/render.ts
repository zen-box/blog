import type { Element, ElementContent } from "hast";

import { glyphKind, type Row, RowText, type Style } from "./cells";

/**
 * 样式 → class：c0–c15 前景、g0–g15 背景（调色板在 CSS 里），
 * 256 色和真彩色直接写内联颜色。
 */
function resolve(s: Style): { classes: string[]; css: string } {
  let fg: Style["fg"] | "bg" = s.fg;
  let bg: Style["bg"] | "fg" = s.bg;
  // 和 xterm 默认行为一致：粗体的基本色显示为对应的亮色（黑色除外，否则浅底上看不清）
  if (s.bold && typeof fg === "number" && fg >= 1 && fg <= 7) fg += 8;
  if (s.inverse) [fg, bg] = [bg ?? "bg", fg ?? "fg"];

  const classes: string[] = [];
  let css = "";
  if (fg === "bg") classes.push("cx");
  else if (typeof fg === "number") classes.push(`c${fg}`);
  else if (fg) css += `color:${fg};`;
  if (bg === "fg") classes.push("gx");
  else if (typeof bg === "number") classes.push(`g${bg}`);
  else if (bg) css += `background-color:${bg};`;
  if (s.bold) classes.push("tb");
  if (s.dim) classes.push("td");
  if (s.italic) classes.push("ti");
  if (s.underline) classes.push("tu");
  if (s.strike) classes.push("ts");
  if (s.hidden) classes.push("th");
  return { classes, css };
}

/** 行尾看不见的空格可以省掉；带背景、下划线、反色的空格要保留 */
const invisible = (s: Style) => !s.bg && !s.inverse && !s.underline && !s.strike;

const URL_RE = /https?:\/\/[^\s<>"'`，。；、（）()[\]{}|]+/g;

function linkRanges(row: Row): { from: number; to: number; href: string }[] {
  const line = new RowText(row);
  const out: { from: number; to: number; href: string }[] = [];
  for (const m of line.text.matchAll(URL_RE)) {
    const href = m[0].replace(/[.,:;!?'"]+$/, "");
    out.push({ from: line.colAt(m.index), to: line.colAt(m.index + href.length), href });
  }
  return out;
}

type Segment = { text: string; kind: "n" | "w" | "u" | "e"; classes: string[]; css: string };

function segmentsOf(row: Row, from: number, to: number): Segment[] {
  const out: Segment[] = [];
  for (let c = from; c < to; c++) {
    const cell = row[c];
    if (!cell || cell.w === 0) continue;
    const kind = glyphKind(cell.ch);
    const { classes, css } = resolve(cell.s);
    const prev = out[out.length - 1];
    // 等宽字符和中文字符可以连成一段；宽度不确定的字符每个单独占格
    if (
      prev &&
      prev.kind === kind &&
      (kind === "n" || kind === "w") &&
      prev.css === css &&
      prev.classes.join(" ") === classes.join(" ")
    ) {
      prev.text += cell.ch;
    } else {
      out.push({ text: cell.ch, kind, classes, css });
    }
  }
  return out;
}

function toNode(seg: Segment): ElementContent {
  const classes = seg.kind === "n" ? seg.classes : [...seg.classes, seg.kind];
  if (!classes.length && !seg.css) return { type: "text", value: seg.text };
  return {
    type: "element",
    tagName: "span",
    properties: { className: classes.length ? classes : undefined, style: seg.css || undefined },
    children: [{ type: "text", value: seg.text }],
  };
}

function rowNodes(row: Row): ElementContent[] {
  let end = row.length;
  while (end > 0) {
    const cell = row[end - 1];
    if (cell.w !== 0 && !(cell.ch === " " && invisible(cell.s))) break;
    end--;
  }
  const nodes: ElementContent[] = [];
  let c = 0;
  for (const link of linkRanges(row)) {
    if (link.from >= end) break;
    nodes.push(...segmentsOf(row, c, link.from).map(toNode));
    nodes.push({
      type: "element",
      tagName: "a",
      properties: { href: link.href, className: ["term-link"] },
      children: segmentsOf(row, link.from, Math.min(link.to, end)).map(toNode),
    });
    c = link.to;
  }
  nodes.push(...segmentsOf(row, c, end).map(toNode));
  return nodes;
}

/** 终端画面：pre 里逐行排列，行与行之间是换行符（复制出来就是原文） */
export function screen(rows: Row[]): Element {
  // HTML 解析会吞掉紧跟在 <pre> 后面的第一个换行，首行为空时多补一个
  const children: ElementContent[] = rows[0]?.length ? [] : [{ type: "text", value: "\n" }];
  rows.forEach((row, i) => {
    if (i > 0) children.push({ type: "text", value: "\n" });
    children.push(...rowNodes(row));
  });
  return {
    type: "element",
    tagName: "pre",
    properties: { className: ["term-screen"], tabIndex: 0 },
    children,
  };
}
