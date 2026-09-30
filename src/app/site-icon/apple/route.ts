import { getSettings } from "@/lib/settings";
import { cachedIcon, faviconKind, loadFaviconSource, renderIconPng } from "@/server/brand";

export const dynamic = "force-dynamic";

/**
 * iOS 主屏幕图标（180px，不透明底色）。
 * 只为上传的位图 / SVG 图标生成：默认印章里的文字依赖系统字体，服务端环境通常没有中文字体。
 */
export async function GET() {
  const { favicon } = getSettings();
  const kind = faviconKind(favicon);
  if (kind !== "raster" && kind !== "svg") return new Response("Not found", { status: 404 });

  try {
    const icon = await cachedIcon("apple", async () => ({
      body: await renderIconPng(await loadFaviconSource(favicon), 180, "#f7f4ee"),
      type: "image/png",
    }));
    return new Response(new Uint8Array(icon.body), {
      headers: { "Content-Type": icon.type, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
