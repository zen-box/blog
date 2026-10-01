export type TextDiff = { kind: "same" | "add" | "remove"; text: string };

/** 中文按词、其他语言按词与标点比较；长文按小节使用，避免平方级内存。 */
export function wordDiff(before: string, after: string): TextDiff[] {
  const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  const words = (text: string) => Array.from(segmenter.segment(text), (part) => part.segment);
  const a = words(before),
    b = words(after);
  if (a.length * b.length > 1_000_000)
    return [
      { kind: "remove", text: before },
      { kind: "add", text: after },
    ];
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) {
      rows[i][j] =
        a[i] === b[j] ? 1 + rows[i + 1][j + 1] : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  const out: TextDiff[] = [];
  const push = (kind: TextDiff["kind"], text: string) => {
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i++]);
      j++;
    } else if (j < b.length && (i === a.length || rows[i][j + 1] > rows[i + 1][j]))
      push("add", b[j++]);
    else push("remove", a[i++]);
  }
  return out;
}

export type ProtectedText = { text: string; pieces: { token: string; source: string }[] };
/** 保护 fenced blocks（终端、测评报告、图表）、公式、代码、卡片及平台标签。 */
export function protectText(source: string): ProtectedText {
  if (/__BLOG_AI_KEEP_/.test(source))
    throw new Error("正文含保留标记，请先移除 __BLOG_AI_KEEP_ 标记");
  const ranges: { from: number; to: number }[] = [];
  const collect = (pattern: RegExp) => {
    for (const match of source.matchAll(pattern))
      ranges.push({ from: match.index, to: match.index + match[0].length });
  };
  collect(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*(?=\n|$)/gm);
  collect(
    /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$\n])+\$|(`+)([^`\n]|(?!\1)`)*\1/g,
  );
  collect(/^.*(?:::card\[|::audio\[|::video\[|\{%|\x1b\[).*$/gm);
  for (const match of source.matchAll(/[^\n]+(?:\n[^\n]+)*/g)) {
    if (
      /(?:NodeQuality|Check\.Place|CPU Model|CPU 型号|系统信息|三网回程|IP Quality|流媒体解锁|[═─]{5}|[#=]{8})/i.test(
        match[0],
      )
    )
      ranges.push({ from: match.index, to: match.index + match[0].length });
  }
  // 未闭合代码块覆盖至文末；已闭合 fence 由上述范围保护。
  for (const match of source.matchAll(/^ {0,3}(`{3,}|~{3,})[^\n]*\n/gm)) {
    if (!ranges.some((range) => range.from <= match.index && range.to > match.index))
      ranges.push({ from: match.index, to: source.length });
  }
  const merged: typeof ranges = [];
  for (const range of ranges.sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && range.from < last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  const pieces: ProtectedText["pieces"] = [];
  let text = "",
    cursor = 0;
  for (const range of merged) {
    const token = `__BLOG_AI_KEEP_${pieces.length}__`;
    pieces.push({ token, source: source.slice(range.from, range.to) });
    text += source.slice(cursor, range.from) + token;
    cursor = range.to;
  }
  text += source.slice(cursor);
  return { text, pieces };
}
export function restoreProtected(result: string, protectedText: ProtectedText): string {
  const tokens = result.match(/__BLOG_AI_KEEP_[^\s]*?__/g) ?? [];
  if (
    tokens.length !== protectedText.pieces.length ||
    tokens.some((token, i) => token !== protectedText.pieces[i]?.token)
  ) {
    throw new Error("AI 改动了受保护内容的标记，结果已拒绝应用，请重新生成");
  }
  let out = result;
  for (const { token, source } of protectedText.pieces) {
    if (out.split(token).length !== 2) throw new Error("AI 丢失或重复了受保护内容，结果已拒绝应用");
    out = out.replace(token, () => source);
  }
  if (out.includes("__BLOG_AI_KEEP_")) throw new Error("AI 返回了无法识别的保护标记");
  return out;
}

export function unwrapMarkdown(value: string): string {
  return value.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1");
}
/** 排版变化排除常见 Markdown 标记后比较实际文字。保留链接、标点与大小写变化。 */
export function proseText(value: string): string {
  return value
    .replace(/^ {0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, "$1")
    .replace(/^\s*\|?[ :|-]+\|[ :|-]*$/gm, "")
    .replace(/[*_`~|\[\]\\\s]/g, "");
}
export type SectionChange = {
  before: string;
  after: string;
  title: string;
  from: number;
  to: number;
};
export function sectionChanges(before: string, after: string): SectionChange[] {
  const split = (value: string) => value.split(/(?=^#{1,6} )/m);
  const old = split(before),
    next = split(after);
  // 如果标题结构发生变化，用整篇差异，避免错误拼接小节。
  if (
    old.length !== next.length ||
    old.some((part, i) => part.match(/^#{1,6} .*/)?.[0] !== next[i].match(/^#{1,6} .*/)?.[0])
  ) {
    return [{ before, after, title: "全文", from: 0, to: before.length }];
  }
  let from = 0;
  return old
    .map((part, i) => {
      const item = {
        before: part,
        after: next[i],
        title: part.match(/^#{1,6} (.*)/)?.[1] ?? "开头",
        from,
        to: from + part.length,
      };
      from += part.length;
      return item;
    })
    .filter((item) => item.before !== item.after);
}
export type AiMetadata = {
  excerpt: string;
  seoDescription: string;
  slug: string;
  tags: string[];
  categoryId: number | null;
};
export function parseMetadata(text: string, categories: { id: number }[]): AiMetadata {
  try {
    const data = JSON.parse(text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i, "$1"));
    if (
      typeof data.excerpt !== "string" ||
      data.excerpt.length > 500 ||
      typeof data.seoDescription !== "string" ||
      data.seoDescription.length > 300 ||
      typeof data.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) ||
      data.slug.length > 120 ||
      !Array.isArray(data.tags) ||
      data.tags.length > 20 ||
      data.tags.some((tag: unknown) => typeof tag !== "string" || !tag.trim() || tag.length > 40) ||
      !(data.categoryId === null || categories.some((c) => c.id === data.categoryId))
    )
      throw Error();
    return data;
  } catch {
    throw new Error("AI 返回的文章信息格式不正确，请重新生成");
  }
}
