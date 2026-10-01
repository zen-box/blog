/**
 * ANSI 转义序列解析：一个只关心「最终画面」的迷你终端。
 * 支持 SGR 颜色和样式（16 色 / 256 色 / 真彩色），以及进度条常用的
 * 回车、退格、光标移动和清行；清屏之类的整屏操作对日志没有意义，直接忽略。
 */
import { charWidth, type Cell, type Color, type Row, type Style } from "./cells";

const ESC = "\x1b";

/** 文本里是否带 SGR 颜色代码 */
export const hasAnsi = (text: string) => /\x1b\[[\d;:]*m/.test(text);

const TEXT_ESC = /(?:\\e|\\033|\\x1[bB]|\\u001[bB]|\^\[)(?=\[[\d;:]*m)/g;

/** Markdown 导出错误地转义了 ANSI 的左方括号。 */
export const hasMarkdownEscapedAnsi = (text: string) =>
  /(?:\x1b|\\e|\\033|\\x1[bB]|\\u001[bB]|\^\[)\\\[[\d;:]*m/.test(text);

/** 还原文字形式的 ESC，以及富文本导出时误加的 Markdown 转义。 */
export function restoreEscapes(text: string): string {
  if (hasMarkdownEscapedAnsi(text)) {
    text = text
      .replace(/\\([\\`*_{}\[\]()#+.!>\-])/g, "$1")
      .replace(/&#(?:x0*20|0*32);|&nbsp;/gi, " ");
  }
  const count = text.match(TEXT_ESC)?.length ?? 0;
  return text.includes(ESC) || count >= 2 ? text.replace(TEXT_ESC, ESC) : text;
}

const hex = (r: number, g: number, b: number): Color =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;

/** xterm 256 色：0–15 走调色板，其余换算成十六进制 */
function xterm256(n: number): Color | undefined {
  if (!Number.isInteger(n) || n < 0 || n > 255) return undefined;
  if (n < 16) return n;
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return hex(v, v, v);
  }
  const i = n - 16;
  const level = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return hex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6));
}

/** 解析 38/48 后面的扩展颜色，返回颜色和消耗的参数个数 */
function extendedColor(args: number[]): [Color | undefined, number] {
  if (args[0] === 5) return [xterm256(args[1]), 2];
  if (args[0] === 2) return [hex(args[1] ?? 0, args[2] ?? 0, args[3] ?? 0), 4];
  return [undefined, 1];
}

function applySgr(style: Style, params: string): Style {
  const s: Style = { ...style };
  const parts = params === "" ? ["0"] : params.split(";");
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    // 冒号形式的子参数：38:2::r:g:b、38:5:n、4:3（波浪下划线）
    if (part.includes(":")) {
      const sub = part.split(":").map((v) => (v === "" ? 0 : Number(v)));
      if (sub[0] === 38 || sub[0] === 48) {
        const args = sub[1] === 2 && sub.length > 5 ? [2, ...sub.slice(3)] : sub.slice(1);
        const [color] = extendedColor(args);
        if (sub[0] === 38) s.fg = color;
        else s.bg = color;
      } else if (sub[0] === 4) s.underline = sub[1] !== 0;
      continue;
    }
    const code = part === "" ? 0 : Number(part);
    if (code === 38 || code === 48) {
      const args = parts.slice(k + 1).map(Number);
      const [color, used] = extendedColor(args);
      if (code === 38) s.fg = color;
      else s.bg = color;
      k += used;
      continue;
    }
    if (code === 0) {
      for (const key of Object.keys(s)) delete s[key as keyof Style];
    } else if (code === 1) s.bold = true;
    else if (code === 2) s.dim = true;
    else if (code === 3) s.italic = true;
    else if (code === 4 || code === 21) s.underline = true;
    else if (code === 7) s.inverse = true;
    else if (code === 8) s.hidden = true;
    else if (code === 9) s.strike = true;
    else if (code === 22) s.bold = s.dim = false;
    else if (code === 23) s.italic = false;
    else if (code === 24) s.underline = false;
    else if (code === 27) s.inverse = false;
    else if (code === 28) s.hidden = false;
    else if (code === 29) s.strike = false;
    else if (code >= 30 && code <= 37) s.fg = code - 30;
    else if (code === 39) delete s.fg;
    else if (code >= 40 && code <= 47) s.bg = code - 40;
    else if (code === 49) delete s.bg;
    else if (code >= 90 && code <= 97) s.fg = code - 90 + 8;
    else if (code >= 100 && code <= 107) s.bg = code - 100 + 8;
  }
  return s;
}

const blank = (s: Style = {}): Cell => ({ ch: " ", w: 1, s });

export function parseAnsi(input: string): Row[] {
  const rows: Row[] = [[]];
  let r = 0;
  let c = 0;
  let style: Style = {};

  const line = () => {
    while (rows.length <= r) rows.push([]);
    return rows[r];
  };

  /** 覆盖到宽字符的某一半时，把另一半换成空格 */
  const breakWide = (row: Row, col: number) => {
    const cell = row[col];
    if (!cell) return;
    if (cell.w === 2 && row[col + 1]?.w === 0) row[col + 1] = blank(cell.s);
    if (cell.w === 0 && row[col - 1]?.w === 2) row[col - 1] = blank(row[col - 1].s);
  };

  const put = (ch: string, w: 1 | 2) => {
    const row = line();
    while (row.length < c) row.push(blank());
    breakWide(row, c);
    if (w === 2) breakWide(row, c + 1);
    row[c] = { ch, w, s: style };
    if (w === 2) row[c + 1] = { ch: "", w: 0, s: style };
    c += w;
  };

  const attach = (ch: string) => {
    const row = line();
    let col = Math.min(c, row.length) - 1;
    if (row[col]?.w === 0) col--;
    if (col >= 0) row[col].ch += ch;
  };

  const eraseLine = (mode: number) => {
    const row = line();
    if (mode === 0) row.length = Math.min(row.length, c);
    else if (mode === 1) for (let k = 0; k <= c && k < row.length; k++) row[k] = blank();
    else if (mode === 2) row.length = 0;
  };

  const csi = (params: string, final: string) => {
    if (/^[<=>?]/.test(params)) return; // 私有模式（隐藏光标等）
    if (final === "m") {
      style = applySgr(style, params);
      return;
    }
    const n = Math.max(1, Number(params.split(";")[0]) || 1);
    switch (final) {
      case "A":
        r = Math.max(0, r - n);
        break;
      case "B":
      case "e":
        r += n;
        break;
      case "C":
      case "a":
        c += n;
        break;
      case "D":
        c = Math.max(0, c - n);
        break;
      case "E":
        r += n;
        c = 0;
        break;
      case "F":
        r = Math.max(0, r - n);
        c = 0;
        break;
      case "G":
      case "`":
        c = n - 1;
        break;
      case "K":
        eraseLine(Number(params) || 0);
        break;
    }
  };

  for (let i = 0; i < input.length;) {
    const ch = input[i];
    if (ch === ESC) {
      const next = input[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < input.length && /[0-?]/.test(input[j])) j++;
        const params = input.slice(i + 2, j);
        while (j < input.length && /[ -/]/.test(input[j])) j++;
        csi(params, input[j] ?? "");
        i = j + 1;
      } else if (next === "]") {
        // OSC（窗口标题、超链接等）：到 BEL 或 ESC \ 为止
        let j = i + 2;
        while (
          j < input.length &&
          input[j] !== "\x07" &&
          !(input[j] === ESC && input[j + 1] === "\\")
        )
          j++;
        i = input[j] === "\x07" ? j + 1 : j + 2;
      } else if (next && "()*+".includes(next)) {
        i += 3; // 字符集切换
      } else {
        i += 2;
      }
      continue;
    }

    const cp = input.codePointAt(i)!;
    const char = String.fromCodePoint(cp);
    i += char.length;
    if (char === "\n") {
      r++;
      c = 0;
      line();
      continue;
    }
    if (char === "\r") {
      c = 0;
      continue;
    }
    if (char === "\b") {
      c = Math.max(0, c - 1);
      continue;
    }
    if (char === "\t") {
      c = (Math.floor(c / 8) + 1) * 8;
      continue;
    }
    const w = charWidth(cp);
    if (w === 0) {
      if (cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0)) attach(char);
      continue;
    }
    put(char, w);
  }

  while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}
