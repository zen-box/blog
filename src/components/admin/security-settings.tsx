"use client";

import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LoaderIcon,
  LogOutIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { encode } from "uqr";

import { revokeDevicesAction } from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { SiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { LoginDevice } from "@/server/security";

import { CodeInput } from "./code-input";
import { Row, Section } from "./settings-ui";

const EASE = [0.16, 1, 0.3, 1] as const;

export type AccountInfo = {
  email: string;
  twoFactorEnabled: boolean;
  /** 剩余可用的备用码数量 */
  backupCodesLeft: number;
  devices: LoginDevice[];
};

const outlineButton =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50";
const primaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50";

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what}已复制`);
  } catch {
    toast.error("复制失败，请手动选中后复制");
  }
}

export function SecuritySettings({
  account,
  security,
  onSecurityChange,
  mailReady,
  issuer,
}: {
  account: AccountInfo;
  security: SiteSettings["security"];
  onSecurityChange: (v: SiteSettings["security"]) => void;
  mailReady: boolean;
  /** 身份验证器里显示的名称（站点名称） */
  issuer: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"enable" | "disable" | "regenerate" | null>(null);
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const enabled = account.twoFactorEnabled;
  const left = account.backupCodesLeft;

  return (
    <>
      <Section id="account" title="账号与安全" description={`管理员账号：${account.email}`}>
        <PasswordRow onChanged={() => router.refresh()} />

        <Row label="两步验证" hint="登录时除了密码，还要输入手机身份验证器里的动态码">
          {enabled ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <ShieldCheckIcon className="size-3.5" />
                  已开启
                </span>
                <span
                  className={cn(
                    "text-xs",
                    left <= 3 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                  )}
                >
                  剩余 {left} 个备用码{left <= 3 && "，建议重新生成"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDialog("regenerate")}
                  className={outlineButton}
                >
                  重新生成备用码
                </button>
                <button
                  type="button"
                  onClick={() => setDialog("disable")}
                  className={cn(outlineButton, "text-destructive hover:bg-destructive/5")}
                >
                  关闭两步验证
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                未开启。开启后，即使密码泄露，没有你的手机也登录不了后台。
              </p>
              <button
                type="button"
                onClick={() => setDialog("enable")}
                className={cn(primaryButton, "h-8 px-3")}
              >
                <ShieldCheckIcon className="size-3.5" />
                开启两步验证
              </button>
            </div>
          )}
        </Row>

        <Row
          label="登录提醒"
          hint="每次登录成功都发邮件，收件人是「邮件通知」里的通知邮箱，没填时发到管理员邮箱"
        >
          <div className="space-y-2">
            <Switch
              checked={security.loginAlerts}
              onCheckedChange={(v) => onSecurityChange({ ...security, loginAlerts: v })}
            />
            {security.loginAlerts && !mailReady && (
              <p className="w-fit rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                还没有配置 SMTP，提醒邮件发不出去。
                <a href="#mail" className="underline underline-offset-4">
                  去配置
                </a>
              </p>
            )}
          </div>
        </Row>
      </Section>

      <DevicesSection devices={account.devices} onRevoked={() => router.refresh()} />

      <EnableDialog
        open={dialog === "enable"}
        onClose={() => setDialog(null)}
        issuer={issuer}
        email={account.email}
      />
      <PasswordDialog
        open={dialog === "disable"}
        onClose={() => setDialog(null)}
        title="关闭两步验证"
        description="关闭后，登录只需要密码。输入登录密码确认。"
        confirmText="关闭"
        danger
        onConfirm={async (password) => {
          const { error } = await authClient.twoFactor.disable({ password });
          if (error) return authErrorMessage(error);
          toast.success("两步验证已关闭");
          router.refresh();
          return null;
        }}
      />
      <PasswordDialog
        open={dialog === "regenerate"}
        onClose={() => setDialog(null)}
        title="重新生成备用码"
        description="生成一组新的备用码，旧的备用码会全部失效。输入登录密码确认。"
        confirmText="生成"
        onConfirm={async (password) => {
          const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
          if (error) return authErrorMessage(error);
          setFreshCodes(data.backupCodes);
          router.refresh();
          return null;
        }}
      />
      <Dialog
        open={!!freshCodes}
        onOpenChange={(open) => !open && setFreshCodes(null)}
        disablePointerDismissal
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新的备用码</DialogTitle>
            <DialogDescription>
              旧的备用码已经失效。请保存好这一组，关闭后不会再显示。
            </DialogDescription>
          </DialogHeader>
          {freshCodes && <BackupCodes codes={freshCodes} issuer={issuer} email={account.email} />}
          <DialogFooter>
            <button type="button" onClick={() => setFreshCodes(null)} className={primaryButton}>
              我已保存好
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 修改密码                                                              */
/* ------------------------------------------------------------------ */

function PasswordRow({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [pending, setPending] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (form.next.length < 8) return void toast.error("新密码至少 8 位");
    if (form.next !== form.confirm) return void toast.error("两次输入的新密码不一致");
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: form.current,
      newPassword: form.next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      return void toast.error(
        error.code === "INVALID_PASSWORD" ? "当前密码不正确" : authErrorMessage(error),
      );
    }
    setForm({ current: "", next: "", confirm: "" });
    setOpen(false);
    toast.success("密码已修改，其他设备已退出登录");
    onChanged();
  }

  const field = (key: keyof typeof form, placeholder: string, autoComplete: string) => (
    <Input
      type="password"
      required
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
    />
  );

  return (
    <Row label="登录密码" hint="修改后，其他设备上的登录会失效">
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.form
            key="form"
            onSubmit={change}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="-m-1 overflow-hidden"
          >
            <div className="grid max-w-sm gap-2.5 p-1">
              {field("current", "当前密码", "current-password")}
              {field("next", "新密码，至少 8 位", "new-password")}
              {field("confirm", "再输入一次新密码", "new-password")}
              <div className="mt-1 flex gap-2">
                <button type="submit" disabled={pending} className={cn(primaryButton, "h-8 px-3")}>
                  {pending && <LoaderIcon className="size-3.5 animate-spin" />}
                  确认修改
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-8 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button type="button" onClick={() => setOpen(true)} className={outlineButton}>
              修改密码
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* 开启两步验证：确认密码 → 扫码并输入动态码 → 保存备用码                        */
/* ------------------------------------------------------------------ */

const STEPS = ["确认密码", "绑定验证器", "保存备用码"];

function EnableDialog({
  open,
  onClose,
  issuer,
  email,
}: {
  open: boolean;
  onClose: () => void;
  issuer: string;
  email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(0);
    setPassword("");
    setSetup(null);
    setCode("");
    setError(null);
  }

  function close() {
    // 到了最后一步说明已经开启成功，刷新页面上的状态
    if (step === 2) router.refresh();
    onClose();
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password, issuer });
    setPending(false);
    if (err) return setError(authErrorMessage(err));
    if (data.method !== "totp") return setError("没有拿到验证器密钥，请重试");
    setSetup({ uri: data.totpURI, codes: data.backupCodes });
    setPassword("");
    setStep(1);
  }

  async function verify(value: string) {
    setPending(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: value });
    setPending(false);
    if (err) {
      setCode("");
      return setError(authErrorMessage(err));
    }
    toast.success("两步验证已开启");
    setStep(2);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && close()}
      onOpenChangeComplete={(v) => !v && reset()}
      // 备用码只显示这一次，不允许点遮罩误关
      disablePointerDismissal={step > 0}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>开启两步验证</DialogTitle>
          <ol className="mt-1 flex items-center gap-2 text-xs">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-4 bg-border" />}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 transition-colors",
                    i === step ? "text-foreground" : "text-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-full text-[10px] font-medium tabular-nums transition-colors",
                      i < step
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : i === step
                          ? "bg-foreground text-background"
                          : "bg-muted",
                    )}
                  >
                    {i < step ? <CheckIcon className="size-2.5" /> : i + 1}
                  </span>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {step === 0 && (
              <form onSubmit={start} className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  先输入登录密码，确认是你本人在操作。
                </p>
                <Input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  placeholder="登录密码"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                />
                <ErrorText error={error} />
                <DialogFooter>
                  <button type="submit" disabled={pending || !password} className={primaryButton}>
                    {pending && <LoaderIcon className="size-3.5 animate-spin" />}
                    继续
                  </button>
                </DialogFooter>
              </form>
            )}

            {step === 1 && setup && (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  用身份验证器扫描二维码（Google Authenticator、Microsoft
                  Authenticator、1Password、Bitwarden 等都可以），然后输入它显示的 6 位动态码。
                </p>
                <TotpQr uri={setup.uri} />
                <CodeInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setError(null);
                  }}
                  onComplete={(v) => void verify(v)}
                  disabled={pending}
                  invalid={!!error}
                  autoFocus
                />
                <ErrorText error={error} />
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => void verify(code)}
                    disabled={pending || code.length !== 6}
                    className={primaryButton}
                  >
                    {pending && <LoaderIcon className="size-3.5 animate-spin" />}
                    验证并开启
                  </button>
                </DialogFooter>
              </div>
            )}

            {step === 2 && setup && (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  手机丢了或换了，可以用备用码登录，每个只能用一次。请存到密码管理器或打印出来，
                  <strong className="font-medium text-foreground">关闭后不会再显示</strong>。
                </p>
                <BackupCodes codes={setup.codes} issuer={issuer} email={email} />
                <DialogFooter>
                  <button type="button" onClick={close} className={primaryButton}>
                    我已保存好
                  </button>
                </DialogFooter>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="-mt-1 overflow-hidden text-sm text-destructive"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** 二维码在浏览器里生成，密钥不经过任何第三方服务 */
function TotpQr({ uri }: { uri: string }) {
  const [manual, setManual] = useState(false);
  const { path, size } = useMemo(() => {
    // 屏幕显示不会破损，用最低纠错等级让码更稀疏、更好扫
    const qr = encode(uri, { ecc: "L", border: 0 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, size: qr.size };
  }, [uri]);
  const secret = new URL(uri).searchParams.get("secret") ?? "";

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
      {/* 深色模式下也保持白底黑码，保证能扫出来 */}
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="size-40"
          shapeRendering="crispEdges"
          role="img"
          aria-label="身份验证器二维码"
        >
          <path d={path} fill="#111" />
        </svg>
      </div>
      {manual ? (
        <div className="flex w-full items-center gap-2">
          <code className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-xs tracking-wider break-all select-all">
            {secret.replace(/(.{4})(?!$)/g, "$1 ")}
          </code>
          <button
            type="button"
            onClick={() => void copyText(secret, "密钥")}
            className={cn(outlineButton, "h-9 shrink-0 px-2.5")}
            aria-label="复制密钥"
          >
            <CopyIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          无法扫码？手动输入密钥
        </button>
      )}
    </div>
  );
}

function BackupCodes({ codes, issuer, email }: { codes: string[]; issuer: string; email: string }) {
  function download() {
    const text = [
      `${issuer} 后台两步验证备用码`,
      `账号：${email}`,
      `生成时间：${formatDateTime(new Date())}`,
      "",
      ...codes,
      "",
      "手机不在身边时，可以用备用码代替动态码登录。每个备用码只能使用一次。",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${location.hostname}-备用码.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border bg-muted/40 px-5 py-4 font-mono text-sm tracking-wide tabular-nums">
        {codes.map((c) => (
          <li key={c} className="text-center select-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copyText(codes.join("\n"), "备用码")}
          className={outlineButton}
        >
          <CopyIcon className="size-3.5" />
          复制
        </button>
        <button type="button" onClick={download} className={outlineButton}>
          <DownloadIcon className="size-3.5" />
          下载
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 输入密码确认的操作（关闭两步验证、重新生成备用码）                            */
/* ------------------------------------------------------------------ */

function PasswordDialog({
  open,
  onClose,
  title,
  description,
  confirmText,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmText: string;
  danger?: boolean;
  /** 返回错误信息；成功时返回 null */
  onConfirm: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const err = await onConfirm(password);
    setPending(false);
    if (err) return setError(err);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      onOpenChangeComplete={(v) => {
        if (v) return;
        setPassword("");
        setError(null);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="登录密码"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <ErrorText error={error} />
          <DialogFooter>
            <button
              type="submit"
              disabled={pending || !password}
              className={cn(primaryButton, danger && "bg-destructive text-white")}
            >
              {pending && <LoaderIcon className="size-3.5 animate-spin" />}
              {confirmText}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* 登录设备                                                              */
/* ------------------------------------------------------------------ */

function DevicesSection({ devices, onRevoked }: { devices: LoginDevice[]; onRevoked: () => void }) {
  const [revoked, setRevoked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = devices.filter((d) => !revoked.includes(d.id));
  const others = visible.filter((d) => !d.current);

  async function revoke(ids: string[] | "others") {
    setBusy(ids === "others" ? "others" : ids[0]);
    const res = await revokeDevicesAction(ids);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setRevoked((cur) => [...cur, ...(ids === "others" ? others.map((d) => d.id) : ids)]);
    toast.success(res.data > 1 ? `已退出 ${res.data} 台设备` : "已退出该设备");
    onRevoked();
  }

  return (
    <Section
      id="devices"
      title="登录设备"
      description="所有仍然有效的登录。看到不认识的设备，退出它并立即修改密码。"
    >
      <ul className="-my-2">
        <AnimatePresence initial={false}>
          {visible.map((d) => (
            <motion.li
              key={d.id}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden border-b border-border/60 last:border-b-0"
            >
              <div className="flex items-center gap-3 py-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  {d.mobile ? (
                    <SmartphoneIcon className="size-4" />
                  ) : (
                    <MonitorIcon className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
                    {[d.browser, d.os].filter(Boolean).join(" · ")}
                    {d.current && (
                      <span className="rounded-full bg-brand/10 px-2 py-px text-[11px] font-medium text-brand">
                        当前设备
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    <span className="font-mono">{d.ip || "IP 未知"}</span>
                    {" · "}登录于 {formatDateTime(d.createdAt)}
                    {" · "}
                    <span suppressHydrationWarning>
                      {d.current ? "正在使用" : `最近活动 ${formatRelative(d.lastActive)}`}
                    </span>
                  </p>
                </div>
                {!d.current && (
                  <button
                    type="button"
                    onClick={() => void revoke([d.id])}
                    disabled={!!busy}
                    className={cn(outlineButton, "shrink-0")}
                  >
                    {busy === d.id ? (
                      <LoaderIcon className="size-3.5 animate-spin" />
                    ) : (
                      <LogOutIcon className="size-3.5" />
                    )}
                    退出
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {others.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void revoke("others")}
            disabled={!!busy}
            className={cn(outlineButton, "text-destructive hover:bg-destructive/5")}
          >
            {busy === "others" ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <LogOutIcon className="size-3.5" />
            )}
            退出其他 {others.length} 台设备
          </button>
        </div>
      )}
    </Section>
  );
}
