import { getAuth } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { renderLinkCards } from "@/server/link-preview";

/** 编辑器实时预览：与前台使用同一条渲染管线 */
export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { markdown?: unknown } | null;
  const markdown = typeof body?.markdown === "string" ? body.markdown : "";
  const r = await renderMarkdown(markdown);
  // 链接卡片在后台抓取；pendingLinks 大于 0 时编辑器稍后会再请求一次
  const cards = renderLinkCards(r.html, { preview: true });
  return Response.json({
    html: cards.html,
    pendingLinks: cards.pending,
    toc: r.toc,
    wordCount: r.wordCount,
    readingTime: r.readingTime,
  });
}
