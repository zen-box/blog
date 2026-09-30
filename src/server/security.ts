import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, count, desc, eq, gt, inArray } from "drizzle-orm";

import { DATA_DIR, db, schema } from "@/db";
import { getSettings, siteUrl } from "@/lib/settings";

import { escapeHtml, mailConfigured, mailTemplate, sendMail } from "./mail";

export function adminExists(): boolean {
  const row = db.select({ n: count() }).from(schema.user).get();
  return (row?.n ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* 首次设置令牌                                                           */
/* ------------------------------------------------------------------ */

/**
 * 全新部署时，在创建管理员之前任何人都能打开初始化页面。
 * 为了防止被抢先创建，初始化需要一个只打印在服务器日志里的令牌；
 * 也可以用环境变量 ADMIN_SETUP_TOKEN 预先指定。管理员创建后令牌作废。
 */
const TOKEN_FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".setup-token");
/** 去掉容易看错的 0/O、1/I/L */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const normalize = (token: string) => token.toUpperCase().replace(/[^A-Z0-9]/g, "");

function generateToken(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** 管理员创建后令牌作废 */
export function clearSetupToken() {
  fs.rmSync(TOKEN_FILE, { force: true });
}

/** 当前有效的设置令牌；已有管理员时返回 null */
export function setupToken(): string | null {
  if (adminExists()) {
    clearSetupToken();
    return null;
  }
  if (process.env.ADMIN_SETUP_TOKEN) return process.env.ADMIN_SETUP_TOKEN;
  try {
    const saved = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (saved) return saved;
  } catch {
    // 还没有生成过；或者文件读不了（例如被 root 创建），删掉重新生成
    clearSetupToken();
  }
  const token = generateToken();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

export function verifySetupToken(input: string | null | undefined): boolean {
  const expected = setupToken();
  if (!expected || !input) return false;
  // 自动生成的令牌不分大小写、忽略分隔符；环境变量指定的令牌按原样比较（它可能含有任意字符）
  const [want, got] = process.env.ADMIN_SETUP_TOKEN
    ? [expected.trim(), input.trim()]
    : [normalize(expected), normalize(input)];
  if (!want) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const announced = globalThis as typeof globalThis & { __blogSetupAnnounced?: number };

/** 把令牌打印到服务器日志（启动时和打开初始化页面时，10 分钟内只打印一次） */
export function announceSetupToken() {
  const token = setupToken();
  if (!token) return;
  const now = Date.now();
  if (announced.__blogSetupAnnounced && now - announced.__blogSetupAnnounced < 10 * 60 * 1000)
    return;
  announced.__blogSetupAnnounced = now;
  const shown = process.env.ADMIN_SETUP_TOKEN ? "已由环境变量 ADMIN_SETUP_TOKEN 指定" : token;
  console.log(`[博客] 还没有管理员账号，创建管理员时需要填写设置令牌：${shown}`);
  console.log("[博客] 打开 /admin/login 完成初始化后，令牌自动作废。");
}

/* ------------------------------------------------------------------ */
/* 登录设备                                                              */
/* ------------------------------------------------------------------ */

export type DeviceInfo = { browser: string; os: string; mobile: boolean };

/** 从 User-Agent 里认出浏览器和系统，够展示用即可 */
export function describeDevice(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? "";
  const version = (re: RegExp) => re.exec(s)?.[1]?.split(".")[0];
  let browser = "未知浏览器";
  if (/Edg\//.test(s)) browser = `Edge ${version(/Edg\/([\d.]+)/) ?? ""}`;
  else if (/OPR\//.test(s)) browser = `Opera ${version(/OPR\/([\d.]+)/) ?? ""}`;
  else if (/Firefox\//.test(s)) browser = `Firefox ${version(/Firefox\/([\d.]+)/) ?? ""}`;
  else if (/Chrome\//.test(s)) browser = `Chrome ${version(/Chrome\/([\d.]+)/) ?? ""}`;
  else if (/Safari\//.test(s)) browser = `Safari ${version(/Version\/([\d.]+)/) ?? ""}`;
  else if (/curl|wget|node|python|go-http/i.test(s)) browser = "命令行工具";
  let os = "";
  if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";
  return { browser: browser.trim(), os, mobile: /Mobile|iPhone|Android/.test(s) };
}

/**
 * Better Auth 只保存 IPv6 地址的前 64 位（同一网段视为同一来源），并补全成 8 组 0000 的形式。
 * 展示时压缩成常见写法；全 0 是本机回环地址 ::1 被截断后的结果
 */
export function displayIP(ip: string | null | undefined): string {
  if (!ip || !ip.includes(":")) return ip ?? "";
  const groups = ip
    .toLowerCase()
    .split(":")
    .map((g) => g.replace(/^0+(?=.)/, ""));
  if (groups.every((g) => g === "0")) return "本机";
  const compressed = groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::");
  return groups.length === 8 && groups.slice(4).every((g) => g === "0")
    ? `${compressed}/64`
    : compressed;
}

export type LoginDevice = DeviceInfo & {
  id: string;
  current: boolean;
  ip: string;
  createdAt: number;
  /** 会话每天最多续期一次，所以这是「最近活动」的大致时间 */
  lastActive: number;
};

/** 当前账号仍然有效的登录会话：当前设备排第一，其余按最近活动排序（不含会话令牌） */
export function listDevices(userId: string, currentId: string): LoginDevice[] {
  return db
    .select()
    .from(schema.session)
    .where(and(eq(schema.session.userId, userId), gt(schema.session.expiresAt, new Date())))
    .orderBy(desc(schema.session.updatedAt))
    .all()
    .map((r) => ({
      id: r.id,
      current: r.id === currentId,
      ip: displayIP(r.ipAddress),
      createdAt: r.createdAt.getTime(),
      lastActive: r.updatedAt.getTime(),
      ...describeDevice(r.userAgent),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** 退出指定设备；返回退出的数量 */
export function revokeDevices(userId: string, ids: string[]): number {
  if (!ids.length) return 0;
  return db
    .delete(schema.session)
    .where(and(eq(schema.session.userId, userId), inArray(schema.session.id, ids)))
    .run().changes;
}

/* ------------------------------------------------------------------ */
/* 登录提醒                                                              */
/* ------------------------------------------------------------------ */

/** 登录成功后发邮件提醒；未配置 SMTP 或关闭了提醒时什么都不做，发送失败也不影响登录 */
export function notifyLogin(
  session: { ipAddress?: string | null; userAgent?: string | null },
  email: string,
) {
  const s = getSettings();
  if (!s.security.loginAlerts || !mailConfigured()) return;
  const device = describeDevice(session.userAgent);
  const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  const rows = [
    ["时间", `${time}（北京时间）`],
    ["IP", displayIP(session.ipAddress) || "未知"],
    ["设备", [device.browser, device.os].filter(Boolean).join(" · ")],
  ];
  const html = mailTemplate({
    title: "后台有一次新的登录",
    intro:
      "你的博客后台刚刚登录成功。如果是你本人，可以忽略这封邮件；如果不是，请立即修改密码，并在「登录设备」里退出其他设备。",
    body: rows.map(([k, v]) => `<strong>${k}</strong>：${escapeHtml(v)}`).join("<br>"),
    link: `${siteUrl()}/admin/settings#account`,
    linkText: "查看登录设备",
  });
  const to = s.smtp.notifyTo || email;
  void sendMail(to, `【${s.siteTitle}】后台新登录提醒`, html).catch((e) =>
    console.error("[login-alert]", e instanceof Error ? e.message : e),
  );
}
