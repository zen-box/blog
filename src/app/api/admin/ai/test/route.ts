import { testAi } from "@/server/ai";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    // Node 适配器也会为无内容的 POST 包装 stream；根据内容头判断是否需要解析。
    if (request.headers.has("content-type") || Number(request.headers.get("content-length")) > 0)
      await readAdminJson(request);
    return adminJson(await testAi(request));
  } catch (error) {
    return aiHttpError(error);
  }
}
