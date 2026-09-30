import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { clientIp, rateLimit } from "@/server/request";
import { likePost } from "@/server/stats";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { postId?: unknown } | null;
  const postId = typeof body?.postId === "number" ? body.postId : NaN;
  if (!Number.isInteger(postId)) return Response.json({ error: "参数错误" }, { status: 400 });

  if (!rateLimit(`like:${clientIp(request.headers)}`, 20, 60_000)) {
    return Response.json({ error: "操作太频繁" }, { status: 429 });
  }
  const exists = db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.status, "published")))
    .get();
  if (!exists) return Response.json({ error: "文章不存在" }, { status: 404 });

  return Response.json(likePost(request.headers, postId));
}
