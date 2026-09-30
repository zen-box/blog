import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "@/db";

/** 反向代理（Caddy / Nginx）之后的真实 IP */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "0.0.0.0";
}

const BOT =
  /bot|crawl|spider|slurp|curl|wget|python|httpclient|headless|lighthouse|preview|monitor|uptime|feed|rss/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

const secrets = new Map<string, string>();

/** 持久化在数据目录中的随机密钥（首次使用时生成） */
export function persistentSecret(name: string): string {
  const cached = secrets.get(name);
  if (cached) return cached;
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, `.${name}`);
  let value: string;
  try {
    value = fs.readFileSync(file, "utf8").trim();
  } catch {
    value = crypto.randomBytes(32).toString("base64url");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, value, { mode: 0o600 });
  }
  secrets.set(name, value);
  return value;
}

/** 访客指纹：加盐哈希，不保存原始 IP */
export function visitorHash(headers: Headers, scope = ""): string {
  return crypto
    .createHash("sha256")
    .update(
      `${persistentSecret("visitor-salt")}|${scope}|${clientIp(headers)}|${headers.get("user-agent") ?? ""}`,
    )
    .digest("base64url")
    .slice(0, 32);
}

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

/** 简单的内存限流：窗口内最多 limit 次 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    }
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
