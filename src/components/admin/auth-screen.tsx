"use client";

import { ArrowLeftIcon, ArrowRightIcon, LoaderIcon, ShieldCheckIcon } from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

import { completeSetup } from "@/app/admin/actions";
import { CodeInput } from "@/components/admin/code-input";
import { type BrandView, BrandMark } from "@/components/site/brand-mark";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, RESTART_CODES } from "@/lib/auth-errors";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/** 登录分两步：密码，然后是动态码或备用码（开启了两步验证时） */
type Step = "credentials" | "totp" | "backup";

/** 备用码不分大小写、忽略空格，漏掉中间的连字符也能识别 */
function normalizeBackupCode(input: string) {
  const s = input.toLowerCase().replace(/[\s-]/g, "");
  return s.length === 10 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

/** 内容高度变化时平滑过渡（切换步骤时卡片不会突然跳动） */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    // 留出边距，避免裁掉输入框的聚焦光环
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ duration: 0.45, ease: EASE }}
      className="-m-1.5 overflow-hidden"
    >
      <div ref={ref} className="p-1.5">
        {children}
      </div>
    </motion.div>
  );
}

export function AuthScreen({
  mode,
  next,
  brand,
  tokenFromEnv = false,
}: {
  mode: "login" | "setup";
  next: string;
  brand: BrandView;
  /** 设置令牌由环境变量 ADMIN_SETUP_TOKEN 指定；否则打印在服务器日志里 */
  tokenFromEnv?: boolean;
}) {
  const router = useRouter();
  const shake = useAnimationControls();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ token: "", name: "", email: "", password: "", confirm: "" });
  const [step, setStep] = useState<Step>("credentials");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const setup = mode === "setup";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  function fail(message: string) {
    setError(message);
    void shake.start({ x: [0, -8, 7, -5, 4, 0], transition: { duration: 0.45 } });
  }

  function goto(target: Step) {
    setStep(target);
    setError(null);
    setCode("");
    setBackupCode("");
  }

  function enter() {
    router.replace(next);
    router.refresh();
  }

  async function submitCredentials() {
    if (setup && form.password !== form.confirm) return fail("两次输入的密码不一致");
    if (setup && form.password.length < 8) return fail("密码至少需要 8 位");
    setPending(true);
    if (setup) {
      const { error: err } = await authClient.signUp.email({
        name: form.name.trim() || "博主",
        email: form.email.trim(),
        password: form.password,
        fetchOptions: { headers: { "x-setup-token": form.token.trim() } },
      });
      if (err) {
        setPending(false);
        return fail(authErrorMessage(err, "创建失败"));
      }
      await completeSetup(form.name);
      return enter();
    }

    const { data, error: err } = await authClient.signIn.email({
      email: form.email.trim(),
      password: form.password,
      rememberMe: true,
    });
    if (err) {
      setPending(false);
      // 不区分「邮箱不存在」和「密码错误」
      return fail(err.status === 429 ? "尝试次数太多，请稍后再试" : "邮箱或密码不正确");
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setPending(false);
      return goto("totp");
    }
    enter();
  }

  async function submitTwoFactor(totp = code) {
    const byTotp = step === "totp";
    const value = byTotp ? totp : normalizeBackupCode(backupCode);
    if (byTotp && value.length !== 6) return fail("请输入 6 位动态码");
    if (!byTotp && !value) return fail("请输入备用码");
    setPending(true);
    const { error: err } = byTotp
      ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
      : await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice });
    if (!err) return enter();

    setPending(false);
    if (err.code && RESTART_CODES.has(err.code)) {
      // 验证过期或这一轮失败次数用完：回到第一步重新输入密码
      goto("credentials");
      setForm((f) => ({ ...f, password: "" }));
    } else {
      setCode("");
    }
    fail(authErrorMessage(err, "验证失败，请重试"));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (step === "credentials") void submitCredentials();
    else void submitTwoFactor();
  }

  const title = step !== "credentials" ? "两步验证" : setup ? "欢迎，先创建管理员" : "登录后台";
  const subtitle =
    step === "totp"
      ? "打开手机上的身份验证器，输入显示的 6 位动态码。"
      : step === "backup"
        ? "输入开启两步验证时保存的备用码，每个备用码只能用一次。"
        : setup
          ? "这是博客的唯一账号，创建后将关闭注册。"
          : "继续写点什么吧。";

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
          <AutoHeight>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step === "credentials" ? "credentials" : "two-factor"}
                initial={{ opacity: 0, x: step === "credentials" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: step === "credentials" ? 20 : -20 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {step !== "credentials" && (
                  <div className="mb-5 grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
                    <ShieldCheckIcon className="size-5" />
                  </div>
                )}
                <h1 className="font-serif text-2xl font-semibold text-foreground">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

                {step === "credentials" ? (
                  <div className="mt-7 space-y-4">
                    {setup && (
                      <div className="space-y-2">
                        <Label htmlFor="token">设置令牌</Label>
                        <Input
                          id="token"
                          required
                          autoFocus
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={tokenFromEnv ? "" : "XXXX-XXXX-XXXX-XXXX"}
                          value={form.token}
                          onChange={set("token")}
                          className={cn(
                            "h-10 font-mono tracking-wider",
                            // 自动生成的令牌不分大小写，统一显示为大写
                            !tokenFromEnv && "uppercase",
                          )}
                        />
                        {tokenFromEnv ? (
                          <p className="text-xs leading-relaxed text-subtle">
                            填写环境变量 <code className="font-mono">ADMIN_SETUP_TOKEN</code> 的值。
                          </p>
                        ) : (
                          <div className="space-y-1.5 text-xs leading-relaxed text-subtle">
                            <p>防止别人抢先创建管理员。令牌打印在服务器日志里：</p>
                            <code className="block overflow-x-auto rounded-lg bg-muted px-2.5 py-1.5 font-mono whitespace-nowrap text-muted-foreground">
                              docker compose logs blog | grep 设置令牌
                            </code>
                            <p>
                              也可以打开数据目录下的{" "}
                              <code className="font-mono text-muted-foreground">.setup-token</code>{" "}
                              文件查看。
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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
                        autoFocus={!setup}
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
                ) : (
                  <div className="mt-7 space-y-5">
                    {step === "totp" ? (
                      <CodeInput
                        value={code}
                        onChange={(v) => {
                          setCode(v);
                          setError(null);
                        }}
                        onComplete={(v) => void submitTwoFactor(v)}
                        disabled={pending}
                        invalid={!!error}
                        autoFocus
                      />
                    ) : (
                      <Input
                        aria-label="备用码"
                        autoFocus
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="xxxxx-xxxxx"
                        value={backupCode}
                        onChange={(e) => {
                          setBackupCode(e.target.value);
                          setError(null);
                        }}
                        className="h-12 text-center font-mono text-lg tracking-[0.2em]"
                      />
                    )}
                    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-muted-foreground select-none">
                      <Checkbox
                        checked={trustDevice}
                        onCheckedChange={(v) => setTrustDevice(v === true)}
                      />
                      30 天内在这台设备上免验证
                    </label>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </AutoHeight>

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
                {step !== "credentials" ? "验证" : setup ? "创建并进入后台" : "登录"}
                <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover/submit:translate-x-0.5" />
              </>
            )}
          </button>

          {step !== "credentials" && (
            <div className="mt-5 flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => goto("credentials")}
                className="inline-flex items-center gap-1 text-subtle transition-colors hover:text-muted-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
                重新登录
              </button>
              <button
                type="button"
                onClick={() => goto(step === "totp" ? "backup" : "totp")}
                className="text-brand underline-offset-4 hover:underline"
              >
                {step === "totp" ? "手机不在身边？使用备用码" : "使用动态码"}
              </button>
            </div>
          )}
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
