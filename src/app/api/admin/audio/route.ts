import { z } from "zod";

import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import {
  audioOperationSchema,
  audioProse,
  enqueueAudio,
  getAudioAdminState,
  removeAudio,
  savePodcastScript,
} from "@/server/post-audio";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    const postId = z.coerce.number().int().positive().parse(params.get("postId"));
    // 写播客稿时才需要正文，平时轮询不渲染
    if (params.get("prose") === "1") return adminJson(await audioProse(postId));
    return adminJson(getAudioAdminState(postId));
  } catch (error) {
    return aiHttpError(error);
  }
}

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = audioOperationSchema.parse(await readAdminJson(request));
    switch (input.op) {
      case "synthesize":
        enqueueAudio(input.postId, input.kind);
        return adminJson(getAudioAdminState(input.postId), 202);
      case "savePodcast":
        return adminJson(savePodcastScript(input.postId, input.script));
      case "remove":
        return adminJson(await removeAudio(input.postId, input.kind));
    }
  } catch (error) {
    return aiHttpError(error);
  }
}
