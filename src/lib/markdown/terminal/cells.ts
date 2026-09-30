/**
 * 终端字符格模型：一行是按列排列的格子，宽字符占两列（第二列是占位格）。
 * ANSI 解析和纯文本着色都产出这种结构，再统一渲染成 HTML。
 */

/** 0–15 为终端调色板，其余颜色用十六进制 */
export type Color = number | `#${string}`;

export type Style = {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strike?: boolean;
  hidden?: boolean;
};

/** w = 0 表示宽字符右半边的占位格 */
export type Cell = { ch: string; w: 0 | 1 | 2; s: Style };
export type Row = Cell[];

type Range = readonly [number, number];

const inRanges = (cp: number, ranges: readonly Range[]) => {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
};

/** 不占宽度、依附在前一个字符上的码位：组合符号、零宽字符、变体选择符 */
const ZERO_WIDTH: Range[] = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xfeff, 0xfeff],
  [0x1f3fb, 0x1f3ff],
  [0xe0000, 0xe007f],
  [0xe0100, 0xe01ef],
];

/** 中日韩文字与全角符号：终端里占两列，字形来自中文字体，宽度恰好 1em */
const CJK: Range[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1b000, 0x1b16f],
  [0x20000, 0x3fffd],
];

/** 其他占两列的字符（主要是 emoji），字形宽度不固定 */
const WIDE_OTHER: Range[] = [
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f2ff],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f7e0, 0x1f7eb],
  [0x1f90c, 0x1f9ff],
  [0x1fa70, 0x1faff],
];

/** 等宽字体（JetBrains Mono 的已加载子集）里确定有的字符，可以直接排版 */
const NATIVE: Range[] = [
  [0x0020, 0x007e],
  [0x00a0, 0x02ff],
  [0x0370, 0x052f],
  [0x1e00, 0x1eff],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x20a0, 0x20c0],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
];

export function charWidth(cp: number): 0 | 1 | 2 {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp < 0x300) return 1;
  if (inRanges(cp, ZERO_WIDTH)) return 0;
  if (inRanges(cp, CJK) || inRanges(cp, WIDE_OTHER)) return 2;
  return 1;
}

/**
 * 字形的排版方式：
 * n 等宽字体自带；w 中文字体（靠字距补齐到两列）；
 * u / e 字形宽度不确定，逐字放进一列 / 两列宽的格子里
 */
export type GlyphKind = "n" | "w" | "u" | "e";

export function glyphKind(ch: string): GlyphKind {
  const cp = ch.codePointAt(0) ?? 0x20;
  if (inRanges(cp, NATIVE)) return "n";
  if (inRanges(cp, CJK)) return "w";
  return charWidth(cp) === 2 ? "e" : "u";
}

/** 把一行纯文本转成格子，处理制表符和控制字符 */
export function textToRow(text: string, style: Style = {}): Row {
  const row: Row = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\t") {
      const next = (Math.floor(row.length / 8) + 1) * 8;
      while (row.length < next) row.push({ ch: " ", w: 1, s: style });
      continue;
    }
    const w = charWidth(cp);
    if (w === 0) {
      // 组合字符并入前一个字符；行首或控制字符直接丢弃
      const prev = row.at(-1)?.w === 0 ? row.at(-2) : row.at(-1);
      if (prev && cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0)) prev.ch += ch;
      continue;
    }
    row.push({ ch, w, s: style });
    if (w === 2) row.push({ ch: "", w: 0, s: style });
  }
  return row;
}

export function textToRows(text: string): Row[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => textToRow(line));
}

/** 带分组下标的一次性匹配，相当于 /…/d.exec（编译目标不支持 d 标志的正则字面量） */
export function execD(re: RegExp, text: string): RegExpExecArray | null {
  const flags = re.flags.replace(/[gyd]/g, "");
  return new RegExp(re.source, flags + "d").exec(text);
}

/** 第 k 组在字符串里的 [起, 止)；该组没有参与匹配时返回 null */
export function span(m: RegExpExecArray, k: number): [number, number] | null {
  return m.indices?.[k] ?? null;
}

/** 按列给一段格子叠加样式 */
export function paintCols(row: Row, from: number, to: number, style: Style) {
  for (let c = Math.max(0, from); c < Math.min(to, row.length); c++) {
    row[c].s = { ...row[c].s, ...style };
  }
}

/**
 * 方便用正则处理的一行：text 是可见字符拼成的字符串，
 * col[i] 是 text 第 i 个 UTF-16 单元所在的列
 */
export class RowText {
  readonly text: string;
  private readonly col: number[];

  constructor(readonly row: Row) {
    let text = "";
    const col: number[] = [];
    row.forEach((cell, c) => {
      if (cell.w === 0) return;
      for (let k = 0; k < cell.ch.length; k++) col.push(c);
      text += cell.ch;
    });
    col.push(row.length);
    this.text = text;
    this.col = col;
  }

  /** 字符串下标 → 列 */
  colAt(index: number): number {
    return this.col[Math.max(0, Math.min(index, this.col.length - 1))];
  }

  /** 给字符串区间 [from, to) 叠加样式（宽字符的占位格一并处理） */
  paint(from: number, to: number, style: Style) {
    if (to <= from) return;
    paintCols(this.row, this.colAt(from), this.colAt(to), style);
  }

  /** 给正则每次匹配的第 group 组叠加样式；style 返回 null 表示跳过 */
  paintMatches(re: RegExp, style: Style | ((m: RegExpExecArray) => Style | null), group = 0) {
    for (const m of this.matches(re)) {
      const st = typeof style === "function" ? style(m) : style;
      const span = m.indices?.[group];
      if (st && span) this.paint(span[0], span[1], st);
    }
  }

  /** 全局匹配，带分组下标（d 标志） */
  *matches(re: RegExp): Generator<RegExpExecArray> {
    const flags = new Set([...re.flags, "g", "d"]);
    const g = new RegExp(re.source, [...flags].join(""));
    let m: RegExpExecArray | null;
    while ((m = g.exec(this.text))) {
      if (!m[0]) {
        g.lastIndex++;
        continue;
      }
      yield m;
    }
  }
}
