import { clientIp, rateLimit } from "@/server/request";
import { getPostViews, trackView } from "@/server/stats";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    postId?: unknown;
  } | null;
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/";
  const postId =
    typeof body?.postId === "number" && Number.isInteger(body.postId) ? body.postId : undefined;

  if (!rateLimit(`track:${clientIp(request.headers)}`, 120, 60_000)) {
    return Response.json({ ok: false }, { status: 429 });
  }
  trackView(request.headers, path, postId);
  return Response.json({ ok: true, views: postId ? getPostViews(postId) : undefined });
}
