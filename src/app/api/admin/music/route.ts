import { z, ZodError } from "zod";
import { adminJson, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import {
  deleteMusicTrack,
  getMusicConfig,
  listMusic,
  MusicError,
  musicConfigSchema,
  musicTrackSchema,
  reorderMusic,
  saveMusicConfig,
  saveMusicTrack,
} from "@/server/music";
const operation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), track: musicTrackSchema }).strict(),
  z.object({ op: z.literal("delete"), id: z.number().int().positive() }).strict(),
  z
    .object({ op: z.literal("reorder"), ids: z.array(z.number().int().positive()).max(1000) })
    .strict(),
  z.object({ op: z.literal("settings"), config: musicConfigSchema }).strict(),
]);
export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  return adminJson({ tracks: listMusic(), config: getMusicConfig() });
}
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = operation.parse(await readAdminJson(request));
    let id: number | undefined;
    if (input.op === "save") id = saveMusicTrack(input.track);
    else if (input.op === "delete") deleteMusicTrack(input.id);
    else if (input.op === "reorder") reorderMusic(input.ids);
    else saveMusicConfig(input.config);
    return adminJson({ id, tracks: listMusic(), config: getMusicConfig() });
  } catch (error) {
    return adminJson(
      {
        error:
          error instanceof MusicError
            ? error.message
            : error instanceof ZodError
              ? "音乐字段格式不正确，请检查地址和必填项"
              : "音乐操作失败，请检查输入或重试",
      },
      400,
    );
  }
}
