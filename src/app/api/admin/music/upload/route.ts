import { adminJson, guardAiAdmin } from "@/server/ai-http";
import { MAX_UPLOAD_BYTES } from "@/server/media";
import { MusicError, uploadMusic } from "@/server/music";
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES + 1024 * 1024)
    return adminJson({ error: "音频文件超过 30MB" }, 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return adminJson({ error: "请选择音频文件" }, 400);
    return adminJson({ track: await uploadMusic(file) });
  } catch (error) {
    return adminJson(
      { error: error instanceof MusicError ? error.message : "音频上传失败，请检查文件或存储设置" },
      400,
    );
  }
}
