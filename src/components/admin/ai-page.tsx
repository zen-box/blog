"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderIcon,
  PlugZapIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AI_PRESETS, isLocalUrl, presetFor } from "@/lib/ai-presets";
import type { ReaderAiConfig } from "@/lib/reader-ai";
import { cn } from "@/lib/utils";

import { SaveBar } from "./save-bar";
import {
  type BuiltinVoice,
  type CustomVoice,
  type KeySource,
  type TtsSettings,
  VoiceBlock,
} from "./voice-settings";

export type AiConfig = {
  protocol: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  fastModel: string;
  useProxy: boolean;
  timeoutMs: number;
};

export type AiUsageDay = {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  unknownUsage: number;
};

type KeyMode = "keep" | "edit" | "clear";
type TestState =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; ms: number }
  | { state: "error"; message: string };

const EASE = [0.16, 1, 0.3, 1] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}

/* ------------------------------------------------------------------ */
/* 小部件                                                                  */
/* ------------------------------------------------------------------ */

function Block({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="min-w-0">
          <h3 className="font-medium text-foreground">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {aside}
      </header>
      <div className="px-6 pt-5 pb-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="block text-sm text-foreground">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** 开关行：说明在左，开关在右 */
function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
  nested,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  nested?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-6 py-3.5",
        nested && "pl-4",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
        className="mt-0.5"
      />
    </label>
  );
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "error" | "idle" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 rounded-full",
        tone === "ok" && "bg-emerald-500",
        tone === "warn" && "bg-amber-500",
        tone === "error" && "bg-destructive",
        tone === "idle" && "bg-subtle",
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 用量图                                                                  */
/* ------------------------------------------------------------------ */

const usageChart = {
  tokens: { label: "token", color: "var(--brand)" },
} satisfies ChartConfig;

function last30(days: AiUsageDay[]) {
  const map = new Map(days.map((d) => [d.day, d]));
  const out: (AiUsageDay & { tokens: number })[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
      .toISOString()
      .slice(0, 10);
    const d = map.get(day) ?? { day, calls: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 };
    out.push({ ...d, tokens: d.inputTokens + d.outputTokens });
  }
  return out;
}

const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const formatCount = (n: number) => (n >= 1e4 ? compact.format(n) : n.toLocaleString("zh-CN"));

function UsageBlock({ days }: { days: AiUsageDay[] }) {
  const data = useMemo(() => last30(days), [days]);
  const total = data.reduce(
    (acc, d) => ({
      calls: acc.calls + d.calls,
      input: acc.input + d.inputTokens,
      output: acc.output + d.outputTokens,
      unknown: acc.unknown + d.unknownUsage,
    }),
    { calls: 0, input: 0, output: 0, unknown: 0 },
  );
  const stats = [
    { label: "调用次数", value: total.calls },
    { label: "输入 token", value: total.input },
    { label: "输出 token", value: total.output },
  ];
  return (
    <Block
      title="近 30 天用量"
      description="按日期统计后台的 AI 调用；服务商没有返回用量的请求只计次数。"
    >
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-muted/50 px-4 py-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-serif text-2xl font-semibold text-foreground">
              {formatCount(s.value)}
            </dd>
          </div>
        ))}
      </dl>
      {total.calls > 0 ? (
        <ChartContainer config={usageChart} className="mt-5 aspect-auto h-44 w-full">
          <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(d: string) => d.slice(5).replace("-", "/")}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={44}
              tickFormatter={(v: number) => formatCount(v)}
            />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) => {
                    const d = payload?.[0]?.payload as
                      (AiUsageDay & { tokens: number }) | undefined;
                    return d ? `${d.day} · ${d.calls} 次调用` : "";
                  }}
                  formatter={(value) => (
                    <span className="font-medium text-foreground tabular-nums">
                      {Number(value).toLocaleString("zh-CN")} token
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="tokens"
              fill="var(--color-tokens)"
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          还没有调用记录。在编辑器里使用 AI 后会显示在这里。
        </p>
      )}
      {total.unknown > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          其中 {total.unknown} 次调用没有返回 token 用量。
        </p>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* 页面                                                                    */
/* ------------------------------------------------------------------ */

export function AiPage({
  initial,
  initialHasKey,
  initialReader,
  initialTts,
  usage,
}: {
  initial: AiConfig;
  initialHasKey: boolean;
  initialReader: ReaderAiConfig;
  initialTts: { config: TtsSettings; keySource: KeySource; builtin: readonly BuiltinVoice[] };
  usage: AiUsageDay[];
}) {
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [reader, setReader] = useState(initialReader);
  const [savedReader, setSavedReader] = useState(initialReader);
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [keyMode, setKeyMode] = useState<KeyMode>(initialHasKey ? "keep" : "edit");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [days, setDays] = useState(usage);
  const [tts, setTts] = useState(initialTts.config);
  const [savedTts, setSavedTts] = useState(initialTts.config);
  const [ttsKeySource, setTtsKeySource] = useState(initialTts.keySource);
  // 语音服务的密钥：null 表示不改动
  const [ttsKey, setTtsKey] = useState<string | null>(null);
  const [ttsAdvanced, setTtsAdvanced] = useState(false);

  const preset = presetFor(config.baseUrl);
  const local = isLocalUrl(config.baseUrl);
  const keyChanged = keyMode === "clear" || key.trim() !== "";
  const configDirty = !same(config, saved) || keyChanged;
  const readerDirty = !same(reader, savedReader);
  const ttsDirty = !same(tts, savedTts) || Boolean(ttsKey?.trim());
  const dirty = configDirty || readerDirty || ttsDirty;
  const ready = local || (hasKey && keyMode !== "clear") || key.trim() !== "";
  const providerChanged = presetFor(saved.baseUrl)?.id !== preset?.id && hasKey && !key.trim();

  const patch = (value: Partial<AiConfig>) => {
    setConfig((cur) => ({ ...cur, ...value }));
    setTest({ state: "idle" });
  };

  function reset() {
    setConfig(saved);
    setReader(savedReader);
    setTts(savedTts);
    setTtsKey(null);
    setKey("");
    setKeyMode(hasKey ? "keep" : "edit");
    setTest({ state: "idle" });
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      if (configDirty) {
        const data = await postJson("/api/admin/ai/config", {
          ...config,
          apiKey: key.trim(),
          clearKey: keyMode === "clear",
        });
        const next = data.config as AiConfig;
        setConfig(next);
        setSaved(next);
        const nextHasKey = Boolean(data.hasKey);
        setHasKey(nextHasKey);
        setKey("");
        setShowKey(false);
        setKeyMode(nextHasKey ? "keep" : "edit");
      }
      if (readerDirty) {
        const data = await postJson("/api/admin/reader-ai", { op: "settings", config: reader });
        setReader(data.config);
        setSavedReader(data.config);
      }
      if (ttsDirty) {
        const { voices: _voices, ...patch } = tts;
        void _voices;
        const data = await postJson("/api/admin/tts", {
          op: "config",
          config: patch,
          ...(ttsKey?.trim() ? { apiKey: ttsKey.trim() } : {}),
        });
        setTts(data.config);
        setSavedTts(data.config);
        setTtsKeySource(data.keySource);
        setTtsKey(null);
      }
      toast.success("AI 设置已保存");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (dirty && !(await save())) return;
    setTest({ state: "testing" });
    const started = performance.now();
    try {
      await postJson("/api/admin/ai/test", {});
      setTest({ state: "ok", ms: Math.round(performance.now() - started) });
      const res = await fetch("/api/admin/ai/usage");
      if (res.ok) setDays((await res.json()).days ?? []);
    } catch (e) {
      setTest({ state: "error", message: (e as Error).message });
    }
  }

  const status =
    test.state === "ok"
      ? { tone: "ok" as const, text: `连接正常 · ${test.ms} ms` }
      : test.state === "error"
        ? { tone: "error" as const, text: "连接失败" }
        : ready
          ? { tone: "idle" as const, text: "已配置，未测试" }
          : { tone: "warn" as const, text: "还没有填写 API Key" };

  return (
    <div className="max-w-4xl space-y-6 pb-24">
      <Block
        title="模型服务"
        description="写作助手调用的服务。各家大多兼容 OpenAI 接口，选一个预设后可以再修改地址和模型。"
        aside={
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <StatusDot tone={status.tone} />
            {status.text}
          </span>
        }
      >
        {/* 服务商 */}
        <div
          role="radiogroup"
          aria-label="服务商"
          className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
        >
          {AI_PRESETS.map((p) => {
            const active = preset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  patch({
                    baseUrl: p.baseUrl,
                    model: p.model,
                    fastModel: p.fastModel,
                    protocol: "openai",
                  })
                }
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition-colors sm:gap-3 sm:px-3",
                  active
                    ? "border-brand/60 bg-brand/[0.06] ring-1 ring-brand/30"
                    : "border-border hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg border font-medium transition-colors",
                    p.mark.length > 1 ? "text-xs tracking-tight" : "text-sm",
                    active
                      ? "border-brand/30 bg-brand text-brand-foreground"
                      : "border-border bg-background text-foreground",
                  )}
                >
                  {p.mark}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{p.name}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                    {p.note}
                  </span>
                </span>
                {active && (
                  <CheckIcon className="absolute top-2 right-2 size-3.5 text-brand" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
        {!preset && (
          <p className="mt-3 text-xs text-muted-foreground">
            正在使用自定义地址。任何兼容 OpenAI 或 Anthropic 接口的服务都可以接入。
          </p>
        )}

        <div className="mt-6 grid gap-x-5 gap-y-5 md:grid-cols-2">
          <Field
            label="接口地址"
            htmlFor="ai-base-url"
            className="md:col-span-2"
            hint={local ? "本机或局域网地址，可以不填 API Key" : undefined}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="ai-base-url"
                value={config.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="font-mono text-[13px] [font-variant-ligatures:none]"
              />
              <div
                role="radiogroup"
                aria-label="接口协议"
                className="inline-flex h-8 shrink-0 rounded-lg border border-border p-0.5"
              >
                {(
                  [
                    ["openai", "OpenAI 兼容"],
                    ["anthropic", "Anthropic 兼容"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={config.protocol === value}
                    onClick={() => patch({ protocol: value })}
                    className={cn(
                      "rounded-md px-2.5 text-xs transition-colors",
                      config.protocol === value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Field>

          <Field label="API Key" htmlFor="ai-key" className="md:col-span-2">
            {hasKey && keyMode !== "edit" ? (
              <div
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg border px-3 text-sm",
                  keyMode === "clear"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/40 text-foreground",
                )}
              >
                <KeyRoundIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">
                  {keyMode === "clear" ? "保存后将清除已保存的密钥" : "已保存密钥 · 只保存在服务器"}
                </span>
                {keyMode === "clear" ? (
                  <button
                    type="button"
                    onClick={() => setKeyMode("keep")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    撤销
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setKeyMode("edit")}
                      className="text-xs text-brand hover:opacity-80"
                    >
                      更换
                    </button>
                    <span aria-hidden className="h-3 w-px bg-border" />
                    <button
                      type="button"
                      onClick={() => setKeyMode("clear")}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      清除
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    id="ai-key"
                    type={showKey ? "text" : "password"}
                    autoComplete="new-password"
                    spellCheck={false}
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setTest({ state: "idle" });
                    }}
                    placeholder={local ? "本机服务可以留空" : "sk-…"}
                    className="pr-9 font-mono text-[13px] [font-variant-ligatures:none]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                    className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? (
                      <EyeOffIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                  </button>
                </div>
                {hasKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setKey("");
                      setKeyMode("keep");
                    }}
                    className="h-8 shrink-0 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    取消
                  </button>
                )}
              </div>
            )}
            {providerChanged && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                换了服务商，原来的密钥多半不能用了，记得更换。
              </p>
            )}
          </Field>

          <Field label="主模型" htmlFor="ai-model" hint="全文润色、AI 排版、生成摘要">
            <Input
              id="ai-model"
              value={config.model}
              onChange={(e) => patch({ model: e.target.value })}
              className="font-mono text-[13px] [font-variant-ligatures:none]"
            />
          </Field>
          <Field label="快速模型" htmlFor="ai-fast-model" hint="划词改写，需要快速响应">
            <Input
              id="ai-fast-model"
              value={config.fastModel}
              onChange={(e) => patch({ fastModel: e.target.value })}
              className="font-mono text-[13px] [font-variant-ligatures:none]"
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border/70 pt-5">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={test.state === "testing" || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            {test.state === "testing" ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <PlugZapIcon className="size-3.5" />
            )}
            {dirty ? "保存并测试连接" : "测试连接"}
          </button>
          <AnimatePresence mode="wait" initial={false}>
            {test.state === "ok" && (
              <motion.span
                key="ok"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                <CheckIcon className="size-3.5" />
                模型正常回复，用时 {test.ms} ms
              </motion.span>
            )}
            {test.state === "error" && (
              <motion.span
                key="error"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="min-w-0 flex-1 text-xs text-destructive"
                role="alert"
              >
                {test.message}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            高级设置
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform duration-300", advanced && "rotate-180")}
            />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid gap-x-5 gap-y-1 rounded-xl bg-muted/40 px-4 py-2 md:grid-cols-2">
                <div className="flex items-center justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm text-foreground">请求超时</span>
                    <span className="block text-xs text-muted-foreground">长文润色需要更久</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      aria-label="请求超时（秒）"
                      value={Math.round(config.timeoutMs / 1000)}
                      onChange={(e) =>
                        patch({
                          timeoutMs: Math.min(600, Math.max(1, Number(e.target.value) || 1)) * 1000,
                        })
                      }
                      className="h-8 w-20 text-right tabular-nums"
                    />
                    秒
                  </span>
                </div>
                <ToggleRow
                  title="经出站代理访问"
                  description="使用「链接卡片」中设置的代理，失败时不会改为直连"
                  checked={config.useProxy}
                  onChange={(useProxy) => patch({ useProxy })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Block>

      <Block
        title="读者看到的 AI 内容"
        description="摘要和测评速览在后台提前生成并保存，访客浏览时不会调用 AI。"
      >
        <div className="divide-y divide-border/70">
          <ToggleRow
            title="启用阅读增强"
            description="在文章开头显示 AI 摘要和测评速览"
            checked={reader.enabled}
            onChange={(enabled) => setReader((r) => ({ ...r, enabled }))}
          />
          <div className="relative">
            <span aria-hidden className="absolute top-3 bottom-3 left-0 w-px bg-border" />
            <ToggleRow
              nested
              title="发布或更新后自动生成摘要"
              description="只在正文变化时生成，改标题、标签不会重复调用"
              checked={reader.autoSummary}
              disabled={!reader.enabled}
              onChange={(autoSummary) => setReader((r) => ({ ...r, autoSummary }))}
            />
            <ToggleRow
              nested
              title="显示 AI 摘要"
              checked={reader.showSummary}
              disabled={!reader.enabled}
              onChange={(showSummary) => setReader((r) => ({ ...r, showSummary }))}
            />
            <ToggleRow
              nested
              title="显示测评速览"
              description="从测评报告提取的关键指标，经你确认后才会公开"
              checked={reader.showBenchmark}
              disabled={!reader.enabled}
              onChange={(showBenchmark) => setReader((r) => ({ ...r, showBenchmark }))}
            />
          </div>
        </div>
      </Block>

      <Block
        title="文章朗读与 AI 播客"
        description="用小米 MiMo 语音合成，把文章变成朗读和双人对话播客。音频在后台合成后保存，读者收听不会调用服务。"
        aside={
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <StatusDot
              tone={
                !tts.enabled ? "idle" : ttsKeySource === "none" && !ttsKey?.trim() ? "warn" : "ok"
              }
            />
            {!tts.enabled
              ? "未开启"
              : ttsKeySource === "none" && !ttsKey?.trim()
                ? "还没有密钥"
                : "已开启"}
          </span>
        }
      >
        <div className="divide-y divide-border/70">
          <ToggleRow
            title="开启文章朗读与播客"
            description="开启后，可以在编辑器的「读者 AI」里为文章合成朗读、生成播客"
            checked={tts.enabled}
            onChange={(enabled) => setTts((t) => ({ ...t, enabled }))}
          />
          <ToggleRow
            title="文章更新后自动重新合成朗读"
            description="只有改动过的段落会重新合成，其余段落直接用缓存"
            checked={tts.autoRefresh}
            disabled={!tts.enabled}
            onChange={(autoRefresh) => setTts((t) => ({ ...t, autoRefresh }))}
          />
        </div>
        <div className="mt-5 border-t border-border/70 pt-6">
          <VoiceBlock
            value={tts}
            onChange={(patch) => setTts((t) => ({ ...t, ...patch }))}
            builtin={initialTts.builtin}
            keySource={ttsKeySource}
            ownKey={ttsKey}
            onOwnKey={setTtsKey}
            onVoices={(voices: CustomVoice[]) => {
              setTts((t) => ({ ...t, voices }));
              setSavedTts((t) => ({ ...t, voices }));
            }}
            ensureSaved={async () => (dirty ? save() : true)}
          />
        </div>
        <div className="mt-6 flex border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={() => setTtsAdvanced((v) => !v)}
            aria-expanded={ttsAdvanced}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            服务地址与模型
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-300",
                ttsAdvanced && "rotate-180",
              )}
            />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {ttsAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid gap-x-5 gap-y-4 rounded-xl bg-muted/40 px-4 py-4 md:grid-cols-2">
                <Field label="接口地址" htmlFor="tts-base-url" className="md:col-span-2">
                  <Input
                    id="tts-base-url"
                    value={tts.baseUrl}
                    onChange={(e) => setTts((t) => ({ ...t, baseUrl: e.target.value }))}
                    className="font-mono text-[13px] [font-variant-ligatures:none]"
                  />
                </Field>
                <Field label="内置音色模型" htmlFor="tts-model">
                  <Input
                    id="tts-model"
                    value={tts.model}
                    onChange={(e) => setTts((t) => ({ ...t, model: e.target.value }))}
                    className="font-mono text-[13px] [font-variant-ligatures:none]"
                  />
                </Field>
                <Field label="声音克隆模型" htmlFor="tts-clone-model">
                  <Input
                    id="tts-clone-model"
                    value={tts.cloneModel}
                    onChange={(e) => setTts((t) => ({ ...t, cloneModel: e.target.value }))}
                    className="font-mono text-[13px] [font-variant-ligatures:none]"
                  />
                </Field>
                <ToggleRow
                  title="经出站代理访问"
                  description="使用「链接卡片」中设置的代理"
                  checked={tts.useProxy}
                  onChange={(useProxy) => setTts((t) => ({ ...t, useProxy }))}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Block>

      <UsageBlock days={days} />

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />
    </div>
  );
}
