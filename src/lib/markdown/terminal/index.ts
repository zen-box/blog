/**
 * 终端输出与测评报告：
 * - ```terminal / ```ansi 代码块渲染成终端窗口（ANSI 颜色、中文等宽对齐）
 * - NodeQuality / xykt 报告自动识别，按报告拆成标签页
 * - 相邻的标签页组（中间只隔着空行或来源链接）合并成一组，方便把多个工具的结果拼在一起
 */
import type { Element, ElementContent } from "hast";
import type { Code, Paragraph, Parent, Root, RootContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";
import { SKIP, visit } from "unist-util-visit";

import { hasAnsi, parseAnsi, restoreEscapes } from "./ansi";
import { textToRows } from "./cells";
import { screen } from "./render";
import { hasReportBanner, type ReportSection, splitReport } from "./report";
import { highlightXykt } from "./xykt";

const TERMINAL_LANGS = new Set(["terminal", "term", "ansi"]);
/** 这些语言的代码块里如果是测评报告，也按报告处理 */
const PLAIN_LANGS = new Set(["", "text", "txt", "plain", "plaintext", "log", "output"]);
export const TABS_NAMES = new Set(["tabs", "tab-set", "tabset"]);
export const TAB_NAMES = new Set(["tab", "tab-item", "tabitem", "tab-pane"]);

type TerminalOptions = { title?: string; chrome: boolean };

/** 终端窗口的 hast：标题栏（可选）+ 复制按钮 + 画面 */
export function terminalElement(text: string, opts: TerminalOptions): Element {
  const source = restoreEscapes(text);
  let rows;
  if (hasAnsi(source)) {
    rows = parseAnsi(source);
  } else {
    rows = textToRows(source.replace(/\n+$/, ""));
    if (hasReportBanner(source)) highlightXykt(rows);
  }

  const children: ElementContent[] = [];
  if (opts.chrome) {
    children.push({
      type: "element",
      tagName: "div",
      properties: { className: ["term-bar"] },
      children: [
        {
          type: "element",
          tagName: "span",
          properties: { className: ["term-dots"], ariaHidden: "true" },
          children: [0, 1, 2].map(() => ({
            type: "element" as const,
            tagName: "i",
            properties: {},
            children: [],
          })),
        },
        ...(opts.title
          ? [
              {
                type: "element" as const,
                tagName: "span",
                properties: { className: ["term-title"] },
                children: [{ type: "text" as const, value: opts.title }],
              },
            ]
          : []),
      ],
    });
  }
  children.push(
    {
      type: "element",
      tagName: "button",
      properties: { type: "button", className: ["term-copy"], ariaLabel: "复制终端内容" },
      children: [{ type: "text", value: "复制" }],
    },
    screen(rows),
  );
  return {
    type: "element",
    tagName: "figure",
    properties: { className: ["term", opts.chrome ? "has-bar" : ""].filter(Boolean) },
    children,
  };
}

/** 只用于输出 HTML 的 mdast 节点 */
function htmlNode(el: Element): RootContent {
  return {
    type: "blogTerminal",
    data: { hName: el.tagName, hProperties: el.properties, hChildren: el.children },
  } as unknown as RootContent;
}

function titleOf(meta: string): string | undefined {
  const m = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

/* ------------------------------------------------------------------ */
/* 报告组：先占位，合并完相邻的标签页后再生成最终结构                          */
/* ------------------------------------------------------------------ */

type ReportGroup = { type: "reportGroup"; sections: ReportSection[] };

const isReportGroup = (n: RootContent): boolean => (n as { type: string }).type === "reportGroup";
const isTabs = (n: RootContent): n is ContainerDirective =>
  n.type === "containerDirective" && TABS_NAMES.has(n.name.toLowerCase());
const isTabGroup = (n: RootContent) => isTabs(n) || isReportGroup(n);

function labelParagraph(text: string): Paragraph {
  return {
    type: "paragraph",
    data: { directiveLabel: true } as Paragraph["data"],
    children: [{ type: "text", value: text }],
  };
}

function sectionTab(section: ReportSection, index: number): ContainerDirective {
  return {
    type: "containerDirective",
    name: "tab",
    attributes: {},
    children: [
      labelParagraph(section.label || section.title || `报告 ${index + 1}`),
      htmlNode(terminalElement(section.text, { chrome: false })) as never,
    ],
  };
}

/** 标签页组里的每一项；报告占位展开成若干项 */
function tabItems(n: RootContent): RootContent[] {
  if (isReportGroup(n)) return (n as unknown as ReportGroup).sections.map(sectionTab);
  return (n as ContainerDirective).children.flatMap((child) =>
    isReportGroup(child as RootContent) ? tabItems(child as RootContent) : [child],
  ) as RootContent[];
}

/** 只有一段的报告不需要标签页，直接显示成带标题栏的终端 */
function materialize(n: RootContent): RootContent {
  if (isReportGroup(n)) {
    const { sections } = n as unknown as ReportGroup;
    if (sections.length === 1) {
      const s = sections[0];
      return htmlNode(terminalElement(s.text, { chrome: true, title: s.title }));
    }
  }
  if (isReportGroup(n)) {
    return {
      type: "containerDirective",
      name: "tabs",
      attributes: {},
      children: tabItems(n) as ContainerDirective["children"],
    };
  }
  // 手写的标签页里直接粘贴了报告：把报告展开成同一组里的标签
  if (isTabs(n) && n.children.some((c) => isReportGroup(c as RootContent))) {
    n.children = tabItems(n) as ContainerDirective["children"];
  }
  return n;
}

/** 链接段落：只有一个链接，或者「报告链接：https://…」这样的来源说明 */
function isLinkParagraph(n: RootContent): boolean {
  if (n.type !== "paragraph") return false;
  const parts = n.children.filter(
    (c) => !(c.type === "text" && !c.value.trim()) && c.type !== "break",
  );
  if (parts.length === 1) return parts[0].type === "link";
  return (
    parts.length === 2 &&
    parts[0].type === "text" &&
    /^[^\n]{1,12}[：:]\s*$/.test(parts[0].value) &&
    parts[1].type === "link"
  );
}

function mergeTabGroups(parent: Parent) {
  const kids = parent.children as RootContent[];
  if (!kids.some(isTabGroup)) return;
  const out: RootContent[] = [];
  for (let i = 0; i < kids.length;) {
    if (!isTabGroup(kids[i])) {
      out.push(kids[i++]);
      continue;
    }
    const group = [kids[i]];
    const links: RootContent[] = [];
    let j = i + 1;
    for (;;) {
      let k = j;
      const pending: RootContent[] = [];
      while (k < kids.length && isLinkParagraph(kids[k])) pending.push(kids[k++]);
      if (k < kids.length && isTabGroup(kids[k])) {
        group.push(kids[k]);
        links.push(...pending);
        j = k + 1;
        continue;
      }
      break;
    }
    if (group.length === 1) {
      out.push(materialize(group[0]));
    } else {
      out.push(
        {
          type: "containerDirective",
          name: "tabs",
          attributes: {},
          children: group.flatMap(tabItems) as ContainerDirective["children"],
        },
        ...links,
      );
    }
    i = j;
  }
  parent.children = out as never;
}

export function remarkTerminal() {
  return (tree: Root) => {
    visit(tree, "code", (c: Code, index, parent) => {
      if (!parent || index == null) return;
      const lang = (c.lang ?? "").toLowerCase();
      const meta = c.meta ?? "";
      const source = restoreEscapes(c.value);
      const explicit = TERMINAL_LANGS.has(lang);
      const report = explicit
        ? /\breport\b/.test(meta)
        : PLAIN_LANGS.has(lang) && hasReportBanner(source);
      if (!explicit && !report) return;

      const inTab =
        parent.type === "containerDirective" &&
        TAB_NAMES.has((parent as ContainerDirective).name.toLowerCase());
      if (report && !inTab) {
        const group: ReportGroup = { type: "reportGroup", sections: splitReport(source) };
        parent.children[index] = group as never;
      } else {
        parent.children[index] = htmlNode(
          terminalElement(c.value, { chrome: !inTab, title: titleOf(meta) }),
        ) as never;
      }
      return SKIP;
    });

    visit(tree, (n) => {
      if ("children" in n && Array.isArray(n.children)) mergeTabGroups(n as Parent);
    });
  };
}
