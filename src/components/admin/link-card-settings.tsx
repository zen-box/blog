"use client";

import {
  CheckIcon,
  GlobeIcon,
  LoaderIcon,
  PlugZapIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { clearLinkPreviewsAction, testOutboundAction } from "@/app/admin/actions";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { SiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { Row, Section } from "./settings-ui";

type Outbound = SiteSettings["outbound"];
type LinkCards = SiteSettings["linkCards"];
type TestResult =
  { ok: true; ip: string; location: string; ms: number } | { ok: false; error: string };

const EASE = [0.16, 1, 0.3, 1] as const;

const MODES = [
  { key: "direct" as const, label: "直连", icon: GlobeIcon },
  { key: "proxy" as const, label: "HTTP(S) 代理", icon: ShieldCheckIcon },
];

export function LinkCardSettings({
  linkCards,
  outbound,
  onLinkCardsChange,
  onOutboundChange,
  proxyEndpoint,
  cached,
}: {
  linkCards: LinkCards;
  outbound: Outbound;
  onLinkCardsChange: (v: LinkCards) => void;
  onOutboundChange: (v: Outbound) => void;
  /** 已保存的代理地址（去掉了用户名密码），用于提示 */
  proxyEndpoint: string;
  /** 已缓存的网页数量 */
  cached: number;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [count, setCount] = useState(cached);
  const [clearing, setClearing] = useState(false);

  async function test() {
    setTesting(true);
    setResult(null);
    const res = await testOutboundAction(outbound);
    setTesting(false);
    setResult(res.ok ? { ok: true, ...res.data } : { ok: false, error: res.error });
  }

  async function clear() {
    setClearing(true);
    const res = await clearLinkPreviewsAction();
    setClearing(false);
    if (!res.ok) return void toast.error(res.error);
    setCount(0);
    toast.success(`已清空 ${res.data} 个网页的缓存，卡片会在下次展示时重新抓取`);
  }

  return (
    <Section
      id="linkcards"
      title="链接卡片"
      description="正文里单独一行的网址会显示成卡片。标题、简介和封面由服务器在后台抓取并缓存，保存文章和打开页面都不会被拖慢。"
    >
      <Row label="生成链接卡片" hint="关闭时显示为普通链接；也可以用 ::card[网址] 强制生成">
        <Switch
          checked={linkCards.enabled}
          onCheckedChange={(v) => onLinkCardsChange({ ...linkCards, enabled: v })}
        />
      </Row>

      <Row label="抓取方式" hint="网站图标使用外部地址时，也按这里的方式下载">
        <div className="space-y-2.5">
          <div className="flex w-fit rounded-xl border border-border p-1 text-sm">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  onOutboundChange({ ...outbound, mode: m.key });
                  setResult(null);
                }}
                aria-pressed={outbound.mode === m.key}
                className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              >
                {outbound.mode === m.key && (
                  <motion.span
                    layoutId="outbound-mode"
                    className="absolute inset-0 rounded-lg bg-muted"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <m.icon className="relative size-4" />
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-xs leading-relaxed",
              outbound.mode === "direct"
                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {outbound.mode === "direct"
              ? "直连会让目标网站看到服务器的出口 IP。如果源站藏在 CDN 后面，建议改用代理。"
              : "所有抓取都经代理发出，目标网站只能看到代理的 IP。代理不可用时直接报错，绝不回退直连。"}
          </p>
        </div>
      </Row>

      <AnimatePresence initial={false}>
        {outbound.mode === "proxy" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="overflow-hidden"
          >
            <Row
              label="代理地址"
              hint="支持 http:// 与 https://，可带认证；不支持路径或查询参数。Tinyproxy 默认端口 8888"
            >
              <div className="space-y-1.5">
                <Input
                  value={outbound.proxy}
                  onChange={(e) => onOutboundChange({ ...outbound, proxy: e.target.value })}
                  placeholder={
                    proxyEndpoint ? "已设置，留空则不修改" : "http://用户名:密码@proxy-host:8888"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                {proxyEndpoint && (
                  <p className="text-xs text-subtle">
                    当前代理：<span className="font-mono">{proxyEndpoint}</span>
                  </p>
                )}
              </div>
            </Row>
          </motion.div>
        )}
      </AnimatePresence>

      <Row label="测试出口" hint="访问 Cloudflare 的检测地址，看目标网站看到的是哪个 IP">
        <div className="space-y-3">
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            {testing ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <PlugZapIcon className="size-3.5" />
            )}
            测试
          </button>
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex gap-2 rounded-xl border border-border p-3 text-sm"
              >
                {result.ok ? (
                  <>
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      出口 IP <span className="font-mono font-medium">{result.ip}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {[result.location && `地区 ${result.location}`, `耗时 ${result.ms} ms`]
                          .filter(Boolean)
                          .join(" · ")}
                        {outbound.mode === "direct" ? "（这就是服务器的出口 IP）" : ""}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>{result.error}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Row>

      <Row label="缓存" hint="清空后，卡片会在下次展示时重新抓取">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            已缓存 <span className="font-medium text-foreground tabular-nums">{count}</span> 个网页
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={clearing || count === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-40"
          >
            {clearing ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <Trash2Icon className="size-3.5" />
            )}
            清空缓存
          </button>
        </div>
      </Row>
    </Section>
  );
}
