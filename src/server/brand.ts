import "server-only";

import crypto from "node:crypto";

import type { BrandView } from "@/components/site/brand-mark";
import { brandHex } from "@/lib/color";
import { getSettings } from "@/lib/settings";

import { outboundFetch } from "./outbound";
import { readUpload, resolveUploadUrl } from "./storage";

export function getBrand(): BrandView {
  const s = getSettings();
  return {
    title: s.siteTitle,
    logo: s.logo ? resolveUploadUrl(s.logo) : null,
    logoDark: s.logoDark ? resolveUploadUrl(s.logoDark) : null,
    showTitle: !s.logo || s.showTitleWithLogo,
  };
}

export type IconKind = "default" | "svg" | "ico" | "raster";

export function faviconKind(url: string): IconKind {
  if (!url) return "default";
  const pathname = url.split(/[?#]/)[0].toLowerCase();
  if (pathname.endsWith(".svg")) return "svg";
  if (pathname.endsWith(".ico")) return "ico";
  return "raster";
}

export const ICON_MIME: Record<IconKind, string> = {
  default: "image/svg+xml",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  raster: "image/png",
};

/** 图标相关设置变化时改变，用于浏览器缓存刷新 */
export function iconVersion(): string {
  const s = getSettings();
  return crypto
    .createHash("md5")
    .update(`${s.favicon}|${s.siteTitle}|${s.accentHue}`)
    .digest("hex")
    .slice(0, 8);
}

const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

/** 默认图标：主题色底的站名首字印章，与页头的印章一致 */
export function defaultIconSvg(): string {
  const s = getSettings();
  const char = Array.from(s.siteTitle.trim())[0]?.toUpperCase() ?? "拾";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="${brandHex(s.accentHue)}"/>
<rect x="3.5" y="3.5" width="57" height="57" rx="11" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>
<text x="32" y="32" dy=".38em" text-anchor="middle" font-family="'Noto Serif SC','Source Han Serif SC','Songti SC','STSong','SimSun',serif" font-weight="700" font-size="36" fill="#fff">${escapeXml(char)}</text>
</svg>`;
}

/** 读取自定义图标的原始内容：站内上传（本地或 S3）或外部地址 */
export async function loadFaviconSource(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) {
    return readUpload(decodeURIComponent(url.slice("/uploads/".length).split(/[?#]/)[0]));
  }
  if (/^https?:\/\//i.test(url)) {
    // 与链接卡片共用出口设置：配置了代理时经代理下载，不暴露服务器 IP
    const res = await outboundFetch(url, {
      accept: "image/*,*/*;q=0.5",
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 8000,
    });
    return res.body;
  }
  throw new Error("无效的图标地址");
}

/** 把图标渲染为指定尺寸的 PNG；background 为空时保留透明 */
export async function renderIconPng(source: Buffer, size: number, background?: string) {
  const sharp = (await import("sharp")).default;
  let img = sharp(source, { failOn: "none", density: 384 }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) img = img.flatten({ background });
  return img.png().toBuffer();
}

const cache = new Map<string, { body: Buffer; type: string }>();

/** 生成结果按「设置版本 + 尺寸」缓存在内存中 */
export async function cachedIcon(key: string, make: () => Promise<{ body: Buffer; type: string }>) {
  const full = `${iconVersion()}:${key}`;
  const hit = cache.get(full);
  if (hit) return hit;
  const value = await make();
  if (cache.size > 20) cache.clear();
  cache.set(full, value);
  return value;
}
