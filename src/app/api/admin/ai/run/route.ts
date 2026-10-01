import { aiRunSchema, createAiRunStream } from "@/server/ai";
import { aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = aiRunSchema.parse(await readAdminJson(request));
    return new Response(createAiRunStream(input, request), {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return aiHttpError(error);
  }
}
