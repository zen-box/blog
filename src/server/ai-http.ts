import "server-only";

import { ZodError } from "zod";
import { getAuth } from "@/lib/auth";
import { AiError, describeAiError } from "./ai";

export function adminJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

/** 单管理员站点：Better Auth 验证签名 Cookie 并实时检查数据库会话。 */
export async function guardAiAdmin(request: Request, mutation = false): Promise<Response | null> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return adminJson({ error: "请先登录" }, 401);
  } catch {
    return adminJson({ error: "登录状态验证失败，请重新登录" }, 503);
  }
  if (mutation) {
    let expected: string;
    try {
      expected = new URL(process.env.SITE_URL || request.url).origin;
    } catch {
      return adminJson({ error: "站点地址配置不正确" }, 503);
    }
    if (
      request.headers.get("origin") !== expected ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return adminJson({ error: "请求来源不正确，请从本站后台操作" }, 403);
    }
  }
  return null;
}

/** 有界读取，拒绝非法 JSON（不把解析器消息或请求内容返回给客户端）。 */
export async function readAdminJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AiError("请提交 JSON 格式的请求", 400);
  }
  if (!request.body) throw new AiError("请求内容不能为空", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2 * 1024 * 1024) throw new AiError("请求内容过大，请缩短文章或指令", 413);
      chunks.push(chunk.value);
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new AiError("请求 JSON 格式不正确", 400);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function aiHttpError(error: unknown): Response {
  if (error instanceof ZodError) return adminJson({ error: "请求参数或 AI 配置格式不正确" }, 400);
  const safe = describeAiError(error);
  return adminJson({ error: safe.message }, safe.status);
}
