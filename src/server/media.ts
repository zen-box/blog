import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { rgbaToThumbHash } from "thumbhash";

import { db, schema } from "@/db";
import type { Media } from "@/db/schema";

import {
  deleteUploadFiles,
  describeS3Error,
  localUploadPath,
  objectKey,
  s3Config,
  s3Head,
  s3Put,
  s3Ready,
  uploadTarget,
  writeUpload,
} from "./storage";

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** 用到时才加载 sharp：原生模块出问题时只影响上传，不连累其他功能 */
const loadSharp = async () => (await import("sharp")).default;
const MAX_WIDTH = 2400;
const THUMB_WIDTH = 800;

/** 会被转成 WebP 的位图格式 */
const RASTER = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/bmp",
]);

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT).map(([mime, ext]) => [ext, mime]),
);
MIME_BY_EXT.jpeg = "image/jpeg";

/** 浏览器没有给出文件类型时（常见于 .ico），按扩展名推断 */
export function normalizeMime(type: string, filename: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = path.extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function mediaUrl(relPath: string): string {
  return `/uploads/${relPath.split(path.sep).join("/")}`;
}

export async function thumbhashOf(input: Buffer): Promise<string | null> {
  try {
    const sharp = await loadSharp();
    const { data, info } = await sharp(input, { failOn: "none" })
      .rotate()
      .resize(100, 100, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64");
  } catch {
    return null;
  }
}

async function dimensionsOf(input: Buffer) {
  try {
    const sharp = await loadSharp();
    const meta = await sharp(input, { failOn: "none" }).metadata();
    return { width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

function datedDir(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function extFor(mime: string, filename: string): string {
  return (
    EXT[mime] ??
    (path
      .extname(filename)
      .slice(1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ||
      "bin")
  );
}

export type UploadResult = Media & { url: string };

/**
 * 保存上传文件：位图转 WebP（最大 2400px）并生成 800px 缩略图与 thumbhash 占位。
 * raw 模式保留原文件（用于 Logo、图标）。按设置存到本地或 S3。
 */
export async function saveUpload(
  buffer: Buffer,
  filename: string,
  mime: string,
  opts: { raw?: boolean } = {},
): Promise<UploadResult> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("文件过大（上限 30MB）");
  }
  const target = uploadTarget();
  const dir = datedDir();
  const id = nanoid(12);
  let row: typeof schema.media.$inferInsert;

  if (RASTER.has(mime) && !opts.raw) {
    const sharp = await loadSharp();
    const base = sharp(buffer, { failOn: "none" }).rotate();
    const main = await base
      .clone()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 76, effort: 5 })
      .toBuffer();
    const rel = `${dir}/${id}.webp`;
    const loc = await writeUpload(rel, main.data, "image/webp", target);
    await writeUpload(`${dir}/${id}.w${THUMB_WIDTH}.webp`, thumb, "image/webp", target);
    row = {
      filename,
      path: rel,
      mime: "image/webp",
      size: main.info.size,
      width: main.info.width,
      height: main.info.height,
      thumbhash: await thumbhashOf(buffer),
      storage: loc.storage,
      storageKey: loc.storage === "s3" ? loc.key : null,
    };
  } else {
    // 动图、SVG、图标、视频、附件等：保留原文件
    const ext = extFor(mime, filename);
    const rel = `${dir}/${id}.${ext}`;
    const loc = await writeUpload(rel, buffer, mime, target);
    const isImage = mime.startsWith("image/") && ext !== "ico";
    const dims = isImage ? await dimensionsOf(buffer) : { width: null, height: null };
    // 所有 .webp 都约定有一张缩略图，列表中会用到
    if (ext === "webp") {
      const sharp = await loadSharp();
      const thumb = await sharp(buffer, { failOn: "none" })
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 76 })
        .toBuffer();
      await writeUpload(`${dir}/${id}.w${THUMB_WIDTH}.webp`, thumb, "image/webp", target);
    }
    row = {
      filename,
      path: rel,
      mime,
      size: buffer.byteLength,
      ...dims,
      thumbhash: isImage && ext !== "svg" ? await thumbhashOf(buffer) : null,
      storage: loc.storage,
      storageKey: loc.storage === "s3" ? loc.key : null,
    };
  }

  const inserted = db.insert(schema.media).values(row).returning().get();
  return { ...inserted, url: mediaUrl(inserted.path) };
}

export function listMedia(opts: { page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 40;
  const page = Math.max(1, opts.page ?? 1);
  const items = db
    .select()
    .from(schema.media)
    .orderBy(desc(schema.media.createdAt), desc(schema.media.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  return items.map((m) => ({ ...m, url: mediaUrl(m.path) }));
}

export async function deleteMedia(id: number) {
  const row = db.select().from(schema.media).where(eq(schema.media.id, id)).get();
  if (!row) return;
  await deleteUploadFiles(row);
  db.delete(schema.media).where(eq(schema.media.id, id)).run();
}

/** 根据 URL 找到媒体记录（用于封面的尺寸与占位） */
export function findMediaByUrl(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/")) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(url.slice("/uploads/".length));
  } catch {
    return null;
  }
  return db.select().from(schema.media).where(eq(schema.media.path, rel)).get() ?? null;
}

export function localMediaCount(): number {
  return (
    db.select({ n: count() }).from(schema.media).where(eq(schema.media.storage, "local")).get()
      ?.n ?? 0
  );
}

/**
 * 把本地文件迁移到 S3：每次处理一批（按 id 递增，用 afterId 续传），
 * 上传后核对大小，成功才更新记录；可选删除本地副本。
 */
export async function migrateBatchToS3(opts: {
  afterId: number;
  limit: number;
  removeLocal: boolean;
}) {
  const c = s3Config();
  if (!s3Ready(c)) throw new Error("S3 配置不完整");
  const rows = db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.storage, "local"), gt(schema.media.id, opts.afterId)))
    .orderBy(asc(schema.media.id))
    .limit(opts.limit)
    .all();

  const failed: string[] = [];
  let migrated = 0;
  for (const row of rows) {
    try {
      const files: { rel: string; mime: string }[] = [{ rel: row.path, mime: row.mime }];
      if (row.path.endsWith(".webp")) {
        const thumbRel = row.path.replace(/\.webp$/, `.w${THUMB_WIDTH}.webp`);
        const exists = await fs
          .stat(localUploadPath(thumbRel))
          .then(() => true)
          .catch(() => false);
        if (exists) files.push({ rel: thumbRel, mime: "image/webp" });
      }
      for (const f of files) {
        const data = await fs.readFile(localUploadPath(f.rel));
        const key = objectKey(c, f.rel);
        await s3Put(c, key, data, f.mime);
        const head = await s3Head(c, key);
        if (head.ContentLength !== undefined && head.ContentLength !== data.byteLength) {
          throw new Error("上传后文件大小不一致");
        }
      }
      db.update(schema.media)
        .set({ storage: "s3", storageKey: objectKey(c, row.path) })
        .where(eq(schema.media.id, row.id))
        .run();
      if (opts.removeLocal) {
        for (const f of files) await fs.rm(localUploadPath(f.rel), { force: true });
      }
      migrated++;
    } catch (e) {
      const message =
        (e as NodeJS.ErrnoException).code === "ENOENT" ? "本地文件已不存在" : describeS3Error(e);
      failed.push(`${row.filename}：${message}`);
    }
  }
  return {
    migrated,
    failed,
    lastId: rows.at(-1)?.id ?? opts.afterId,
    done: rows.length < opts.limit,
  };
}
