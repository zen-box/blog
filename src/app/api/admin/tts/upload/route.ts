import { randomBytes } from "node:crypto";

import { aiHttpError, adminJson, guardAiAdmin } from "@/server/ai-http";
import { saveUpload } from "@/server/media";
import { addCustomVoice } from "@/server/tts-config";

export const runtime = "nodejs";

/** 上传本人录音作为声音克隆的样本（MiMo 要求 mp3 / wav，Base64 后不超过 10MB） */
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  if (Number(request.headers.get("content-length")) > 8 * 1024 * 1024)
    return adminJson({ error: "录音文件不能超过 7MB" }, 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const name = String(form.get("name") ?? "").trim();
    if (form.get("consent") !== "1")
      return adminJson({ error: "只能克隆你本人的声音，请先确认" }, 400);
    if (!(file instanceof File)) return adminJson({ error: "请选择录音文件" }, 400);
    if (!name || name.length > 20)
      return adminJson({ error: "请给音色起一个 20 字以内的名字" }, 400);
    const ext = file.name.split(".").at(-1)?.toLowerCase();
    if (ext !== "mp3" && ext !== "wav") return adminJson({ error: "请上传 mp3 或 wav 录音" }, 400);
    if (!file.size || file.size > 7 * 1024 * 1024)
      return adminJson({ error: "录音文件不能超过 7MB" }, 400);
    const saved = await saveUpload(
      Buffer.from(await file.arrayBuffer()),
      `音色：${name}.${ext}`,
      ext === "wav" ? "audio/wav" : "audio/mpeg",
      { raw: true },
    );
    return adminJson(
      addCustomVoice({
        id: randomBytes(6).toString("hex"),
        name,
        sample: saved.url,
        source: "upload",
        note: "",
      }),
    );
  } catch (error) {
    return aiHttpError(error);
  }
}
