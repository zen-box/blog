import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { count, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { parse } from "parse5";
import { thumbHashToDataURL } from "thumbhash";

import { DATA_DIR, db, schema } from "@/db";
import { LINK_CARD_SLOT } from "@/lib/markdown/remark-plugins";
import { getSettings } from "@/lib/settings";

import { thumbhashOf } from "./media";
import { outboundFetch } from "./outbound";

/**
 * 链接卡片：正文里单独一行的网址渲染成占位段落（link-card-slot），
 * 展示时再用缓存的标题、简介和封面替换成卡片。抓取在后台进行，不拖慢保存和页面。
 */

/** 缓存的封面和图标，由 /link-preview/[file] 提供访问 */
export const PREVIEW_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "link-previews");

const HOUR = 3600 * 1000;
/** 成功的结果 30 天后在后台刷新，失败的 6 小时后重试 */
const FRESH_OK = 30 * 24 * HOUR;
const FRESH_ERROR = 6 * HOUR;
const MAX_PARALLEL = 3;

type Preview = typeof schema.linkPreviews.$inferSelect;

const hash = (data: string | Buffer, length: number) =>
  createHash("sha1").update(data).digest("hex").slice(0, length);

const isStale = (p: Preview) =>
  Date.now() - p.fetchedAt.getTime() > (p.status === "ok" ? FRESH_OK : FRESH_ERROR);

/* ------------------------------------------------------------------ */
/* 解析网页                                                               */
/* ------------------------------------------------------------------ */

type Meta = {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  icons: { href: string; size: number }[];
};

type HtmlNode = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  value?: string;
};

/** 编码：优先响应头，其次页面里的 <meta charset>，默认 UTF-8（GBK 等中文编码都能解） */
function decodeHtml(body: Buffer, contentType: string): string {
  const sniff = body.subarray(0, 4096).toString("latin1");
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}

const clean = (s: string | undefined, max: number) => {
  const text = s?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return Array.from(text).length > max ? Array.from(text).slice(0, max).join("") + "…" : text;
};

function extractMeta(html: string, pageUrl: string): Meta {
  const doc = parse(html) as unknown as HtmlNode;
  const meta = new Map<string, string>();
  const icons: { href: string; size: number }[] = [];
  let title = "";
  let base = pageUrl;

  const walk = (node: HtmlNode) => {
    const attrs: Record<string, string> = {};
    for (const a of node.attrs ?? []) attrs[a.name.toLowerCase()] = a.value;
    if (node.nodeName === "meta") {
      const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
      if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
    } else if (node.nodeName === "link" && attrs.href) {
      const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
      const touch = rel.some((r) => r.startsWith("apple-touch-icon"));
      if (touch || rel.includes("icon")) {
        const sizes = (attrs.sizes ?? "").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0);
        icons.push({ href: attrs.href, size: Math.max(touch ? 180 : 0, ...sizes) });
      }
      if (rel.includes("image_src") && !meta.has("image_src")) meta.set("image_src", attrs.href);
    } else if (node.nodeName === "title" && !title) {
      title = (node.childNodes ?? []).map((c) => c.value ?? "").join("");
    } else if (node.nodeName === "base" && attrs.href) {
      try {
        base = new URL(attrs.href, pageUrl).href;
      } catch {
        /* 忽略无效的 base */
      }
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(doc);

  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v?.trim());
  const absolute = (href?: string) => {
    if (!href) return undefined;
    try {
      const url = new URL(href.trim(), base);
      return /^https?:$/.test(url.protocol) ? url.href : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    title: clean(pick("og:title", "twitter:title") || title, 160),
    description: clean(pick("og:description", "twitter:description", "description"), 300),
    siteName: clean(pick("og:site_name", "application-name", "apple-mobile-web-app-title"), 60),
    image: absolute(
      pick(
        "og:image:secure_url",
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
        "image_src",
      ),
    ),
    icons: icons
      .map((i) => ({ href: absolute(i.href) ?? "", size: i.size }))
      .filter((i) => i.href)
      .sort((a, b) => b.size - a.size),
  };
}

/* ------------------------------------------------------------------ */
/* 图片                                                                  */
/* ------------------------------------------------------------------ */

const loadSharp = async () => (await import("sharp")).default;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * .ico 不是 sharp 能读的格式：取出其中最大的一张。
 * 新式图标里嵌的是 PNG；老式的是 32 位 BMP，转成 RGBA 原始像素
 */
function decodeIco(
  buf: Buffer,
): { png: Buffer } | { raw: Buffer; width: number; height: number } | null {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const entries = [];
  for (let i = 0; i < buf.readUInt16LE(4); i++) {
    const at = 6 + i * 16;
    if (at + 16 > buf.length) break;
    entries.push({
      width: buf[at] || 256,
      size: buf.readUInt32LE(at + 8),
      offset: buf.readUInt32LE(at + 12),
    });
  }
  const best = entries.sort((a, b) => b.width - a.width)[0];
  if (!best) return null;
  const data = buf.subarray(best.offset, best.offset + best.size);
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return { png: data };
  if (data.length < 40) return null;
  const headerSize = data.readUInt32LE(0);
  const width = data.readInt32LE(4);
  const height = data.readInt32LE(8) / 2;
  if (data.readUInt16LE(14) !== 32 || width <= 0 || height <= 0) return null;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    // BMP 自下而上存储，像素顺序为 BGRA
    const row = headerSize + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = row + x * 4;
      const d = (y * width + x) * 4;
      if (s + 3 >= data.length) return null;
      raw[d] = data[s + 2];
      raw[d + 1] = data[s + 1];
      raw[d + 2] = data[s];
      raw[d + 3] = data[s + 3];
    }
  }
  return { raw, width, height };
}

async function download(src: string) {
  const res = await outboundFetch(src, {
    accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
    maxBytes: 8 * 1024 * 1024,
    timeoutMs: 15000,
  });
  return res.body;
}

async function writeCached(prefix: string, ext: string, data: Buffer) {
  const file = `${prefix}-${hash(data, 8)}.${ext}`;
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  await fs.writeFile(path.join(PREVIEW_DIR, file), data);
  return file;
}

/** 封面：最长边 720px 的 WebP，附带尺寸和 thumbhash 占位；太小的图（统计像素、小图标）不要 */
async function saveCover(key: string, src: string) {
  const sharp = await loadSharp();
  const { data, info } = await sharp(await download(src), { failOn: "none" })
    .rotate()
    .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  if (info.width < 80 || info.height < 60) return null;
  return {
    file: await writeCached(`${key}-cover`, "webp", data),
    width: info.width,
    height: info.height,
    thumbhash: await thumbhashOf(data),
  };
}

/** 网站图标：依次尝试页面声明的图标和 /favicon.ico，统一成 64px PNG */
async function saveIcon(key: string, candidates: string[]) {
  const sharp = await loadSharp();
  for (const src of candidates) {
    try {
      const body = await download(src);
      const ico = decodeIco(body);
      const input = !ico
        ? sharp(body, { failOn: "none", density: 300 })
        : "png" in ico
          ? sharp(ico.png)
          : sharp(ico.raw, { raw: { width: ico.width, height: ico.height, channels: 4 } });
      const png = await input
        .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      return await writeCached(`${key}-icon`, "png", png);
    } catch {
      /* 换下一个 */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 抓取与缓存                                                             */
/* ------------------------------------------------------------------ */

const fileName = (url: URL) => {
  const last = url.pathname.split("/").filter(Boolean).pop();
  try {
    return last ? decodeURIComponent(last) : url.hostname;
  } catch {
    return last ?? url.hostname;
  }
};

async function removeFiles(...files: (string | null | undefined)[]) {
  for (const file of files) {
    if (file) await fs.unlink(path.join(PREVIEW_DIR, file)).catch(() => {});
  }
}

function upsert(row: typeof schema.linkPreviews.$inferInsert) {
  db.insert(schema.linkPreviews)
    .values(row)
    .onConflictDoUpdate({ target: schema.linkPreviews.url, set: row })
    .run();
}

async function fetchPreview(url: string) {
  const key = hash(url, 16);
  const previous = db
    .select()
    .from(schema.linkPreviews)
    .where(eq(schema.linkPreviews.url, url))
    .get();
  try {
    const page = await outboundFetch(url, {
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      maxBytes: 1_500_000,
      stopAt: /<\/head\s*>/i,
      timeoutMs: 12000,
    });
    const type = (page.headers.get("content-type") ?? "").toLowerCase();
    const finalUrl = new URL(page.url);
    let meta: Meta;
    if (type.startsWith("image/")) {
      meta = { title: fileName(finalUrl), image: page.url, icons: [] };
    } else if (!type || /html|xml/.test(type)) {
      meta = extractMeta(decodeHtml(page.body, type), page.url);
    } else {
      meta = { title: fileName(finalUrl), icons: [] };
    }

    const icons = [
      ...new Set([...meta.icons.map((i) => i.href), `${finalUrl.origin}/favicon.ico`]),
    ];
    // undefined 表示封面下载失败（例如对方限流），null 表示没有合适的封面
    const [cover, fetchedIcon] = await Promise.all([
      meta.image ? saveCover(key, meta.image).catch(() => undefined) : null,
      saveIcon(key, icons.slice(0, 4)).catch(() => null),
    ]);
    // 暂时下载失败时沿用旧的封面和图标，并提前在 6 小时后重试
    const coverFailed = cover === undefined;
    const kept = coverFailed && previous?.image ? previous : null;
    const image = cover?.file ?? kept?.image ?? null;
    const icon = fetchedIcon ?? previous?.icon ?? null;
    upsert({
      url,
      status: "ok",
      title: meta.title ?? null,
      description: meta.description ?? null,
      siteName: meta.siteName ?? null,
      image,
      imageWidth: cover?.width ?? kept?.imageWidth ?? null,
      imageHeight: cover?.height ?? kept?.imageHeight ?? null,
      thumbhash: cover?.thumbhash ?? kept?.thumbhash ?? null,
      icon,
      error: coverFailed ? "封面下载失败，稍后重试" : null,
      fetchedAt: coverFailed ? new Date(Date.now() - FRESH_OK + FRESH_ERROR) : new Date(),
    });
    // 换成新文件后删掉旧的（文件名带内容哈希，内容没变时名字相同，不能删）
    await removeFiles(
      previous?.image !== image ? previous?.image : null,
      previous?.icon !== icon ? previous?.icon : null,
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (previous?.status === "ok") {
      // 刷新失败：保留原有内容，6 小时后再试
      db.update(schema.linkPreviews)
        .set({ error, fetchedAt: new Date(Date.now() - FRESH_OK + FRESH_ERROR) })
        .where(eq(schema.linkPreviews.url, url))
        .run();
    } else {
      upsert({
        url,
        status: "error",
        title: null,
        description: null,
        siteName: null,
        image: null,
        imageWidth: null,
        imageHeight: null,
        thumbhash: null,
        icon: null,
        error,
        fetchedAt: new Date(),
      });
    }
  }
}

type Queue = {
  inflight: Map<string, Promise<void>>;
  running: number;
  waiting: (() => void)[];
  /** 编辑器预览里第一次看到某个网址的时间 */
  seen: Map<string, number>;
};
const holder = globalThis as typeof globalThis & { __blogLinkPreview?: Queue };
const queue: Queue = (holder.__blogLinkPreview ??= {
  inflight: new Map(),
  running: 0,
  waiting: [],
  seen: new Map(),
});

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  while (queue.running >= MAX_PARALLEL) await new Promise<void>((r) => queue.waiting.push(r));
  queue.running++;
  try {
    return await fn();
  } finally {
    queue.running--;
    queue.waiting.shift()?.();
  }
}

/** 抓取（或刷新）一个网址；同一网址同时只抓一次，整体最多并发 3 个 */
export function refreshPreview(url: string): Promise<void> {
  let task = queue.inflight.get(url);
  if (!task) {
    task = slot(() => fetchPreview(url)).finally(() => queue.inflight.delete(url));
    queue.inflight.set(url, task);
  }
  return task;
}

/** 响应发出之后再做（不在请求上下文里时直接开始） */
function background(task: () => Promise<unknown>) {
  const run = () =>
    task().catch((e) => console.error("[link-preview]", e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** 编辑器预览：网址在两次预览之间保持不变（间隔 1 秒以上）才去抓，避免抓到输入到一半的网址 */
function settled(url: string) {
  const now = Date.now();
  for (const [u, t] of queue.seen) if (now - t > 10 * 60 * 1000) queue.seen.delete(u);
  const first = queue.seen.get(url);
  if (first === undefined) {
    queue.seen.set(url, now);
    return false;
  }
  return now - first >= 1000;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                  */
/* ------------------------------------------------------------------ */

const SLOT_OPEN = `<p class="${LINK_CARD_SLOT}">`;
const SLOT = new RegExp(`${SLOT_OPEN}<a href="([^"]*)"[^>]*>[\\s\\S]*?</a></p>`, "g");

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** 还原 HTML 属性值里的字符引用（渲染时 & 会写成 &#x26; 之类） */
const unescapeAttr = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(
      /&(amp|quot|lt|gt|apos);/g,
      (_, n: string) => ({ amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" })[n]!,
    );

const GLOBE =
  '<svg class="link-card-icon is-fallback" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

function fallbackTitle(url: URL) {
  const pathname = url.pathname.replace(/\/+$/, "");
  let readable = pathname;
  try {
    readable = decodeURIComponent(pathname);
  } catch {
    /* 保持原样 */
  }
  return url.hostname.replace(/^www\./, "") + readable;
}

function cardHtml(url: string, p: Preview | undefined, pending: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const ok = p?.status === "ok";
  const title = (ok && p.title) || fallbackTitle(parsed);
  const description = ok ? p.description : null;
  const site = (ok && p.siteName) || host;
  const icon =
    ok && p.icon
      ? `<img class="link-card-icon" src="/link-preview/${p.icon}" alt="" width="16" height="16" loading="lazy" decoding="async">`
      : GLOBE;

  let cover = "";
  if (ok && p.image) {
    let placeholder = "";
    if (p.thumbhash) {
      try {
        const data = thumbHashToDataURL(Buffer.from(p.thumbhash, "base64"));
        placeholder = ` style="background-image:url(${data})" data-placeholder`;
      } catch {
        /* 没有占位也无妨 */
      }
    }
    const size =
      p.imageWidth && p.imageHeight ? ` width="${p.imageWidth}" height="${p.imageHeight}"` : "";
    cover = `<span class="link-card-cover"><img src="/link-preview/${p.image}" alt=""${size} loading="lazy" decoding="async"${placeholder}></span>`;
  }

  const classes = ["link-card", cover && "has-cover", pending && "is-pending"]
    .filter(Boolean)
    .join(" ");
  return (
    `<a class="${classes}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="link-card-body">` +
    `<span class="link-card-title">${escapeHtml(title)}</span>` +
    (description ? `<span class="link-card-desc">${escapeHtml(description)}</span>` : "") +
    (pending ? `<span class="link-card-skeleton" aria-hidden="true"></span>` : "") +
    `<span class="link-card-meta">${icon}<span class="link-card-site">${escapeHtml(site)}</span>` +
    (site !== host ? `<span class="link-card-host">${escapeHtml(host)}</span>` : "") +
    `</span></span>${cover}</a>`
  );
}

/**
 * 把文章 HTML 里的链接卡片占位替换成卡片：有缓存用缓存，没有或过期的在后台抓取。
 * 关闭链接卡片时还原成普通链接。preview 用于后台编辑器，pending 是还在等待抓取的数量
 */
export function renderLinkCards(html: string, opts: { preview?: boolean } = {}) {
  if (!html.includes(SLOT_OPEN)) return { html, pending: 0 };
  if (!getSettings().linkCards.enabled) {
    return { html: html.replaceAll(SLOT_OPEN, "<p>"), pending: 0 };
  }

  const urls = [...new Set([...html.matchAll(SLOT)].map((m) => unescapeAttr(m[1])))];
  const rows = urls.length
    ? db.select().from(schema.linkPreviews).where(inArray(schema.linkPreviews.url, urls)).all()
    : [];
  const cache = new Map(rows.map((r) => [r.url, r]));
  const due = urls.filter((u) => !cache.has(u) || isStale(cache.get(u)!));
  const todo = opts.preview ? due.filter((u) => cache.has(u) || settled(u)) : due;
  if (todo.length) background(() => Promise.all(todo.map(refreshPreview)));

  const out = html.replace(SLOT, (_, href: string) => {
    const url = unescapeAttr(href);
    return cardHtml(url, cache.get(url), !!opts.preview && !cache.has(url));
  });
  return { html: out, pending: urls.filter((u) => !cache.has(u)).length };
}

export const withLinkCards = (html: string) => renderLinkCards(html).html;

export function linkPreviewCount(): number {
  return db.select({ n: count() }).from(schema.linkPreviews).get()?.n ?? 0;
}

/** 清空缓存：所有卡片会在下次展示时重新抓取 */
export async function clearLinkPreviews(): Promise<number> {
  const n = linkPreviewCount();
  db.delete(schema.linkPreviews).run();
  await fs.rm(PREVIEW_DIR, { recursive: true, force: true });
  return n;
}
