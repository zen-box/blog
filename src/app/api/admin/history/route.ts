import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { AiError } from "@/server/ai";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import { createPostVersion, listPostVersions } from "@/server/post-history";
import { postInputSchema } from "@/server/post-service";

export const runtime = "nodejs";
const historyInput = z
  .object({
    postId: z.number().int().positive(),
    snapshot: postInputSchema.strict(),
    reason: z.enum(["ai", "restore"]),
  })
  .strict();

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    const rawId = new URL(request.url).searchParams.get("postId");
    if (!rawId || !/^[1-9]\d*$/.test(rawId)) throw new AiError("请提供有效的文章编号", 400);
    const postId = z.number().int().positive().safe().parse(Number(rawId));
    if (
      !db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.id, postId))
        .get()
    ) {
      throw new AiError("文章不存在", 404);
    }
    return adminJson({ versions: listPostVersions(postId) });
  } catch (error) {
    return aiHttpError(error);
  }
}

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = historyInput.parse(await readAdminJson(request));
    if (input.snapshot.id !== undefined && input.snapshot.id !== input.postId) {
      throw new AiError("历史快照与文章编号不一致", 400);
    }
    if (
      !db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(eq(schema.posts.id, input.postId))
        .get()
    ) {
      throw new AiError("文章不存在，请先保存草稿", 404);
    }
    return adminJson({ id: createPostVersion(input.postId, input.snapshot, input.reason) });
  } catch (error) {
    return aiHttpError(error);
  }
}
