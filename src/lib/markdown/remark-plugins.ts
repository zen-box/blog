import type { Element, ElementContent, Properties } from "hast";
import { h } from "hastscript";
import type {
  Blockquote,
  Code,
  Data,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import type { VFile } from "vfile";

import { icon } from "./icons";
import { TAB_NAMES, TABS_NAMES } from "./terminal";

/* ------------------------------------------------------------------ */
/* 工具                                                                  */
/* ------------------------------------------------------------------ */

type HData = Data & {
  hName?: string;
  hProperties?: Properties;
  hChildren?: ElementContent[];
};

/** 构造一个只用于输出 HTML 的自定义 mdast 节点 */
function node(
  hName: string,
  hProperties: Properties,
  children: RootContent[] | PhrasingContent[] = [],
  hChildren?: ElementContent[],
): RootContent {
  const data: HData = { hName, hProperties };
  if (hChildren) data.hChildren = hChildren;
  return { type: "blogNode", data, children } as unknown as RootContent;
}

function setData(target: { data?: Data }, data: HData) {
  target.data = { ...(target.data ?? {}), ...data } as Data;
}

type Directive = ContainerDirective | LeafDirective | TextDirective;

/** 取出容器指令 `:::name[标签]` 中的标签段落 */
function takeLabel(directive: ContainerDirective): PhrasingContent[] | null {
  const first = directive.children[0];
  if (
    first &&
    first.type === "paragraph" &&
    (first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel
  ) {
    directive.children.shift();
    return first.children;
  }
  return null;
}

function attr(d: Directive, ...names: string[]): string | undefined {
  for (const name of names) {
    const v = d.attributes?.[name];
    if (v != null && v !== "") return String(v);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* 提示框（容器指令 + GitHub 风格 [!NOTE]）                                  */
/* ------------------------------------------------------------------ */

const CALLOUTS = {
  note: { title: "备注", icon: "pencil" },
  info: { title: "信息", icon: "info" },
  tip: { title: "提示", icon: "lightbulb" },
  success: { title: "完成", icon: "check" },
  important: { title: "重要", icon: "message" },
  warning: { title: "注意", icon: "triangle" },
  caution: { title: "警告", icon: "octagon" },
  danger: { title: "危险", icon: "octagon" },
} as const;

type CalloutType = keyof typeof CALLOUTS;

const isCallout = (name: string): name is CalloutType => name in CALLOUTS;

function calloutChildren(
  type: CalloutType | "details",
  title: PhrasingContent[] | null,
  body: RootContent[],
  tag: "div" | "summary" = "div",
): RootContent[] {
  const cfg = type === "details" ? null : CALLOUTS[type];
  const titleContent: PhrasingContent[] =
    title && title.length ? title : [{ type: "text", value: cfg ? cfg.title : "详情" }];
  const iconEl = cfg ? icon(cfg.icon) : icon("chevron", "md-icon details-chevron");
  return [
    node(tag, { className: ["callout-title"] }, [
      node("span", { className: ["callout-icon"] }, [], [iconEl]),
      node("span", { className: ["callout-label"] }, titleContent),
    ] as RootContent[]),
    node("div", { className: ["callout-body"] }, body),
  ];
}

export function remarkAlerts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (bq: Blockquote) => {
      const first = bq.children[0];
      if (!first || first.type !== "paragraph") return;
      const head = first.children[0];
      if (!head || head.type !== "text") return;
      const m =
        /^\[!(note|tip|important|warning|caution|info|success|danger)\][ \t]*([^\n]*)(?:\n|$)/i.exec(
          head.value,
        );
      if (!m) return;
      const type = m[1].toLowerCase() as CalloutType;
      const custom = m[2].trim();
      head.value = head.value.slice(m[0].length);
      if (!head.value) first.children.shift();
      if (first.children[0]?.type === "break") first.children.shift();
      if (first.children.length === 0) bq.children.shift();

      const title: PhrasingContent[] | null = custom ? [{ type: "text", value: custom }] : null;
      setData(bq, {
        hName: "aside",
        hProperties: { className: ["callout", `callout-${type}`] },
      });
      bq.children = calloutChildren(type, title, bq.children) as never;
    });
  };
}

/* ------------------------------------------------------------------ */
/* 指令：提示框、折叠、标签页、代码组、嵌入、行内扩展                           */
/* ------------------------------------------------------------------ */

/** 标签名开头的 emoji（NodeQuality 导出的「💻基本信息」这类）单独包起来，方便留出间距 */
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;

function splitEmoji(label: string): { emoji: string; text: string } {
  const m = LEADING_EMOJI.exec(label);
  return m ? { emoji: m[1], text: label.slice(m[0].length) } : { emoji: "", text: label };
}

function tabsNode(labels: string[], panels: RootContent[]): RootContent {
  const buttons: Element[] = labels.map((label, i) => {
    const { emoji, text } = splitEmoji(label);
    return h(
      "button",
      {
        type: "button",
        role: "tab",
        className: ["md-tab"],
        ariaSelected: i === 0 ? "true" : "false",
        tabIndex: i === 0 ? 0 : -1,
        dataIndex: i,
      },
      emoji ? [h("span.md-tab-emoji", { ariaHidden: "true" }, emoji), text] : text,
    );
  });
  return node("div", { className: ["md-tabs"], dataTabs: "" }, [
    node("div", { className: ["md-tabs-list"], role: "tablist" }, [], buttons),
    ...panels,
  ]);
}

function panelProps(i: number, label: string) {
  return {
    className: ["md-tab-panel"],
    role: "tabpanel",
    ariaLabel: splitEmoji(label).text || label,
    dataIndex: i,
    hidden: i === 0 ? undefined : true,
  };
}

function handleContainer(d: ContainerDirective): boolean {
  const name = d.name.toLowerCase();

  if (isCallout(name)) {
    const label = takeLabel(d);
    setData(d, {
      hName: "aside",
      hProperties: { className: ["callout", `callout-${name}`] },
    });
    d.children = calloutChildren(name, label, d.children) as never;
    return true;
  }

  if (name === "details" || name === "fold") {
    const label = takeLabel(d);
    const open = d.attributes && "open" in d.attributes ? true : undefined;
    setData(d, {
      hName: "details",
      hProperties: { className: ["callout", "callout-details"], open },
    });
    d.children = calloutChildren("details", label, d.children, "summary") as never;
    return true;
  }

  // :::: tabs 与 ::: tab-item 是 NodeSeek / MyST 的写法，和 ::::tabs、:::tab 等价
  if (TABS_NAMES.has(name)) {
    const labels: string[] = [];
    const panels: RootContent[] = [];
    for (const child of d.children) {
      if (child.type !== "containerDirective" || !TAB_NAMES.has(child.name.toLowerCase())) continue;
      const label = takeLabel(child);
      const text = label
        ? toString({ type: "paragraph", children: label }).trim()
        : `标签 ${labels.length + 1}`;
      labels.push(text);
      setData(child, { hName: "div", hProperties: panelProps(panels.length, text) });
      child.name = "__tab-panel";
      panels.push(child);
    }
    if (!panels.length) return false;
    setData(d, { hName: "div", hProperties: { className: ["md-tabs-wrap"] } });
    d.children = [tabsNode(labels, panels)] as never;
    return true;
  }

  if (name === "code-group" || name === "codegroup") {
    const labels: string[] = [];
    const panels: RootContent[] = [];
    for (const child of d.children) {
      if (child.type !== "code") continue;
      const meta = child.meta ?? "";
      const m = /\[([^\]]+)\]/.exec(meta);
      const title = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
      const label = m?.[1] ?? title?.[1] ?? title?.[2] ?? title?.[3] ?? child.lang ?? "code";
      labels.push(label);
      child.meta = meta.replace(/\[[^\]]+\]/, "").trim() || null;
      panels.push(node("div", panelProps(panels.length, label), [child]));
    }
    if (!panels.length) return false;
    setData(d, { hName: "div", hProperties: { className: ["md-tabs-wrap", "md-code-group"] } });
    d.children = [tabsNode(labels, panels)] as never;
    return true;
  }

  return false;
}

function embed(kind: string, children: ElementContent[], ratio = true): HData {
  return {
    hName: "div",
    hProperties: {
      className: ["md-embed", `md-embed-${kind}`, ratio ? "md-embed-ratio" : ""].filter(Boolean),
    },
    hChildren: children,
  };
}

function iframe(src: string, title: string, extra: Record<string, unknown> = {}): Element {
  return h("iframe", {
    src,
    title,
    loading: "lazy",
    allowFullScreen: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    allow: "fullscreen; picture-in-picture; encrypted-media",
    ...extra,
  });
}

const SAFE_URL = /^(https?:\/\/|\/)[^\s"'<>]+$/i;

function handleLeaf(d: LeafDirective): boolean {
  const name = d.name.toLowerCase();
  const label = toString(d).trim();

  if (name === "bilibili" || name === "bili") {
    const id = attr(d, "bv", "bvid", "id") ?? label;
    const page = Number(attr(d, "p", "page") ?? 1) || 1;
    let query: string | null = null;
    if (/^BV[0-9A-Za-z]{10}$/.test(id)) query = `bvid=${id}`;
    else if (/^(av)?\d+$/i.test(id)) query = `aid=${id.replace(/^av/i, "")}`;
    if (!query) return false;
    setData(
      d,
      embed("video", [
        iframe(
          `https://player.bilibili.com/player.html?${query}&page=${page}&high_quality=1&danmaku=0&autoplay=0`,
          "哔哩哔哩视频",
          { sandbox: "allow-scripts allow-same-origin allow-popups allow-presentation" },
        ),
      ]),
    );
    return true;
  }

  if (name === "youtube") {
    const id = attr(d, "id", "v") ?? label;
    if (!/^[\w-]{11}$/.test(id)) return false;
    setData(
      d,
      embed("video", [iframe(`https://www.youtube-nocookie.com/embed/${id}`, "YouTube 视频")]),
    );
    return true;
  }

  if (name === "netease" || name === "music") {
    const id = attr(d, "id") ?? label;
    if (!/^\d+$/.test(id)) return false;
    const type = attr(d, "type") === "playlist" ? 0 : attr(d, "type") === "album" ? 1 : 2;
    const height = type === 2 ? 66 : 430;
    setData(
      d,
      embed(
        "music",
        [
          iframe(
            `https://music.163.com/outchain/player?type=${type}&id=${id}&auto=0&height=${height}`,
            "网易云音乐",
            { height: height + 20, allowFullScreen: undefined },
          ),
        ],
        false,
      ),
    );
    return true;
  }

  if (name === "video") {
    const src = attr(d, "src", "url") ?? label;
    if (!SAFE_URL.test(src)) return false;
    const poster = attr(d, "poster");
    setData(
      d,
      embed(
        "file-video",
        [
          h("video", {
            src,
            poster: poster && SAFE_URL.test(poster) ? poster : undefined,
            controls: true,
            preload: "metadata",
            playsInline: true,
          }),
        ],
        false,
      ),
    );
    return true;
  }

  if (name === "audio") {
    const src = attr(d, "src", "url") ?? label;
    if (!SAFE_URL.test(src)) return false;
    setData(d, embed("audio", [h("audio", { src, controls: true, preload: "none" })], false));
    return true;
  }

  // ::card[网址]：强制生成链接卡片（例如网址不是单独一行时）
  if (name === "card") {
    const url = attr(d, "url", "href") ?? label;
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return false;
    setData(d, {
      hName: "p",
      hProperties: { className: [LINK_CARD_SLOT] },
      hChildren: [h("a", { href: url }, url)],
    });
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* 链接卡片                                                              */
/* ------------------------------------------------------------------ */

/** 占位段落的 class；展示时由服务端替换成卡片（见 server/link-preview） */
export const LINK_CARD_SLOT = "link-card-slot";

/**
 * 单独一行、只有一个网址（显示的文字就是网址本身）的段落 → 链接卡片占位。
 * 写成 [文字](网址) 的仍是普通链接；列表、引用里的网址也不处理
 */
export function remarkLinkCards() {
  return (tree: Root) => {
    visit(tree, "paragraph", (p, _index, parent) => {
      if (!parent || (parent.type !== "root" && parent.type !== "containerDirective")) return;
      const parts = p.children.filter((c) => !(c.type === "text" && !c.value.trim()));
      const link = parts[0];
      if (parts.length !== 1 || link.type !== "link" || !/^https?:\/\//i.test(link.url)) return;
      const text = toString(link).trim();
      // www.example.com 这样的自动链接，地址会被补上 http://
      if (text !== link.url && !link.url.endsWith(`//${text}`)) return;
      setData(p, { hProperties: { className: [LINK_CARD_SLOT] } });
      p.children = [{ ...link, children: [{ type: "text", value: link.url }] }];
    });
  };
}

const BADGE_TYPES = new Set(["tip", "info", "warning", "danger", "success", "note"]);

function handleText(d: TextDirective): boolean {
  const name = d.name.toLowerCase();
  switch (name) {
    case "kbd":
      setData(d, { hName: "kbd" });
      return true;
    case "mark":
    case "sup":
    case "sub":
    case "u":
    case "del":
      setData(d, { hName: name === "u" ? "u" : name });
      return true;
    case "spoiler":
    case "heimu":
      setData(d, {
        hName: "span",
        hProperties: { className: ["md-spoiler"], tabIndex: 0, title: "点击查看" },
      });
      return true;
    case "badge":
    case "tag": {
      const type = attr(d, "type") ?? "tip";
      setData(d, {
        hName: "span",
        hProperties: {
          className: ["md-badge", `md-badge-${BADGE_TYPES.has(type) ? type : "tip"}`],
        },
      });
      return true;
    }
    case "ruby": {
      const rt = attr(d, "rt", "t");
      if (!rt) return false;
      setData(d, {
        hName: "ruby",
        hChildren: [{ type: "text", value: toString(d) }, h("rp", "("), h("rt", rt), h("rp", ")")],
      });
      return true;
    }
    case "abbr": {
      setData(d, { hName: "abbr", hProperties: { title: attr(d, "title") } });
      return true;
    }
    default:
      return false;
  }
}

/** 把未识别的指令还原成原始文本，例如 `key:value` 这样的普通内容 */
function directiveSource(d: Directive, colons: string): string {
  let src = colons + d.name;
  if (d.children.length && d.type !== "containerDirective") {
    src += `[${toString(d)}]`;
  }
  const attrs = Object.entries(d.attributes ?? {});
  if (attrs.length) {
    src += `{${attrs.map(([k, v]) => (v === "" || v == null ? k : `${k}="${v}"`)).join(" ")}}`;
  }
  return src;
}

function mergeText(parent: Parent) {
  const out: RootContent[] = [];
  for (const child of parent.children as RootContent[]) {
    const prev = out[out.length - 1];
    if (child.type === "text" && prev?.type === "text") {
      prev.value += child.value;
    } else {
      out.push(child);
    }
  }
  parent.children = out as never;
}

export function remarkBlogDirectives() {
  return (tree: Root) => {
    const touched = new Set<Parent>();
    visit(tree, (n, index, parent) => {
      if (!parent || index == null) return;
      if (n.type === "containerDirective") {
        // 已被上层处理过（例如标签页面板）
        if ((n.data as HData | undefined)?.hName) return;
        if (!handleContainer(n)) {
          const label = takeLabel(n);
          setData(n, { hName: "div", hProperties: { className: ["md-directive"] } });
          if (label) n.children.unshift({ type: "paragraph", children: label });
        }
        return;
      }
      if (n.type === "leafDirective") {
        if (!handleLeaf(n)) {
          parent.children[index] = {
            type: "paragraph",
            children: [{ type: "text", value: directiveSource(n, "::") }],
          } as never;
          return SKIP;
        }
        return SKIP;
      }
      if (n.type === "textDirective") {
        if (!handleText(n)) {
          parent.children[index] = {
            type: "text",
            value: directiveSource(n, ":"),
          } as never;
          touched.add(parent);
          return SKIP;
        }
      }
    });
    for (const p of touched) mergeText(p);
  };
}

/* ------------------------------------------------------------------ */
/* ==高亮==                                                              */
/* ------------------------------------------------------------------ */

export function remarkMark() {
  const re = /==(?=\S)(.+?)(?<=\S)==/g;
  return (tree: Root) => {
    visit(tree, "text", (t: Text, index, parent) => {
      if (!parent || index == null || !t.value.includes("==")) return;
      re.lastIndex = 0;
      const parts: RootContent[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t.value))) {
        if (m.index > last) parts.push({ type: "text", value: t.value.slice(last, m.index) });
        parts.push(node("mark", {}, [{ type: "text", value: m[1] }]));
        last = m.index + m[0].length;
      }
      if (!parts.length) return;
      if (last < t.value.length) parts.push({ type: "text", value: t.value.slice(last) });
      parent.children.splice(index, 1, ...(parts as never[]));
      return [SKIP, index + parts.length];
    });
  };
}

/* ------------------------------------------------------------------ */
/* Mermaid：交给浏览器端按需渲染                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function remarkMermaid() {
  return (tree: Root) => {
    visit(tree, "code", (c: Code, index, parent) => {
      if (!parent || index == null || c.lang?.toLowerCase() !== "mermaid") return;
      parent.children[index] = {
        type: "html",
        value: `<div class="md-mermaid" data-mermaid><pre class="mermaid-source">${escapeHtml(c.value)}</pre></div>`,
      } as never;
      return SKIP;
    });
  };
}

/* ------------------------------------------------------------------ */
/* 字数、阅读时长、摘要                                                      */
/* ------------------------------------------------------------------ */

export type TextStats = { wordCount: number; readingTime: number; excerpt: string };

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function countWords(text: string) {
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, " ").match(WORD)?.length ?? 0;
  return { cjk, words };
}

function plainText(nodes: RootContent[]): string {
  return nodes
    .filter((n) => n.type !== "code" && n.type !== "html" && n.type !== "math")
    .map((n) => toString(n, { includeHtml: false }))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max = 160): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("").trimEnd() + "…" : text;
}

/** 放在管线最前面：统计字数、生成摘要（支持 Hexo 风格的 <!-- more -->） */
export function remarkStats() {
  return (tree: Root, file: VFile) => {
    const text = plainText(tree.children);
    const { cjk, words } = countWords(text);
    const minutes = Math.max(1, Math.round(cjk / 400 + words / 200));

    const moreIndex = tree.children.findIndex(
      (n) => n.type === "html" && /<!--\s*more\s*-->/i.test(n.value),
    );
    const head =
      moreIndex >= 0
        ? tree.children.slice(0, moreIndex)
        : tree.children.filter((n) => n.type === "paragraph");
    const excerpt = moreIndex >= 0 ? plainText(head) : clip(plainText(head));

    file.data.stats = { wordCount: cjk + words, readingTime: minutes, excerpt } satisfies TextStats;
  };
}

declare module "vfile" {
  interface DataMap {
    stats: TextStats;
    toc: { id: string; text: string; depth: number }[];
  }
}
