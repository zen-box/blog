"use client";

import {
  HeadphonesIcon,
  LoaderCircleIcon,
  PodcastIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useNow } from "@/hooks/use-now";
import { formatRelative } from "@/lib/format";
import { audioTime } from "@/lib/music";
import { parsePodcastScript } from "@/lib/post-audio";
import type { ReaderJobView } from "@/lib/reader-ai";
import { cn } from "@/lib/utils";

import { useConfirm } from "../confirm";
import { ACTIVE_JOB, JOB_STATUS } from "../job-status";
import { streamAi } from "./ai-client";

type View = {
  audioUrl: string | null;
  duration: number;
  updatedAt: number | null;
  stale: boolean;
  progress: number;
  total: number;
};
type AudioState = {
  postId: number;
  contentHash: string;
  enabled: boolean;
  ready: boolean;
  narratorVoice: string;
  hosts: string[];
  narration: View;
  podcast: View & { script: string; lines: { speaker: number; text: string }[] };
  jobs: ReaderJobView[];
};

async function postJson(body: unknown) {
  const res = await fetch("/api/admin/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "操作失败，请重试");
  return data as AudioState;
}

function Status({ view, now, running }: { view: View; now: number; running?: ReaderJobView }) {
  if (running)
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircleIcon className="size-3 animate-spin text-brand" />
          {view.total
            ? `正在合成 ${view.progress}/${view.total} 段`
            : running.status === "retry"
              ? "稍后自动重试"
              : "排队中"}
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${view.total ? (view.progress / view.total) * 100 : 4}%` }}
          />
        </div>
      </div>
    );
  const [dot, text] = !view.audioUrl
    ? ["bg-border", "还没有合成"]
    : view.stale
      ? ["bg-amber-500", "正文更新过，已过期"]
      : ["bg-emerald-500", `读者可见 · ${audioTime(view.duration)}`];
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {text}
      {view.updatedAt ? (
        <span className="text-subtle">· {formatRelative(view.updatedAt, now)}</span>
      ) : null}
    </p>
  );
}

function Card({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
          {icon}
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="ml-auto">{aside}</span>
      </header>
      <div className="space-y-3.5 px-4 py-3.5">{children}</div>
    </section>
  );
}

/** 读者 AI 抽屉里的「收听」：文章朗读和 AI 播客 */
export function AudioPanel({ postId, dirty }: { postId: number; dirty: boolean }) {
  const [state, setState] = useState<AudioState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState("");
  const [edited, setEdited] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const draftCtrl = useRef<AbortController | null>(null);
  const editedRef = useRef(false);
  const confirm = useConfirm();
  const now = useNow();

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/admin/audio?postId=${postId}`, { signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "读取失败");
        setState(data);
        if (!editedRef.current) setScript(data.podcast.script);
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      }
    },
    [postId],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    const frame = requestAnimationFrame(() => void refresh(ctrl.signal));
    const timer = setInterval(() => void refresh(ctrl.signal), 2000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      ctrl.abort();
      draftCtrl.current?.abort();
    };
  }, [refresh]);

  const markEdited = (value: boolean) => {
    editedRef.current = value;
    setEdited(value);
  };

  async function run(body: unknown, success?: string) {
    setBusy(true);
    setError("");
    try {
      const data = await postJson(body);
      setState(data);
      if (success) toast.success(success);
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function draft() {
    if (!state) return;
    if (
      script.trim() &&
      !(await confirm({
        title: "让 AI 重写播客稿？",
        description: "当前的稿子会被替换。",
        confirmText: "重写",
      }))
    )
      return;
    setError("");
    setDrafting(true);
    markEdited(true);
    const ctrl = new AbortController();
    draftCtrl.current = ctrl;
    try {
      const res = await fetch(`/api/admin/audio?postId=${postId}&prose=1`);
      const source = await res.json();
      if (!res.ok) throw new Error(source.error || "读取正文失败");
      const lines = Math.min(60, Math.max(16, Math.round(source.prose.length / 120)));
      setScript("");
      await streamAi(
        {
          task: "podcast",
          title: source.title,
          content: source.prose,
          instruction: `两位主播：${state.hosts[0]}、${state.hosts[1]}。大约 ${lines} 句。`,
        },
        ctrl.signal,
        (text) => setScript(text),
      );
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  const job = (kind: string) =>
    state?.jobs.find((item) => item.type === kind && ACTIVE_JOB.includes(item.status));
  const failed = (kind: string) => {
    const latest = state?.jobs.find((item) => item.type === kind);
    return latest?.status === "failed" ? latest : undefined;
  };
  const lineCount = state ? parsePodcastScript(script, state.hosts).length : 0;
  const blocked = dirty || !state?.ready;

  if (!state)
    return (
      <div className="min-h-0 flex-1 space-y-3 px-5 py-5">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </>
        )}
      </div>
    );

  const narrationJob = job("narration");
  const podcastJob = job("podcast");
  const narrationFailed = failed("narration");
  const podcastFailed = failed("podcast");

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" data-lenis-prevent>
      {!state.enabled ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          文章朗读与播客还没开启，先去
          <Link href="/admin/ai" className="mx-1 text-brand hover:underline">
            AI 助手
          </Link>
          开启并选好声音。
        </p>
      ) : !state.ready ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          还没有语音服务的密钥，去
          <Link href="/admin/ai" className="mx-1 underline">
            AI 助手
          </Link>
          填写。
        </p>
      ) : null}
      {dirty && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          正文有未保存的修改，保存后再合成。
        </p>
      )}
      {error && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Card
        icon={<HeadphonesIcon className="size-3.5" />}
        title="文章朗读"
        aside={<span className="text-xs text-subtle">声音：{state.narratorVoice}</span>}
      >
        <Status view={state.narration} now={now} running={narrationJob} />
        {narrationFailed && !narrationJob && (
          <p className="text-xs leading-relaxed text-destructive">
            上次合成失败：{narrationFailed.error}
          </p>
        )}
        {state.narration.audioUrl && (
          <audio
            controls
            preload="none"
            src={state.narration.audioUrl}
            className="h-9 w-full"
            aria-label="试听文章朗读"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={state.narration.audioUrl && !state.narration.stale ? "outline" : "default"}
            disabled={busy || blocked || Boolean(narrationJob)}
            onClick={() =>
              void run(
                { op: "synthesize", postId, kind: "narration" },
                "已开始合成朗读，完成后读者就能收听",
              )
            }
          >
            {state.narration.audioUrl ? <RotateCcwIcon /> : <HeadphonesIcon />}
            {state.narration.audioUrl ? "重新合成" : "合成朗读"}
          </Button>
          {state.narration.audioUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={busy}
              onClick={async () => {
                if (await confirm({ title: "删除这篇文章的朗读？", confirmText: "删除" }))
                  await run({ op: "remove", postId, kind: "narration" }, "朗读已删除");
              }}
            >
              删除
            </Button>
          )}
          <span className="ml-auto text-[11px] text-subtle">
            代码、表格、终端输出只用一句话带过
          </span>
        </div>
      </Card>

      <Card
        icon={<PodcastIcon className="size-3.5" />}
        title="AI 播客"
        aside={<span className="text-xs text-subtle">主播：{state.hosts.join("、")}</span>}
      >
        <Status view={state.podcast} now={now} running={podcastJob} />
        {podcastFailed && !podcastJob && (
          <p className="text-xs leading-relaxed text-destructive">
            上次合成失败：{podcastFailed.error}
          </p>
        )}
        {state.podcast.audioUrl && (
          <audio
            controls
            preload="none"
            src={state.podcast.audioUrl}
            className="h-9 w-full"
            aria-label="试听 AI 播客"
          />
        )}
        <div className="overflow-hidden rounded-xl border border-input transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <Textarea
            aria-label="播客稿"
            value={script}
            readOnly={drafting}
            onChange={(e) => {
              markEdited(true);
              setScript(e.target.value);
            }}
            placeholder={`一行一句台词，例如：\n${state.hosts[0]}：大家好，今天聊聊……\n${state.hosts[1]}：（轻笑）……`}
            className="min-h-56 resize-y rounded-none border-0 bg-transparent px-3.5 py-3 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center gap-2 border-t border-border/60 px-2 py-1.5">
            {drafting ? (
              <Button variant="ghost" size="xs" onClick={() => draftCtrl.current?.abort()}>
                <SquareIcon />
                停止
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                className="text-brand hover:text-brand"
                disabled={busy}
                onClick={() => void draft()}
              >
                <SparklesIcon />
                {script.trim() ? "让 AI 重写" : "AI 写稿"}
              </Button>
            )}
            {drafting && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-3 animate-spin" />
                正在写…
              </span>
            )}
            <span className="ml-auto pr-1 text-[11px] text-subtle tabular-nums">
              {lineCount} 句{edited ? " · 未保存" : ""}
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-subtle">
          每行「名字：台词」，名字要和主播一致；可以加（轻笑）（停顿）这样的语气标签。审过稿子再合成。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || drafting || !edited}
            onClick={async () => {
              const data = await run({ op: "savePodcast", postId, script }, "播客稿已保存");
              if (data) {
                markEdited(false);
                setScript(data.podcast.script);
              }
            }}
          >
            保存稿子
          </Button>
          <Button
            size="sm"
            disabled={
              busy ||
              drafting ||
              edited ||
              blocked ||
              !state.podcast.lines.length ||
              Boolean(podcastJob)
            }
            onClick={() =>
              void run({ op: "synthesize", postId, kind: "podcast" }, "已开始合成播客")
            }
          >
            <PodcastIcon />
            {state.podcast.audioUrl ? "重新合成播客" : "合成播客"}
          </Button>
          {state.podcast.audioUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={busy}
              onClick={async () => {
                if (await confirm({ title: "删除播客音频？稿子会保留。", confirmText: "删除" }))
                  await run({ op: "remove", postId, kind: "podcast" }, "播客音频已删除");
              }}
            >
              删除音频
            </Button>
          )}
        </div>
      </Card>

      {state.jobs.length > 0 && (
        <section aria-labelledby="audio-jobs">
          <h3 id="audio-jobs" className="mb-2 text-xs font-medium text-subtle">
            合成记录
          </h3>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
            {state.jobs.slice(0, 6).map((item) => {
              const status = JOB_STATUS[item.status];
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full",
                      status.tone,
                    )}
                  >
                    {status.icon}
                  </span>
                  <span className="text-sm">{item.type === "podcast" ? "播客" : "朗读"}</span>
                  <span className="text-xs text-subtle">
                    {status.label} · {item.authorization === "auto" ? "文章更新后自动" : "手动"} ·{" "}
                    {formatRelative(item.updatedAt, now)}
                  </span>
                  {item.error && item.status !== "cancelled" && (
                    <p className="basis-full pl-9 text-xs leading-relaxed text-destructive">
                      {item.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
