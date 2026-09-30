/** 上传图片的缩略图约定：xxx.webp → xxx.w800.webp（上传时生成） */
export function thumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(\/uploads\/.+?)\.webp$/.exec(url);
  return m ? `${m[1]}.w800.webp` : url;
}

export function isUploadUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("/uploads/");
}
