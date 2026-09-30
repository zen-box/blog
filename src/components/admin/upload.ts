export type Uploaded = {
  id: number;
  url: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
};

export async function uploadFiles(
  files: File[] | FileList,
  opts: { raw?: boolean } = {},
): Promise<Uploaded[]> {
  const list = Array.from(files);
  if (!list.length) return [];
  const form = new FormData();
  for (const f of list) form.append("file", f);
  const res = await fetch(opts.raw ? "/api/upload?raw=1" : "/api/upload", {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { files?: Uploaded[]; error?: string };
  if (!res.ok || !data.files) throw new Error(data.error ?? "上传失败");
  return data.files;
}

/** 上传结果对应的 Markdown：图片、视频、音频、其他附件 */
export function markdownFor(file: Uploaded): string {
  const name = file.filename.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
  if (file.mime.startsWith("image/")) return `![${name}](${file.url})`;
  if (file.mime.startsWith("video/")) return `::video{src="${file.url}"}`;
  if (file.mime.startsWith("audio/")) return `::audio{src="${file.url}"}`;
  return `[${file.filename}](${file.url})`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
