import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";

import { db, schema, UPLOAD_DIR } from "@/db";
import { getSettings, type SiteSettings } from "@/lib/settings";

/**
 * 上传文件的存储层。
 * 文章里始终使用 /uploads/<path> 这样的逻辑地址，每个文件在媒体表中记录自己存放在本地还是 S3，
 * 因此切换存储、更换 CDN 域名都不需要修改文章内容。
 */

export type S3Config = SiteSettings["storage"]["s3"];
export type Location = { storage: "local" } | { storage: "s3"; key: string };

const IMMUTABLE = "public, max-age=31536000, immutable";

export const s3Config = (): S3Config => getSettings().storage.s3;

export function s3Ready(c: S3Config): boolean {
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let cached: { key: string; client: S3Client } | undefined;

function client(c: S3Config): S3Client {
  const key = JSON.stringify([
    c.endpoint,
    c.region,
    c.accessKeyId,
    c.secretAccessKey,
    c.forcePathStyle,
  ]);
  if (cached?.key === key) return cached.client;
  cached?.client.destroy();
  const s3 = new S3Client({
    endpoint: c.endpoint.trim(),
    region: c.region.trim() || "auto",
    forcePathStyle: c.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId.trim(), secretAccessKey: c.secretAccessKey.trim() },
    // 新版 SDK 默认给请求附加 CRC 校验头，不少 S3 兼容服务（Garage、MinIO、国内云厂商）不支持
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  cached = { key, client: s3 };
  return s3;
}

/** 对象键：前缀 + 逻辑路径 */
export function objectKey(c: S3Config, relPath: string): string {
  const prefix = c.prefix.trim().replace(/^\/+/, "");
  return (prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix) + relPath;
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** 配置了公开访问地址时返回对象的直链，否则返回 null（由博客转发） */
export function s3PublicUrl(c: S3Config, key: string): string | null {
  const base = c.publicUrl.trim().replace(/\/+$/, "");
  return base ? `${base}/${encodeKey(key)}` : null;
}

export async function s3Put(c: S3Config, key: string, body: Buffer, contentType: string) {
  await client(c).send(
    new PutObjectCommand({
      Bucket: c.bucket.trim(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: IMMUTABLE,
    }),
  );
}

export async function s3Get(c: S3Config, key: string, range?: string) {
  return client(c).send(new GetObjectCommand({ Bucket: c.bucket.trim(), Key: key, Range: range }));
}

export async function s3Head(c: S3Config, key: string) {
  return client(c).send(new HeadObjectCommand({ Bucket: c.bucket.trim(), Key: key }));
}

export async function s3Delete(c: S3Config, key: string) {
  await client(c).send(new DeleteObjectCommand({ Bucket: c.bucket.trim(), Key: key }));
}

/* ------------------------------------------------------------------ */
/* 读写上传文件                                                           */
/* ------------------------------------------------------------------ */

export const localUploadPath = (relPath: string) =>
  path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, relPath);

/** 新上传的文件存到哪里；选择了 S3 但配置不完整时直接报错，避免悄悄存到本地 */
export function uploadTarget(): "local" | "s3" {
  const { driver, s3 } = getSettings().storage;
  if (driver !== "s3") return "local";
  if (!s3Ready(s3)) throw new Error("S3 配置不完整，请在「设置 → 存储」中补全后再上传");
  return "s3";
}

/** 写入一个文件（主文件或缩略图），返回它的位置 */
export async function writeUpload(
  relPath: string,
  data: Buffer,
  mime: string,
  target: "local" | "s3",
): Promise<Location> {
  if (target === "s3") {
    const c = s3Config();
    const key = objectKey(c, relPath);
    await s3Put(c, key, data, mime);
    return { storage: "s3", key };
  }
  const abs = localUploadPath(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return { storage: "local" };
}

const THUMB = /^(.*)(\.w\d+)\.webp$/;

/** 根据逻辑路径找到文件的实际位置；缩略图跟随原图 */
export function locateUpload(relPath: string): Location {
  const find = (p: string) =>
    db
      .select({
        storage: schema.media.storage,
        storageKey: schema.media.storageKey,
        path: schema.media.path,
      })
      .from(schema.media)
      .where(eq(schema.media.path, p))
      .get();

  const row = find(relPath);
  if (row) {
    return row.storage === "s3"
      ? { storage: "s3", key: row.storageKey ?? relPath }
      : { storage: "local" };
  }
  const thumb = THUMB.exec(relPath);
  if (thumb) {
    const main = find(`${thumb[1]}.webp`);
    if (main?.storage === "s3") {
      const mainKey = main.storageKey ?? main.path;
      return { storage: "s3", key: `${mainKey.replace(/\.webp$/, "")}${thumb[2]}.webp` };
    }
  }
  return { storage: "local" };
}

/**
 * 把 /uploads/... 逻辑地址换成实际访问地址：
 * 存在 S3 且配置了公开地址时返回直链，其余情况原样返回（由 /uploads 路由处理）
 */
export function resolveUploadUrl(url: string): string;
export function resolveUploadUrl(url: string | null | undefined): string | null;
export function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith("/uploads/")) return url ?? null;
  const c = s3Config();
  if (!c.publicUrl.trim()) return url;
  let rel: string;
  try {
    rel = decodeURIComponent(url.slice("/uploads/".length).split(/[?#]/)[0]);
  } catch {
    return url;
  }
  const loc = locateUpload(rel);
  return loc.storage === "s3" ? (s3PublicUrl(c, loc.key) ?? url) : url;
}

/** 读取上传文件的内容（生成图标、迁移时使用） */
export async function readUpload(relPath: string): Promise<Buffer> {
  const loc = locateUpload(relPath);
  if (loc.storage === "s3") {
    const obj = await s3Get(s3Config(), loc.key);
    return Buffer.from(await obj.Body!.transformToByteArray());
  }
  const root = path.resolve(/*turbopackIgnore: true*/ UPLOAD_DIR);
  const abs = path.resolve(root, relPath);
  if (!abs.startsWith(root + path.sep)) throw new Error("路径无效");
  return fs.readFile(abs);
}

/** 删除一个媒体文件及其缩略图 */
export async function deleteUploadFiles(row: {
  path: string;
  storage: "local" | "s3";
  storageKey: string | null;
}) {
  const isWebp = row.path.endsWith(".webp");
  if (row.storage === "s3") {
    const c = s3Config();
    const key = row.storageKey ?? row.path;
    const keys = isWebp ? [key, key.replace(/\.webp$/, ".w800.webp")] : [key];
    await Promise.all(keys.map((k) => s3Delete(c, k).catch(() => {})));
    return;
  }
  const abs = localUploadPath(row.path);
  await fs.rm(abs, { force: true });
  if (isWebp) await fs.rm(abs.replace(/\.webp$/, ".w800.webp"), { force: true });
}

/* ------------------------------------------------------------------ */
/* 错误提示                                                              */
/* ------------------------------------------------------------------ */

export function describeS3Error(e: unknown): string {
  const err = e as {
    name?: string;
    Code?: string;
    message?: string;
    code?: string;
    cause?: { code?: string };
  };
  const code = err.Code ?? err.name ?? "";
  const net = err.code ?? err.cause?.code ?? "";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET/.test(net + (err.message ?? ""))) {
    return "无法连接到 Endpoint，请检查地址和端口，以及服务器网络";
  }
  switch (code) {
    case "InvalidAccessKeyId":
      return "Access Key 不存在";
    case "SignatureDoesNotMatch":
      return "签名不匹配：请检查 Secret Key 和 Region";
    case "AuthorizationHeaderMalformed":
    case "PermanentRedirect":
      return "Region 不匹配，请检查 Region";
    case "NoSuchBucket":
      return "存储桶不存在";
    case "AccessDenied":
      return "没有权限：请确认这个密钥可以读写该存储桶";
    case "NotImplemented":
      return "服务不支持此请求，请尝试切换「路径风格」";
    default:
      return `${code || "请求失败"}${err.message && err.message !== code ? `：${err.message}` : ""}`;
  }
}

/* ------------------------------------------------------------------ */
/* 连接测试                                                              */
/* ------------------------------------------------------------------ */

export type TestStep = { label: string; ok: boolean; detail?: string };

/** 实际写入、读取、（经公开地址）访问并删除一个测试对象 */
export async function testS3Connection(c: S3Config): Promise<TestStep[]> {
  if (!s3Ready(c)) {
    return [
      { label: "配置", ok: false, detail: "请填写 Endpoint、Bucket、Access Key 和 Secret Key" },
    ];
  }
  const steps: TestStep[] = [];
  const key = objectKey(c, `.blog-connection-test-${Date.now().toString(36)}.txt`);
  const body = Buffer.from(`ok ${new Date().toISOString()}`);

  try {
    await s3Put(c, key, body, "text/plain");
    steps.push({ label: "写入", ok: true });
  } catch (e) {
    steps.push({ label: "写入", ok: false, detail: describeS3Error(e) });
    return steps;
  }

  try {
    const obj = await s3Get(c, key);
    const got = Buffer.from(await obj.Body!.transformToByteArray());
    const ok = got.equals(body);
    steps.push({ label: "读取", ok, detail: ok ? undefined : "读取到的内容与写入的不一致" });
  } catch (e) {
    steps.push({ label: "读取", ok: false, detail: describeS3Error(e) });
  }

  const publicUrl = s3PublicUrl(c, key);
  if (publicUrl) {
    try {
      const res = await fetch(publicUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const ok = res.ok && (await res.text()) === body.toString();
      steps.push({
        label: "公开访问",
        ok,
        detail: ok
          ? undefined
          : res.ok
            ? "能访问，但内容不一致：请确认公开地址对应这个存储桶（以及前缀之前的部分）"
            : `返回 ${res.status}：存储桶可能不允许公开读取（Garage 需开启 website 模式），也可以清空公开地址，改由博客转发`,
      });
    } catch (e) {
      steps.push({
        label: "公开访问",
        ok: false,
        detail: `无法访问 ${publicUrl}：${(e as Error).message}`,
      });
    }
  }

  try {
    await s3Delete(c, key);
    steps.push({ label: "删除", ok: true });
  } catch (e) {
    steps.push({ label: "删除", ok: false, detail: describeS3Error(e) });
  }
  return steps;
}
