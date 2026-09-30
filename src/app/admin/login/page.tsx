import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/admin/auth-screen";
import { adminExists, getSession } from "@/lib/auth";
import { getBrand } from "@/server/brand";
import { announceSetupToken } from "@/server/security";

export const metadata: Metadata = { title: "登录", robots: { index: false } };

/** 只允许站内相对路径，防止开放重定向 */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//")
    ? next
    : "/admin";
}

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const target = safeNext(next);
  const session = await getSession();
  if (session) redirect(target);

  const setup = !adminExists();
  // 初始化页面被打开时，把设置令牌再打印一次到服务器日志
  if (setup) announceSetupToken();

  return (
    <AuthScreen
      mode={setup ? "setup" : "login"}
      next={target}
      brand={getBrand()}
      tokenFromEnv={!!process.env.ADMIN_SETUP_TOKEN}
    />
  );
}
