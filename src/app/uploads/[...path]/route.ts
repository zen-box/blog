import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { UPLOAD_DIR } from "@/db";
import { locateUpload, s3Config, s3Get, s3PublicUrl } from "@/server/storage";

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

function baseHeaders(ext: string, contentType?: string) {
  const headers = new Headers({
    "Content-Type": contentType || TYPES[ext] || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  // 上传的 SVG 可能包含脚本：用沙箱 CSP 隔离
  if (ext === ".svg") {
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  }
  if (!TYPES[ext]) headers.set("Content-Disposition", "attachment");
  return headers;
}

/** 存在 S3 的文件：有公开地址时跳转，否则由博客转发（支持 Range，方便视频拖动进度） */
async function fromS3(request: Request, key: string, ext: string) {
  const c = s3Config();
  const publicUrl = s3PublicUrl(c, key);
  if (publicUrl) {
    return new Response(null, {
      status: 307,
      headers: { Location: publicUrl, "Cache-Control": "public, max-age=86400" },
    });
  }
  try {
    const obj = await s3Get(c, key, request.headers.get("range") ?? undefined);
    const headers = baseHeaders(ext, obj.ContentType);
    if (obj.ContentLength !== undefined) headers.set("Content-Length", String(obj.ContentLength));
    if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);
    if (obj.ETag) headers.set("ETag", obj.ETag);
    const status = obj.$metadata.httpStatusCode === 206 ? 206 : 200;
    return new Response(obj.Body!.transformToWebStream(), { status, headers });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound")
      return new Response("Not found", { status: 404 });
    if (name === "InvalidRange") return new Response(null, { status: 416 });
    return new Response("Storage unavailable", { status: 502 });
  }
}

export async function GET(request: Request, ctx: RouteContext<"/uploads/[...path]">) {
  const { path: parts } = await ctx.params;
  let rel: string;
  try {
    rel = parts.map((p) => decodeURIComponent(p)).join("/");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const ext = path.extname(rel).toLowerCase();

  const loc = locateUpload(rel);
  if (loc.storage === "s3") return fromS3(request, loc.key, ext);

  const root = path.resolve(/*turbopackIgnore: true*/ UPLOAD_DIR);
  const abs = path.resolve(/*turbopackIgnore: true*/ root, rel);
  // 防止路径穿越
  if (!abs.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(abs);
    if (!stat.isFile()) throw new Error();
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = baseHeaders(ext);
  headers.set("Last-Modified", stat.mtime.toUTCString());

  const range = request.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : stat.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = fs.createReadStream(abs, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(stat.size));
  const stream = fs.createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}
