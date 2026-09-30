import { getAuth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, normalizeMime, saveUpload } from "@/server/media";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });

  // raw=1：保留原文件（Logo、网站图标），不转换为 WebP
  const raw = new URL(request.url).searchParams.get("raw") === "1";
  const form = await request.formData().catch(() => null);
  const files = form?.getAll("file").filter((f): f is File => f instanceof File) ?? [];
  if (!files.length) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const results = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: `${file.name} 超过 30MB` }, { status: 413 });
    }
    try {
      const saved = await saveUpload(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        normalizeMime(file.type, file.name),
        { raw },
      );
      results.push({
        id: saved.id,
        url: saved.url,
        filename: saved.filename,
        mime: saved.mime,
        size: saved.size,
        width: saved.width,
        height: saved.height,
      });
    } catch (e) {
      return Response.json(
        { error: `${file.name} 处理失败：${(e as Error).message}` },
        { status: 400 },
      );
    }
  }
  return Response.json({ files: results });
}
