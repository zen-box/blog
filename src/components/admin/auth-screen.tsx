"use client";

import { ArrowRightIcon, LoaderIcon } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { completeSetup } from "@/app/admin/actions";
import { type BrandView, BrandMark } from "@/components/site/brand-mark";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const EASE = [0.16, 1, 0.3, 1] as const;

export function AuthScreen({
  mode,
  next,
  brand,
}: {
  mode: "login" | "setup";
  next: string;
  brand: BrandView;
}) {
  const router = useRouter();
  const shake = useAnimationControls();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const setup = mode === "setup";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  function fail(message: string) {
    setError(message);
    void shake.start({ x: [0, -8, 7, -5, 4, 0], transition: { duration: 0.45 } });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (setup && form.password !== form.confirm) return fail("两次输入的密码不一致");
    if (setup && form.password.length < 8) return fail("密码至少需要 8 位");
    setPending(true);
    try {
      if (setup) {
        const { error: err } = await authClient.signUp.email({
          name: form.name.trim() || "博主",
          email: form.email.trim(),
          password: form.password,
        });
        if (err) throw new Error(err.message || "创建失败");
        await completeSetup(form.name);
      } else {
        const { error: err } = await authClient.signIn.email({
          email: form.email.trim(),
          password: form.password,
          rememberMe: true,
        });
        if (err) {
          throw new Error(err.status === 429 ? "尝试次数太多，请稍后再试" : "邮箱或密码不正确");
        }
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      fail((err as Error).message);
      setPending(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
      <div aria-hidden className="paper-grain" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand/[0.07] blur-3xl"
      />
      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: EASE }}
        className="relative w-full max-w-sm"
      >
        <Link href="/" className="group/logo mb-10 flex items-center justify-center gap-2.5">
          <BrandMark brand={brand} className="h-8" />
          {brand.showTitle && (
            <span className="font-serif text-lg font-semibold tracking-[0.08em] text-foreground">
              {brand.title}
            </span>
          )}
        </Link>

        <motion.form
          animate={shake}
          onSubmit={submit}
          className="rounded-3xl border border-border bg-card/90 p-7 shadow-float backdrop-blur"
        >
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {setup ? "欢迎，先创建管理员" : "登录后台"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {setup ? "这是博客的唯一账号，创建后将关闭注册。" : "继续写点什么吧。"}
          </p>

          <div className="mt-7 space-y-4">
            {setup && (
              <div className="space-y-2">
                <Label htmlFor="name">昵称</Label>
                <Input
                  id="name"
                  autoComplete="nickname"
                  placeholder="显示在文章和评论中"
                  value={form.name}
                  onChange={set("name")}
                  className="h-10"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={setup ? "new-password" : "current-password"}
                placeholder={setup ? "至少 8 位" : ""}
                value={form.password}
                onChange={set("password")}
                className="h-10"
              />
            </div>
            {setup && (
              <div className="space-y-2">
                <Label htmlFor="confirm">确认密码</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set("confirm")}
                  className="h-10"
                />
              </div>
            )}
          </div>

          <motion.p
            initial={false}
            animate={{ height: error ? "auto" : 0, opacity: error ? 1 : 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden text-sm text-destructive"
            role="alert"
          >
            <span className="block pt-4">{error}</span>
          </motion.p>

          <button
            type="submit"
            disabled={pending}
            className="group/submit mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
          >
            {pending ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <>
                {setup ? "创建并进入后台" : "登录"}
                <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover/submit:translate-x-0.5" />
              </>
            )}
          </button>
        </motion.form>

        <p className="mt-8 text-center text-xs text-subtle">
          <Link href="/" className="transition-colors hover:text-muted-foreground">
            ← 返回博客
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
