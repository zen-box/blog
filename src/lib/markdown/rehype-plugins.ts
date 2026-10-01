import type { Element, ElementContent, Root, RootContent } from "hast";
import { h } from "hastscript";
import { toString } from "hast-util-to-string";
import type { ShikiTransformer } from "shiki";
import { SKIP, visit } from "unist-util-visit";
import type { VFile } from "vfile";

/* ------------------------------------------------------------------ */
/* 代码块外框：标题 / 语言 / 复制按钮 / 行号                                   */
/* ------------------------------------------------------------------ */

const LANG_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  jsx: "JSX",
  tsx: "TSX",
  sh: "Shell",
  bash: "Bash",
  shell: "Shell",
  shellscript: "Shell",
  zsh: "Zsh",
  ps1: "PowerShell",
  powershell: "PowerShell",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  cpp: "C++",
  "c++": "C++",
  c: "C",
  cs: "C#",
  csharp: "C#",
  php: "PHP",
  rb: "Ruby",
  ruby: "Ruby",
  sql: "SQL",
  json: "JSON",
  jsonc: "JSONC",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  md: "Markdown",
  markdown: "Markdown",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  vue: "Vue",
  svelte: "Svelte",
  diff: "Diff",
  dockerfile: "Dockerfile",
  docker: "Dockerfile",
  nginx: "Nginx",
  ini: "INI",
  xml: "XML",
  text: "Text",
  txt: "Text",
  plaintext: "Text",
};

function parseTitle(meta: string): string | undefined {
  const m = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  return m?.[1] ?? m?.[2] ?? m?.[3];
}

export function transformerCodeFrame(): ShikiTransformer {
  return {
    name: "blog:code-frame",
    pre(pre) {
      const meta = this.options.meta?.__raw ?? "";
      const ln = /\b(?:showLineNumbers|lineNumbers|ln)(?:\{(\d+)\})?/.exec(meta);
      if (ln) {
        this.addClassToHast(pre, "has-line-numbers");
        if (ln[1]) {
          pre.properties.style = `--ln-start:${Number(ln[1]) - 1};${pre.properties.style ?? ""}`;
        }
      }
      if (/\b(?:wrap|wordWrap)\b/.test(meta)) this.addClassToHast(pre, "is-wrapped");
    },
    root(root) {
      const meta = this.options.meta?.__raw ?? "";
      const lang = String(this.options.lang ?? "text").toLowerCase();
      const title = parseTitle(meta);
      const collapse = /\b(?:collapse|fold)\b/.test(meta);
      const label = LANG_LABELS[lang] ?? lang.toUpperCase();

      const header = h("div.code-header", [
        title ? h("span.code-title", title) : h("span.code-title.is-lang", label),
        title ? h("span.code-lang", label) : null,
        h("button.code-copy", { type: "button", ariaLabel: "复制代码", title: "复制代码" }, [
          h("span.code-copy-text", "复制"),
        ]),
      ]);

      root.children = [
        h("figure.code-block", { dataLang: lang, dataCollapse: collapse ? "" : undefined }, [
          header,
          ...(root.children as ElementContent[]),
        ]),
      ];
    },
  };
}

/**
 * 行级标注：// [!code ++]、[!code --]、[!code highlight]、[!code focus]、
 * [!code error]、[!code warning]，可加数量如 [!code highlight:3]。
 * 在高亮之前直接处理源码，不受主题切分 token 的影响，任何注释写法都能识别。
 */
const NOTATION =
  /\s*(?:\/\/+|\/\*|#+|--|<!--|;+|%+|')\s*\[!code\s+(\+\+|--|highlight|hl|focus|error|warning)(?::(\d+))?\]\s*(?:\*\/|-->)?\s*$/;

const NOTATION_CLASSES: Record<string, string[]> = {
  "++": ["diff", "add"],
  "--": ["diff", "remove"],
  highlight: ["highlighted"],
  hl: ["highlighted"],
  focus: ["focused"],
  error: ["highlighted", "error"],
  warning: ["highlighted", "warning"],
};

export function transformerLineNotations(): ShikiTransformer {
  // codeToHast 是同步执行的，每个代码块在 preprocess 里重置状态
  let lineClasses = new Map<number, string[]>();
  return {
    name: "blog:line-notations",
    preprocess(code) {
      lineClasses = new Map();
      const out: string[] = [];
      let pending: { classes: string[]; count: number } | null = null;
      const add = (from: number, count: number, classes: string[]) => {
        for (let k = 0; k < count; k++) {
          const prev = lineClasses.get(from + k) ?? [];
          lineClasses.set(from + k, [...prev, ...classes]);
        }
      };
      for (const line of code.split("\n")) {
        const m = NOTATION.exec(line);
        if (!m) {
          if (pending) add(out.length, pending.count, pending.classes);
          pending = null;
          out.push(line);
          continue;
        }
        const classes = NOTATION_CLASSES[m[1]];
        const count = Math.max(1, Number(m[2] ?? 1));
        const stripped = line.slice(0, m.index);
        if (!stripped.trim()) {
          // 整行只有标注：作用于下一行
          pending = { classes, count };
          continue;
        }
        add(out.length, count, classes);
        out.push(stripped);
      }
      return out.join("\n");
    },
    line(node, lineNumber) {
      const classes = lineClasses.get(lineNumber - 1);
      if (classes) this.addClassToHast(node, classes);
    },
    pre(pre) {
      const all = new Set([...lineClasses.values()].flat());
      if (all.has("diff")) this.addClassToHast(pre, "has-diff");
      if (all.has("highlighted")) this.addClassToHast(pre, "has-highlighted");
      if (all.has("focused")) this.addClassToHast(pre, "has-focused");
    },
  };
}

/**
 * rehype-raw 会重建节点并丢掉 data.meta，
 * 先把代码块的 meta 存到属性里（Shiki 会读取 metastring）
 */
export function rehypePreserveCodeMeta() {
  return (tree: Root) => {
    visit(tree, "element", (el) => {
      if (el.tagName !== "code") return;
      const meta = (el.data as { meta?: string } | undefined)?.meta;
      if (meta) el.properties.metastring = meta;
    });
  };
}

/* ------------------------------------------------------------------ */
/* 图片：图注、多图拼排、懒加载、尺寸与模糊占位                               */
/* ------------------------------------------------------------------ */

export type ImageInfo = {
  width?: number;
  height?: number;
  placeholder?: string;
  /** 实际访问地址（例如 S3 直链），为空时保持原地址 */
  src?: string;
};
export type ImageResolver = (src: string) => ImageInfo | undefined;

const isBlank = (n: RootContent) =>
  (n.type === "text" && !n.value.trim()) || (n.type === "element" && n.tagName === "br");

function figure(img: Element): Element {
  const caption = img.properties.title ? String(img.properties.title) : "";
  delete img.properties.title;
  return h("figure.md-figure", [img, caption ? h("figcaption", caption) : null]);
}

export function rehypeImages(options: { resolve?: ImageResolver; zoom?: boolean } = {}) {
  const { resolve, zoom = true } = options;
  return (tree: Root) => {
    // 1. 只含图片的段落 → figure / 图集
    visit(tree, "element", (el, index, parent) => {
      if (!parent || index == null || el.tagName !== "p") return;
      const meaningful = el.children.filter((c) => !isBlank(c));
      if (!meaningful.length) return;
      const allImages = meaningful.every((c) => c.type === "element" && c.tagName === "img");
      if (!allImages) return;
      const imgs = meaningful as Element[];
      parent.children[index] =
        imgs.length === 1
          ? figure(imgs[0])
          : h("div.md-gallery", { dataCount: Math.min(imgs.length, 4) }, imgs.map(figure));
      return SKIP;
    });

    // 2. 所有图片：懒加载、尺寸、占位、灯箱
    visit(tree, "element", (el, _i, parent) => {
      if (el.tagName !== "img") return;
      const src = String(el.properties.src ?? "");
      el.properties.loading = "lazy";
      el.properties.decoding = "async";
      const info = resolve?.(src);
      if (info) {
        if (info.src) el.properties.src = info.src;
        if (info.width && info.height) {
          el.properties.width ??= info.width;
          el.properties.height ??= info.height;
        }
        if (info.placeholder) {
          el.properties.style = `background-image:url(${info.placeholder})`;
          el.properties.dataPlaceholder = "";
        }
      }
      const inLink = parent && parent.type === "element" && parent.tagName === "a";
      if (zoom && !inLink) {
        const cls = (el.properties.className as string[] | undefined) ?? [];
        el.properties.className = [...cls, "zoomable"];
      }
    });
  };
}

/* ------------------------------------------------------------------ */
/* 表格外层滚动容器                                                          */
/* ------------------------------------------------------------------ */

export function rehypeTableWrap() {
  return (tree: Root) => {
    visit(tree, "element", (el, index, parent) => {
      if (!parent || index == null || el.tagName !== "table") return;
      parent.children[index] = h(
        "div.md-table",
        { tabIndex: 0, role: "region", ariaLabel: "表格数据，可横向滚动" },
        [el],
      );
      return SKIP;
    });
  };
}

/* ------------------------------------------------------------------ */
/* 目录                                                                   */
/* ------------------------------------------------------------------ */

export function rehypeToc(options: { depths?: number[] } = {}) {
  const depths = new Set(options.depths ?? [2, 3, 4]);
  return (tree: Root, file: VFile) => {
    const toc: { id: string; text: string; depth: number }[] = [];
    visit(tree, "element", (el) => {
      const m = /^h([1-6])$/.exec(el.tagName);
      if (!m) return;
      const depth = Number(m[1]);
      const id = el.properties.id ? String(el.properties.id) : "";
      if (!depths.has(depth) || !id || id === "footnote-label") return;
      // 去掉标题锚点里的 “#”
      const text = toString({
        ...el,
        children: el.children.filter(
          (c) =>
            !(
              c.type === "element" &&
              (c.properties.className as string[] | undefined)?.includes("heading-anchor")
            ),
        ),
      }).trim();
      if (text) toc.push({ id, text, depth });
    });
    file.data.toc = toc;
  };
}

/* ------------------------------------------------------------------ */
/* 删除 HTML 注释（例如 <!-- more -->）                                      */
/* ------------------------------------------------------------------ */

export function rehypeRemoveComments() {
  return (tree: Root) => {
    visit(tree, "comment", (_c, index, parent) => {
      if (!parent || index == null) return;
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}
