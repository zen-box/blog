/**
 * 图表代码块：mermaid、chart（CSV 数据图表）、echarts（完整配置）、markmap（思维导图）。
 * 服务端只做解析和校验，把结果放进 data-* 属性，图形交给浏览器按需渲染；
 * 写错时直接在正文里显示原因，作者在编辑器预览里就能看到。
 */
import type { Element, ElementContent } from "hast";
import { h } from "hastscript";
import JSON5 from "json5";
import type { List, PhrasingContent, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

import { diagramErrorLine } from "./diagram-errors";
import {
  CHART_TYPES,
  type ChartSpec,
  type ChartType,
  formatValue,
  horizontalBarHeight,
  MAX_SERIES,
  type MindNode,
} from "./diagram-types";

/** 把 hast 元素包成 mdast 节点，remark-rehype 会原样输出 */
function asNode(el: Element): RootContent {
  return {
    type: "blogNode",
    data: { hName: el.tagName, hProperties: el.properties, hChildren: el.children },
    children: [],
  } as unknown as RootContent;
}

function errorNode(
  message: string,
  source: string,
  line = diagramErrorLine(message, source),
): RootContent {
  return asNode(
    h("div.md-diagram-error", { role: "note" }, [
      h("p.md-diagram-error-title", `图表无法显示：${message}`),
      h(
        "pre.md-diagram-error-source",
        source
          .split(/\r?\n/)
          .map((value, index) =>
            h(
              "span.md-diagram-source-line",
              { dataErrorLine: index + 1 === line ? "" : undefined },
              [
                h("span.md-diagram-line-number", { ariaHidden: "true" }, String(index + 1)),
                value || " ",
              ],
            ),
          ),
      ),
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* 代码块信息：```chart bar title="标题" unit=ms stack                     */
/* ------------------------------------------------------------------ */

type Meta = { words: Set<string>; attrs: Record<string, string> };

function parseMeta(meta: string | null | undefined): Meta {
  const words = new Set<string>();
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”|(\S+)))?/g;
  for (const m of (meta ?? "").matchAll(re)) {
    const key = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? m[5];
    if (value === undefined) words.add(key);
    else attrs[key] = value.trim();
  }
  return { words, attrs };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function heightFrom(meta: Meta, fallback: number): number {
  const n = Number(meta.attrs.height);
  return Number.isFinite(n) && n > 0 ? clamp(Math.round(n), 160, 800) : fallback;
}

const optionalNumber = (raw: string | undefined) => {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/* ------------------------------------------------------------------ */
/* chart：CSV / TSV（从表格软件复制）/ Markdown 表格                       */
/* ------------------------------------------------------------------ */

function splitDelimited(line: string, delimiter: RegExp): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && !cur.trim()) {
      quoted = true;
      cur = "";
    } else if (delimiter.test(ch)) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseRows(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.every((l) => l.startsWith("|"))) {
    return lines
      .filter((l) => !(/^[|\s:-]+$/.test(l) && l.includes("-")))
      .map((l) =>
        l
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim()),
      );
  }
  const delimiter = lines.some((l) => l.includes("\t")) ? /\t/ : /[,，]/;
  return lines.map((l) => splitDelimited(l, delimiter));
}

/** 「1,234.5 MB/s」→ 1234.5 和单位 MB/s；空单元格和「-」表示没有数据 */
function parseCell(cell: string): { value: number | null; unit: string } | null {
  const s = cell.replace(/\s+/g, " ").trim();
  if (!s || /^[-–—]$/.test(s)) return { value: null, unit: "" };
  const plain = s.replace(/^([+-]?\d{1,3}(?:,\d{3})+)(?![\d,])/, (m) => m.replace(/,/g, ""));
  const m = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i.exec(plain);
  if (!m) return null;
  const unit = m[2].trim();
  if (unit.length > 12 || /\d/.test(unit)) return null;
  return { value: Number(m[1]), unit };
}

function chartType(meta: Meta): { type: ChartType; horizontal: boolean } {
  const w = meta.words;
  const horizontal = w.has("horizontal") || w.has("hbar") || w.has("barh");
  if (w.has("donut") || w.has("ring") || w.has("doughnut")) return { type: "pie", horizontal };
  if (w.has("column")) return { type: "bar", horizontal };
  const type = CHART_TYPES.find((t) => w.has(t)) ?? "bar";
  return { type, horizontal: horizontal && type === "bar" };
}

function buildChartSpec(code: string, meta: Meta): ChartSpec | string {
  const rows = parseRows(code);
  if (rows.length < 2) return "至少需要一行表头和一行数据";
  const [header, ...body] = rows;
  if (header.length < 2) return "至少需要两列：第一列是分类，后面是数值";
  const names = header.slice(1);
  const { type, horizontal } = chartType(meta);
  if (names.length > MAX_SERIES) {
    return `最多 ${MAX_SERIES} 列数值（现在有 ${names.length} 列），可以拆成几张图`;
  }
  if (type === "pie" && names.length > 1) return "饼图只需要一列数值";

  const units = new Set<string>();
  const categories: string[] = [];
  const series = names.map((name, i) => ({
    name: name || `系列 ${i + 1}`,
    values: [] as (number | null)[],
  }));
  for (const [r, row] of body.entries()) {
    if (row.length > header.length) {
      return `数据第 ${r + 1} 行有 ${row.length} 列，比表头的 ${header.length} 列多`;
    }
    categories.push(row[0] ?? "");
    for (let c = 1; c < header.length; c++) {
      const cell = row[c] ?? "";
      const parsed = parseCell(cell);
      if (!parsed) return `数据第 ${r + 1} 行第 ${c + 1} 列「${cell}」不是数字`;
      if (parsed.unit) units.add(parsed.unit);
      series[c - 1].values.push(parsed.value);
    }
  }
  const unit = meta.attrs.unit || undefined;
  if (!unit && units.size > 1) {
    return `单位不一致（${[...units].join("、")}），同一张图请换算成同一种单位`;
  }
  if (type === "pie" && series[0].values.some((v) => v != null && v < 0)) {
    return "饼图的数值不能是负数";
  }
  if (type === "radar" && categories.length < 3) return "雷达图至少需要 3 个指标（3 行数据）";

  return {
    type,
    title: meta.attrs.title || undefined,
    unit: unit ?? ([...units][0] || undefined),
    horizontal: horizontal || undefined,
    stack:
      (meta.words.has("stack") || meta.words.has("stacked")) && type !== "pie" ? true : undefined,
    smooth: meta.words.has("smooth") || undefined,
    labels: meta.words.has("labels") || meta.words.has("label") || undefined,
    min: optionalNumber(meta.attrs.min),
    max: optionalNumber(meta.attrs.max),
    category: header[0],
    categories,
    series,
  };
}

function chartHeight(spec: ChartSpec): number {
  const legend = spec.series.length > 1 ? 36 : 0;
  if (spec.type === "bar" && spec.horizontal) return horizontalBarHeight(spec);
  if (spec.type === "pie") return 300;
  if (spec.type === "radar") return 340 + legend;
  return 300 + legend;
}

function chartNode(code: string, meta: Meta): RootContent {
  const spec = buildChartSpec(code, meta);
  if (typeof spec === "string") return errorNode(spec, code);
  const table = h("table", [
    h("thead", [h("tr", [h("th", spec.category), ...spec.series.map((s) => h("th", s.name))])]),
    h(
      "tbody",
      spec.categories.map((c, i) =>
        h("tr", [
          h("th", { scope: "row" }, c),
          ...spec.series.map((s) => h("td", formatValue(s.values[i], spec.unit))),
        ]),
      ),
    ),
  ]);
  return asNode(
    h(
      "figure",
      {
        className: ["md-chart"],
        dataSource: code,
        dataChart: JSON.stringify(spec),
        style: `--chart-h: ${heightFrom(meta, chartHeight(spec))}px`,
      },
      [
        spec.title || spec.unit
          ? h("figcaption.md-chart-title", [
              spec.title ?? "",
              spec.unit ? h("span.md-chart-unit", `单位：${spec.unit}`) : null,
            ])
          : null,
        h("div.md-chart-plot", { ariaHidden: "true" }),
        h("div.md-chart-data", [table]),
      ],
    ),
  );
}

/* ------------------------------------------------------------------ */
/* echarts：完整的 ECharts 配置（JSON5，可以直接粘贴官网示例里的对象）           */
/* ------------------------------------------------------------------ */

function echartsNode(code: string, meta: Meta): RootContent {
  const src = code
    .trim()
    .replace(/^(?:(?:var|let|const)\s+)?option\s*=\s*/, "")
    .replace(/;\s*$/, "");
  let option: unknown;
  try {
    option = JSON5.parse(src);
  } catch (e) {
    const hint = /function\s*\(|=>/.test(src)
      ? "不支持 JavaScript 函数，formatter 请改用字符串模板，例如 '{b}：{c}'"
      : `配置格式不正确（${(e as Error).message.replace(/^JSON5:\s*/, "")}）`;
    const line = diagramErrorLine((e as Error).message, src);
    const offset = (code.slice(0, code.length - code.trimStart().length).match(/\n/g) ?? []).length;
    return errorNode(hint, code, line ? line + offset : undefined);
  }
  if (!option || typeof option !== "object" || Array.isArray(option)) {
    return errorNode("配置应该是一个对象，以 { 开头", code);
  }
  const title = meta.attrs.title;
  return asNode(
    h(
      "figure",
      {
        className: ["md-chart", "is-echarts"],
        dataSource: code,
        dataEcharts: JSON.stringify(option),
        style: `--chart-h: ${heightFrom(meta, 360)}px`,
      },
      [
        title ? h("figcaption.md-chart-title", title) : null,
        h("div.md-chart-plot", { ariaHidden: "true" }),
      ],
    ),
  );
}

/* ------------------------------------------------------------------ */
/* markmap：用 Markdown 的标题和列表写思维导图                                */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 节点内容只保留常用的行内格式 */
function inlineHtml(nodes: PhrasingContent[]): string {
  return nodes
    .map((n): string => {
      switch (n.type) {
        case "text":
          return escapeHtml(n.value);
        case "strong":
          return `<strong>${inlineHtml(n.children)}</strong>`;
        case "emphasis":
          return `<em>${inlineHtml(n.children)}</em>`;
        case "delete":
          return `<del>${inlineHtml(n.children)}</del>`;
        case "inlineCode":
          return `<code>${escapeHtml(n.value)}</code>`;
        case "break":
          return "<br>";
        case "link":
          return /^(https?:\/\/|\/)/i.test(n.url)
            ? `<a href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">${inlineHtml(n.children)}</a>`
            : inlineHtml(n.children);
        case "image":
          return escapeHtml(n.alt ?? "");
        default:
          return "children" in n
            ? inlineHtml(n.children as PhrasingContent[])
            : escapeHtml(toString(n));
      }
    })
    .join("");
}

type OutlineNode = { content: string; text: string; children: OutlineNode[] };

const mindParser = unified().use(remarkParse).use(remarkGfm);

function listNodes(list: List): OutlineNode[] {
  return list.children.map((item) => {
    const [first, ...rest] = item.children;
    const head = first?.type === "paragraph" ? first : null;
    const node: OutlineNode = {
      content: head ? inlineHtml(head.children) : "",
      text: head ? toString(head) : "",
      children: [],
    };
    for (const block of head ? rest : item.children) {
      if (block.type === "list") node.children.push(...listNodes(block));
      else if (block.type === "paragraph") {
        node.children.push({
          content: inlineHtml(block.children),
          text: toString(block),
          children: [],
        });
      }
    }
    return node;
  });
}

function buildMindTree(code: string, title?: string): OutlineNode | null {
  const tree = mindParser.parse(code) as Root;
  const root: OutlineNode = { content: "", text: "", children: [] };
  const stack: { depth: number; node: OutlineNode }[] = [{ depth: 0, node: root }];
  const current = () => stack[stack.length - 1].node;
  for (const block of tree.children) {
    if (block.type === "heading") {
      while (stack.length > 1 && stack[stack.length - 1].depth >= block.depth) stack.pop();
      const node: OutlineNode = {
        content: inlineHtml(block.children),
        text: toString(block),
        children: [],
      };
      current().children.push(node);
      stack.push({ depth: block.depth, node });
    } else if (block.type === "list") {
      current().children.push(...listNodes(block));
    } else if (block.type === "paragraph") {
      current().children.push({
        content: inlineHtml(block.children),
        text: toString(block),
        children: [],
      });
    }
  }
  if (!root.children.length) return null;
  // 只有一个顶层节点时它就是中心主题；否则用标题（或「主题」）作中心
  if (!title && root.children.length === 1) return root.children[0];
  root.text = title || "主题";
  root.content = escapeHtml(root.text);
  return root;
}

const pureTree = (n: OutlineNode): MindNode => ({
  content: n.content,
  children: n.children.map(pureTree),
});

function outline(n: OutlineNode): ElementContent {
  return h("li", [n.text, n.children.length ? h("ul", n.children.map(outline)) : null]);
}

const countLeaves = (n: OutlineNode): number =>
  n.children.length ? n.children.reduce((sum, c) => sum + countLeaves(c), 0) : 1;

function markmapNode(code: string, meta: Meta): RootContent {
  const tree = buildMindTree(code, meta.attrs.title);
  if (!tree) return errorNode("没有内容，用标题（#）或列表（-）写出层级", code);
  const expand = optionalNumber(meta.attrs.expand);
  const height = heightFrom(meta, clamp(countLeaves(tree) * 30 + 48, 220, 560));
  return asNode(
    h(
      "figure",
      {
        className: ["md-markmap"],
        dataMarkmap: JSON.stringify(pureTree(tree)),
        dataExpand: expand != null && expand > 0 ? String(Math.round(expand)) : undefined,
        style: `--chart-h: ${height}px`,
      },
      [
        h("div.md-markmap-plot", { ariaHidden: "true" }),
        h("ul.md-markmap-outline", [outline(tree)]),
      ],
    ),
  );
}

/* ------------------------------------------------------------------ */
/* 管线插件                                                                */
/* ------------------------------------------------------------------ */

export function remarkDiagrams() {
  return (tree: Root) => {
    visit(tree, "code", (c, index, parent) => {
      if (!parent || index == null) return;
      const lang = c.lang?.toLowerCase();
      let out: RootContent | null = null;
      if (lang === "mermaid") {
        out = asNode(
          h("div", { className: ["md-mermaid"], dataMermaid: "" }, [
            h("pre.mermaid-source", c.value),
          ]),
        );
      } else if (lang === "chart") {
        out = chartNode(c.value, parseMeta(c.meta));
      } else if (lang === "echarts") {
        out = echartsNode(c.value, parseMeta(c.meta));
      } else if (lang === "markmap") {
        out = markmapNode(c.value, parseMeta(c.meta));
      }
      if (!out) return;
      parent.children[index] = out as never;
      return SKIP;
    });
  };
}
