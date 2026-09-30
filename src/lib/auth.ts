import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DATA_DIR, db, schema } from "@/db";

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

export function adminExists(): boolean {
  const row = db.select({ n: count() }).from(schema.user).get();
  return (row?.n ?? 0) > 0;
}

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
      cookieCache: { enabled: true, maxAge: 5 * 60 },
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
        },
      },
    },
    advanced: {
      // 部署在 Caddy / Nginx 之后，使用反向代理传来的主机与协议
      trustedProxyHeaders: true,
    },
    plugins: [nextCookies()],
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
