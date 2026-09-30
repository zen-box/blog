import { ZodError } from "zod";

import { getSession } from "@/lib/auth";
import { createComment } from "@/server/comments";
import { clientIp, rateLimit } from "@/server/request";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "请求格式错误" }, { status: 400 });

  // 蜜罐字段：正常用户看不到，不会填写
  if (typeof body.website === "string" && body.website) {
    return Response.json({ error: "提交失败" }, { status: 400 });
  }
  // 页面打开后过快提交，基本是机器人
  const openedAt = Number(body.t);
  if (!openedAt || Date.now() - openedAt < 3000) {
    return Response.json({ error: "提交太快了，请稍后再试" }, { status: 400 });
  }

  const session = await getSession().catch(() => null);
  const ip = clientIp(request.headers);
  if (!session) {
    if (!rateLimit(`comment:${ip}`, 1, 15_000) || !rateLimit(`comment-hour:${ip}`, 20, 3_600_000)) {
      return Response.json({ error: "评论太频繁，请稍后再试" }, { status: 429 });
    }
  }

  try {
    const result = await createComment(
      {
        postId: Number(body.postId),
        parentId: body.parentId ? Number(body.parentId) : null,
        author: String(body.author ?? ""),
        email: body.email ? String(body.email) : undefined,
        url: body.url ? String(body.url) : undefined,
        content: String(body.content ?? ""),
        notify: body.notify !== false,
      },
      { ip, userAgent: request.headers.get("user-agent") ?? "", isAdmin: !!session },
    );
    return Response.json(result);
  } catch (e) {
    const message =
      e instanceof ZodError ? (e.issues[0]?.message ?? "内容格式不正确") : (e as Error).message;
    return Response.json({ error: message || "提交失败" }, { status: 400 });
  }
}
