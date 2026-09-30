import fs from "node:fs/promises";
import path from "node:path";

import { PREVIEW_DIR } from "@/server/link-preview";

/** 链接卡片缓存的封面和图标；文件名带内容哈希，可以长期缓存 */
export async function GET(_request: Request, ctx: RouteContext<"/link-preview/[file]">) {
  const { file } = await ctx.params;
  const m = /^[a-f0-9]{16}-(?:cover|icon)-[a-f0-9]{8}\.(webp|png)$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(/*turbopackIgnore: true*/ PREVIEW_DIR, file));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": m[1] === "png" ? "image/png" : "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
