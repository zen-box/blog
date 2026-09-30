import { ZodError } from "zod";

import { getSettings } from "@/lib/settings";
import { applyLink } from "@/server/links";
import { clientIp, rateLimit } from "@/server/request";

export async function POST(request: Request) {
  if (!getSettings().links.allowApply) {
    return Response.json({ error: "暂未开放友链申请" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "请求格式错误" }, { status: 400 });
  if (typeof body.website2 === "string" && body.website2) {
    return Response.json({ error: "提交失败" }, { status: 400 });
  }
  if (!rateLimit(`link-apply:${clientIp(request.headers)}`, 3, 3_600_000)) {
    return Response.json({ error: "提交太频繁了，请稍后再试" }, { status: 429 });
  }
  try {
    await applyLink({
      name: String(body.name ?? ""),
      url: String(body.url ?? ""),
      avatar: body.avatar ? String(body.avatar) : undefined,
      description: String(body.description ?? ""),
      email: String(body.email ?? ""),
    });
    return Response.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof ZodError ? (e.issues[0]?.message ?? "内容格式不正确") : (e as Error).message;
    return Response.json({ error: message }, { status: 400 });
  }
}
