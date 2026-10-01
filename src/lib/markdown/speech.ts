import type { Element, ElementContent, Root } from "hast";
import type { VFile } from "vfile";

import type { SpeechBlock } from "@/lib/post-audio";

/**
 * 朗读用的正文：给每个可朗读的块加上 data-say 序号，同时抽出要念的文字。
 * 代码、终端输出、表格、图表只用一句话带过；脚注、链接卡片不念。
 * 前台按 data-say 高亮正在朗读的段落。
 */

const classes = (el: Element) => (el.properties.className as string[] | undefined) ?? [];
const has = (el: Element, name: string) => classes(el).includes(name);

/** 一句话带过的块：返回要念的提示；null 表示整块跳过；undefined 表示不是这类块 */
function noteFor(el: Element): string | null | undefined {
  if (el.tagName === "pre" || (el.tagName === "figure" && has(el, "code-block")))
    return "这里有一段代码，请在文中查看。";
  if (has(el, "term")) return "这里是一段终端输出，请在文中查看。";
  if (has(el, "md-table") || el.tagName === "table") return "这里有一张表格，请在文中查看。";
  if (["md-chart", "md-markmap", "md-mermaid", "md-diagram-error"].some((name) => has(el, name)))
    return "这里有一张图表，请在文中查看。";
  if (has(el, "katex-display")) return "这里有一个公式。";
  if (has(el, "md-embed")) return "这里嵌入了一段视频。";
  if (
    has(el, "link-card-slot") ||
    has(el, "md-tabs-list") ||
    has(el, "footnotes") ||
    "dataFootnotes" in el.properties ||
    ["hr", "script", "style", "template", "button", "svg"].includes(el.tagName)
  )
    return null;
  return undefined;
}

const isFootnoteRef = (el: Element) =>
  el.tagName === "sup" &&
  el.children.some((c) => c.type === "element" && "dataFootnoteRef" in c.properties);

/** 行内内容转成念出来的文字 */
function speakable(nodes: ElementContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.value;
    if (node.type !== "element") continue;
    if (has(node, "heading-anchor") || isFootnoteRef(node) || node.tagName === "button") continue;
    if (has(node, "katex")) out += "（公式）";
    else if (node.tagName === "img") {
      const alt = String(node.properties.alt ?? "").trim();
      if (alt) out += `（图：${alt}）`;
    } else if (node.tagName === "br") out += "，";
    else out += speakable(node.children);
  }
  return out;
}

const clean = (text: string) =>
  text
    .replace(/https?:\/\/[^\s）)]+/g, "（链接）")
    .replace(/\s+/g, " ")
    .trim();

const BLOCK_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "div",
  "figure",
  "pre",
  "table",
  "blockquote",
  "details",
  "section",
  "aside",
  "dl",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
const TEXT_BLOCKS = new Set(["p", "figcaption", "dt", "dd", "summary"]);

export function rehypeSpeech() {
  return (tree: Root, file: VFile) => {
    const blocks: SpeechBlock[] = [];
    const add = (el: Element, kind: SpeechBlock["kind"], raw: string) => {
      const text = clean(raw);
      if (!text) return;
      const last = blocks.at(-1);
      // 连续几块一样的提示（例如几段终端输出）只念一次
      if (kind === "note" && last?.kind === "note" && last.text === text) return;
      el.properties.dataSay = blocks.length;
      blocks.push({ say: blocks.length, kind, text });
    };
    const walk = (children: (Root | Element)["children"]) => {
      for (const child of children) {
        // 代码高亮插件会把整段结果作为一个嵌套的 root 插进来
        if ((child as { type: string }).type === "root") {
          walk((child as unknown as Root).children);
          continue;
        }
        if (child.type !== "element") continue;
        const el = child;
        const note = noteFor(el);
        if (note !== undefined) {
          if (note) add(el, "note", note);
          continue;
        }
        if (/^h[1-6]$/.test(el.tagName)) add(el, "heading", speakable(el.children));
        else if (el.tagName === "figure" && has(el, "md-figure")) {
          // 图片：念说明文字，没有说明时念替代文本
          const caption = el.children.find(
            (c): c is Element => c.type === "element" && c.tagName === "figcaption",
          );
          const img = el.children.find(
            (c): c is Element => c.type === "element" && c.tagName === "img",
          );
          const text = caption ? speakable(caption.children) : String(img?.properties.alt ?? "");
          if (clean(text)) add(el, "text", `图：${text}`);
        } else if (TEXT_BLOCKS.has(el.tagName)) add(el, "text", speakable(el.children));
        else if (el.tagName === "li") {
          // 列表项自己的文字是一块，嵌套的列表、段落再往下找
          const isBlock = (c: ElementContent) => c.type === "element" && BLOCK_TAGS.has(c.tagName);
          add(el, "text", speakable(el.children.filter((c) => !isBlock(c))));
          walk(el.children.filter(isBlock));
        } else walk(el.children);
      }
    };
    walk(tree.children);
    file.data.speech = blocks;
  };
}

declare module "vfile" {
  interface DataMap {
    speech: SpeechBlock[];
  }
}
