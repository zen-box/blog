import { fromHtml } from "hast-util-from-html";
import type { Element, Root, RootContent } from "hast";

type Node = Root | RootContent;
const ignored = new Set(["script", "style", "noscript", "iframe", "object", "template", "head"]);
const textOf = (node: Node): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";
const safeUrl = (value: unknown) => {
  const url = String(value ?? "").trim();
  return /^(https?:|mailto:|\/|#)/i.test(url)
    ? url.replace(/[()\s]/g, (c) => encodeURIComponent(c))
    : "";
};
const escape = (text: string) => text.replace(/([\\`*_{}[\]<>])/g, "\\$1");

/** 浏览器与回归脚本共用的 HTML→Markdown 转换；只读取结构，不插入 HTML DOM。 */
export function richTextToMarkdown(html: string): string {
  const root = fromHtml(html, { fragment: true });
  const codeBlocks: string[] = [];
  function children(node: Element | Root): string {
    return node.children.map((child) => convert(child)).join("");
  }
  function list(node: Element, depth = 0): string {
    return node.children
      .filter((child): child is Element => child.type === "element" && child.tagName === "li")
      .map((item, index) => {
        const nested = item.children.filter(
          (child): child is Element => child.type === "element" && /^(ul|ol)$/.test(child.tagName),
        );
        const body = item.children
          .filter((child) => !nested.includes(child as Element))
          .map((child) => convert(child))
          .join("")
          .trim();
        const marker =
          node.tagName === "ol" ? `${Number(node.properties.start ?? 1) + index}. ` : "- ";
        return (
          "  ".repeat(depth) +
          marker +
          body.replace(/\n+/g, "\n" + "  ".repeat(depth + 1)) +
          nested.map((child) => "\n" + list(child, depth + 1)).join("")
        );
      })
      .join("\n");
  }
  function table(node: Element): string {
    const rows: Element[] = [];
    function visit(current: Node) {
      if (current.type === "element" && current.tagName === "tr") rows.push(current);
      else if ("children" in current) current.children.forEach(visit);
    }
    visit(node);
    const data = rows.map((row) =>
      row.children
        .filter((c): c is Element => c.type === "element" && /^(th|td)$/.test(c.tagName))
        .map((cell) => children(cell).trim().replace(/\|/g, "\\|").replace(/\n+/g, "<br>")),
    );
    const width = Math.max(0, ...data.map((row) => row.length));
    if (!width) return "";
    const render = (row: string[]) =>
      "| " + Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ") + " |";
    return (
      "\n\n" +
      [render(data[0]), render(Array(width).fill("---")), ...data.slice(1).map(render)].join("\n") +
      "\n\n"
    );
  }
  function convert(node: Node): string {
    if (node.type === "text") return escape(node.value.replace(/[\t\n\r ]+/g, " "));
    if (node.type !== "element") return "";
    const tag = node.tagName;
    if (
      ignored.has(tag) ||
      node.properties.hidden ||
      /display\s*:\s*none/i.test(String(node.properties.style ?? ""))
    )
      return "";
    if (/^h[1-6]$/.test(tag))
      return `\n\n${"#".repeat(Number(tag[1]))} ${children(node).trim()}\n\n`;
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n\n---\n\n";
    if (tag === "pre") {
      const code = node.children.find(
        (child): child is Element => child.type === "element" && child.tagName === "code",
      );
      const raw = textOf(code ?? node).replace(/\r\n/g, "\n");
      const lang = String(code?.properties.className ?? "").match(/language-([\w+-]+)/)?.[1] ?? "";
      const fence = "`".repeat(
        Math.max(3, ...Array.from(raw.matchAll(/`+/g), (match) => match[0].length + 1)),
      );
      codeBlocks.push(`${fence}${lang}\n${raw.replace(/\n$/, "")}\n${fence}`);
      return `\n\n\u0000CODE${codeBlocks.length - 1}\u0000\n\n`;
    }
    if (tag === "code") {
      const raw = textOf(node);
      const fence = "`".repeat(
        Math.max(1, ...Array.from(raw.matchAll(/`+/g), (match) => match[0].length + 1)),
      );
      return `${fence} ${raw} ${fence}`;
    }
    if (tag === "ul" || tag === "ol") return "\n\n" + list(node) + "\n\n";
    if (tag === "table") return table(node);
    if (tag === "blockquote")
      return (
        "\n\n" +
        children(node)
          .trim()
          .split("\n")
          .map((line) => "> " + line)
          .join("\n") +
        "\n\n"
      );
    if (tag === "img") {
      const src = safeUrl(
        node.properties.src || node.properties.dataSrc || node.properties.dataOriginal,
      );
      return src ? `![${escape(String(node.properties.alt ?? ""))}](${src})` : "";
    }
    if (tag === "a") {
      const url = safeUrl(node.properties.href);
      return url ? `[${children(node).trim()}](${url})` : children(node);
    }
    if (tag === "strong" || tag === "b") return `**${children(node)}**`;
    if (tag === "em" || tag === "i") return `*${children(node)}*`;
    if (tag === "del" || tag === "s" || tag === "strike") return `~~${children(node)}~~`;
    if (
      tag === "p" &&
      /MsoListParagraph|mso-list:/i.test(
        String(node.properties.className ?? "") + String(node.properties.style ?? ""),
      )
    ) {
      const body = children(node).trim();
      const ordered = body.match(/^\s*(\d+)[.)]\s*/);
      return (
        "\n" +
        (ordered ? `${ordered[1]}. ` : "- ") +
        body.replace(/^\s*(?:\d+[.)]|[·•●○▪‣-])\s*/, "") +
        "\n"
      );
    }
    if (/^(p|div|section|article|figure|figcaption)$/.test(tag))
      return "\n\n" + children(node).trim() + "\n\n";
    return children(node);
  }
  return children(root)
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/\u0000CODE(\d+)\u0000/g, (_, index: string) => codeBlocks[Number(index)]);
}
