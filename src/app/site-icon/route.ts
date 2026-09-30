import { getSettings } from "@/lib/settings";
import {
  cachedIcon,
  defaultIconSvg,
  faviconKind,
  ICON_MIME,
  loadFaviconSource,
  renderIconPng,
} from "@/server/brand";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=86400";

function defaultIcon() {
  return new Response(defaultIconSvg(), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE },
  });
}

/** 网站图标：未设置时为主题色印章；位图统一缩成 64px PNG，SVG / ICO 原样返回 */
export async function GET() {
  const { favicon } = getSettings();
  const kind = faviconKind(favicon);
  if (kind === "default") return defaultIcon();

  try {
    const icon = await cachedIcon("icon", async () => {
      const source = await loadFaviconSource(favicon);
      if (kind === "raster") return { body: await renderIconPng(source, 64), type: "image/png" };
      return { body: source, type: ICON_MIME[kind] };
    });
    const headers = new Headers({
      "Content-Type": icon.type,
      "Cache-Control": CACHE,
      "X-Content-Type-Options": "nosniff",
    });
    if (kind === "svg") {
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    }
    return new Response(new Uint8Array(icon.body), { headers });
  } catch {
    // 自定义图标读取失败时退回默认图标，而不是显示破图
    return defaultIcon();
  }
}
