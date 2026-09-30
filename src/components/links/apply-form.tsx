"use client";

import { CheckIcon, CopyIcon, LoaderIcon, SendIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

const EASE = [0.16, 1, 0.3, 1] as const;

export function SiteInfo({ rows }: { rows: { label: string; value: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <dl className="divide-y divide-border/70 rounded-2xl border border-border bg-card/60 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-4 px-4 py-2.5">
          <dt className="w-12 shrink-0 text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-foreground">
            {r.value}
          </dd>
          <button
            type="button"
            onClick={() => copy(r.value)}
            aria-label={`复制${r.label}`}
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {copied === r.value ? (
              <CheckIcon className="size-3.5 text-brand" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </button>
        </div>
      ))}
    </dl>
  );
}

export function ApplyForm() {
  const [form, setForm] = useState({ name: "", url: "", avatar: "", description: "", email: "" });
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const honeypot = new FormData(e.currentTarget).get("website2");
    setPending(true);
    try {
      const res = await fetch("/api/links/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website2: honeypot }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "提交失败");
      setDone(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const input =
    "h-10 w-full rounded-xl border border-border bg-background/60 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-brand/50 focus:ring-3 focus:ring-brand/12";
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center"
        >
          <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <CheckIcon className="size-5" />
          </span>
          <p className="font-serif text-lg font-semibold text-foreground">申请已提交</p>
          <p className="text-sm text-muted-foreground">审核通过后会出现在这里，感谢你的来访～</p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={submit}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="站点名称 *"
              required
              maxLength={40}
              value={form.name}
              onChange={set("name")}
            />
            <input
              className={input}
              placeholder="https://example.com *"
              required
              maxLength={300}
              value={form.url}
              onChange={set("url")}
            />
            <input
              className={input}
              placeholder="头像地址（可选）"
              maxLength={500}
              value={form.avatar}
              onChange={set("avatar")}
            />
            <input
              className={input}
              type="email"
              placeholder="邮箱（仅博主可见）*"
              required
              maxLength={120}
              value={form.email}
              onChange={set("email")}
            />
          </div>
          <input
            className={input}
            placeholder="一句话介绍 *"
            required
            maxLength={120}
            value={form.description}
            onChange={set("description")}
          />
          <input
            name="website2"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm text-background transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              {pending ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <SendIcon className="size-3.5" />
              )}
              提交申请
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
