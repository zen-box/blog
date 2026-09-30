import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DATA_DIR, db, schema } from "@/db";
import { adminExists, clearSetupToken, notifyLogin, verifySetupToken } from "@/server/security";

export { adminExists };

/** 未配置 BETTER_AUTH_SECRET 时，首次启动自动生成并保存在数据目录 */
function resolveSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".auth-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(32).toString("base64url");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

/** 备用码只用小写字母和数字，去掉容易看错的 0/o、1/l/i，输入时不分大小写 */
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function backupCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const chars = Array.from(
      { length: 10 },
      () => BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)],
    );
    return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
  });
}

/** 两步验证插件在「密码正确、等待动态码」期间发给浏览器的临时 Cookie */
const TWO_FACTOR_CHALLENGE_COOKIE = "two_factor";

/**
 * 登录提醒：放在两步验证插件之后。开启两步验证时，密码正确后建立的临时会话会被那个插件删掉，
 * 到这里 newSession 已是 null；真正的会话在动态码验证通过后才出现
 */
const loginAlert = () =>
  ({
    id: "login-alert",
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            ctx.path === "/sign-in/email" ||
            ctx.path === "/two-factor/verify-totp" ||
            ctx.path === "/two-factor/verify-backup-code",
          handler: createAuthMiddleware(async (ctx) => {
            const created = ctx.context.newSession;
            if (!created) return;
            // 在设置页开启两步验证时也要验证一次动态码并换发会话，那不是新登录：
            // 只有带着登录挑战 Cookie 的验证才算
            if (ctx.path !== "/sign-in/email") {
              const challenge = ctx.context.createAuthCookie(TWO_FACTOR_CHALLENGE_COOKIE);
              if (!(await ctx.getSignedCookie(challenge.name, ctx.context.secret))) return;
            }
            notifyLogin(created.session, created.user.email);
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

function createAuth() {
  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, "");
  return betterAuth({
    appName: "Blog",
    secret: resolveSecret(),
    baseURL: siteUrl || undefined,
    trustedOrigins: siteUrl ? [siteUrl] : undefined,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // 每次都查数据库：「退出其他设备」立即生效（单管理员的 SQLite，查询开销可以忽略）
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // 博客只有一个管理员：已有账号后拒绝任何注册
          before: async (user) => {
            if (adminExists()) {
              throw new APIError("FORBIDDEN", { message: "管理员账号已存在" });
            }
            return { data: user };
          },
          after: async () => clearSetupToken(),
        },
      },
    },
    hooks: {
      // 初始化管理员：已有账号直接拒绝；否则必须带上服务器日志里的设置令牌
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        if (adminExists()) throw new APIError("FORBIDDEN", { message: "管理员账号已存在" });
        if (!verifySetupToken(ctx.headers?.get("x-setup-token"))) {
          throw new APIError("FORBIDDEN", { message: "设置令牌不正确，请查看服务器日志" });
        }
      }),
    },
    advanced: {
      // 部署在 Caddy / Nginx 之后，使用反向代理传来的主机与协议
      trustedProxyHeaders: true,
    },
    // nextCookies 必须放在最后
    plugins: [
      twoFactor({ backupCodeOptions: { customBackupCodesGenerate: backupCodes } }),
      loginAlert(),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

const holder = globalThis as typeof globalThis & { __blogAuth?: Auth };

/** 懒加载，避免构建阶段初始化 */
export function getAuth(): Auth {
  return (holder.__blogAuth ??= createAuth());
}

export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/** 服务端页面 / Server Action 的权限守卫 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}
