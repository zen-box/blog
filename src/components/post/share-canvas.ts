"use client";

import { encode } from "uqr";

/** 分享图（金句卡片、分享海报）在浏览器里用 canvas 画：直接用页面已加载的字体，服务器不需要中文字体 */

const SERIF = '"Noto Serif SC Variable", "Source Han Serif SC", "Songti SC", "STSong", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
/** 分享图固定用浅色「宣纸」配色，不随页面明暗变化 */
const PAPER = "#f7f4ee";
const INK = "#1f1d1a";
const BODY = "#3a362f";
const MUTED = "#857d71";
const LINE = "#e4ddd1";

/** 品牌色按浅色主题的公式算（页面可能是暗色） */
function brand() {
  const hue = getComputedStyle(document.documentElement).getPropertyValue("--hue").trim() || "254";
  return `oklch(0.468 0.097 ${hue})`;
}

/** 行首不能出现的标点、行尾不能出现的开括号 */
const NO_START = new Set([..."，。、；：？！）」』】》〉”’…—·,.;:?!)]}%"]);
const NO_END = new Set([..."（「『【《〈“‘([{"]);

/** 按宽度断行：中文逐字、英文按词，处理行首行尾禁则；超过 maxLines 时末行加省略号 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = Infinity,
) {
  const tokens =
    text
      .replace(/\s+/g, " ")
      // 段落拼接留下的空格：中文标点后面不需要
      .replace(/([，。、；：？！）」』】》”…])\s+/gu, "$1")
      .trim()
      .match(/[A-Za-z0-9_\-'./:@#%&+]+|\s|./gu) ?? [];
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!line && token === " ") continue;
    const next = line + token;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    // 行首禁则：标点挂在上一行末尾
    if (NO_START.has(token)) {
      line = next;
      continue;
    }
    let carry = "";
    // 行尾禁则：开括号移到下一行
    if (NO_END.has(line.at(-1) ?? "")) {
      carry = line.at(-1)!;
      line = line.slice(0, -1);
    }
    lines.push(line.trimEnd());
    line = token === " " ? carry : carry + token;
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export async function loadFonts(text: string) {
  try {
    await Promise.all([
      document.fonts.load(`600 48px ${SERIF}`, text),
      document.fonts.load(`700 48px ${SERIF}`, text),
      document.fonts.load(`400 32px ${SERIF}`, text),
    ]);
  } catch {
    /* 字体加载失败就用系统字体 */
  }
}

/** 加载图片；跨域图片没有 CORS 时返回 null（画上去会污染画布，无法导出） */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 宣纸底色加极淡的颗粒 */
function paper(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  const grain = ctx.createImageData(width, height);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = Math.random() * 255;
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = v;
    grain.data[i + 3] = 7;
  }
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  layer.getContext("2d")!.putImageData(grain, 0, 0);
  ctx.drawImage(layer, 0, 0);
}

/** 二维码：白底圆角卡片，模块画成黑色方块 */
function qr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const code = encode(url, { ecc: "M", border: 0 });
  const pad = size * 0.08;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, size, size, 16);
  ctx.fill();
  const cell = (size - pad * 2) / code.size;
  ctx.fillStyle = INK;
  code.data.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell + 0.5, cell + 0.5);
    }),
  );
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale,
    sh = h / scale;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

export type ShareSource = {
  title: string;
  author: string;
  site: string;
  url: string;
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("生成图片失败"))),
      "image/png",
    ),
  );

/** 金句卡片：1080 宽，高度随文字长短变化 */
export async function quoteCard(quote: string, source: ShareSource) {
  await loadFonts(quote + source.title + source.site + source.author);
  const width = 1080,
    padX = 110;
  const measure = document.createElement("canvas").getContext("2d")!;
  // 字多时字号自动变小
  let size = 54;
  let lines: string[] = [];
  for (; size >= 38; size -= 4) {
    measure.font = `600 ${size}px ${SERIF}`;
    lines = wrapText(measure, quote, width - padX * 2);
    if (lines.length <= 11) break;
  }
  measure.font = `600 ${size}px ${SERIF}`;
  lines = wrapText(measure, quote, width - padX * 2, 13);
  const lineHeight = size * 1.75;
  const textHeight = lines.length * lineHeight;
  const height = Math.max(1080, 300 + textHeight + 90 + 330);
  // 出处固定在底部；字少时引文落在上方留白偏上的位置
  const footerTop = height - 330;
  const textTop = 300 + Math.max(0, footerTop - 90 - 300 - textHeight) * 0.4;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paper(ctx, width, height);
  const accent = brand();

  // 大引号
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.16;
  ctx.font = `700 300px ${SERIF}`;
  ctx.textBaseline = "top";
  ctx.fillText("“", padX - 30, textTop - 190);
  ctx.globalAlpha = 1;

  ctx.fillStyle = INK;
  ctx.font = `600 ${size}px ${SERIF}`;
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, i) => ctx.fillText(line, padX, textTop + i * lineHeight + size));

  // 出处
  ctx.fillStyle = accent;
  ctx.fillRect(padX, footerTop, 64, 4);
  ctx.fillStyle = BODY;
  ctx.font = `600 34px ${SERIF}`;
  const title = wrapText(ctx, `《${source.title}》`, width - padX * 2 - 230, 2);
  title.forEach((line, i) => ctx.fillText(line, padX, footerTop + 70 + i * 50));
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText(`${source.author} · ${source.site}`, padX, footerTop + 70 + title.length * 50 + 14);
  qr(ctx, source.url, width - padX - 190, footerTop + 30, 190);
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("扫码读全文", width - padX - 95, footerTop + 260);
  ctx.textAlign = "left";
  return toBlob(canvas);
}

/** 分享海报：封面、标题、摘要，底部是二维码 */
export async function posterCard(
  source: ShareSource & { excerpt: string; cover?: string; meta?: string },
) {
  await loadFonts(
    source.title + source.excerpt + source.site + source.author + (source.meta ?? ""),
  );
  const width = 1080,
    padX = 90;
  const image = source.cover ? await loadImage(source.cover) : null;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `700 64px ${SERIF}`;
  const title = wrapText(measure, source.title, width - padX * 2, 3);
  measure.font = `400 34px ${SANS}`;
  const excerpt = source.excerpt ? wrapText(measure, source.excerpt, width - padX * 2, 4) : [];

  const coverHeight = image ? 540 : 0;
  const top = image ? padX + coverHeight + 116 : 230;
  const titleBottom = top + title.length * 92;
  const excerptBottom = titleBottom + (excerpt.length ? 40 + excerpt.length * 58 : 0);
  const footerTop = excerptBottom + 80;
  const height = footerTop + 320;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paper(ctx, width, height);
  const accent = brand();

  if (image) cover(ctx, image, padX, padX, width - padX * 2, coverHeight, 36);
  else {
    // 没有封面：顶部一条品牌色的装饰
    ctx.fillStyle = accent;
    ctx.fillRect(padX, 120, 72, 6);
  }

  if (source.meta) {
    ctx.fillStyle = accent;
    ctx.font = `400 28px ${SANS}`;
    ctx.fillText(source.meta, padX, top - 44);
  }
  ctx.fillStyle = INK;
  ctx.font = `700 64px ${SERIF}`;
  title.forEach((line, i) => ctx.fillText(line, padX, top + 64 + i * 92));
  ctx.fillStyle = BODY;
  ctx.font = `400 34px ${SANS}`;
  excerpt.forEach((line, i) => ctx.fillText(line, padX, titleBottom + 40 + 34 + i * 58));

  ctx.fillStyle = LINE;
  ctx.fillRect(padX, footerTop, width - padX * 2, 2);
  ctx.fillStyle = INK;
  ctx.font = `600 38px ${SERIF}`;
  ctx.fillText(source.site, padX, footerTop + 105);
  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText(source.author, padX, footerTop + 152);
  ctx.fillText("长按识别二维码，阅读全文", padX, footerTop + 236);
  qr(ctx, source.url, width - padX - 210, footerTop + 50, 210);
  return toBlob(canvas);
}
