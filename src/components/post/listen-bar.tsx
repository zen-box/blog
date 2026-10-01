"use client";

import {
  HeadphonesIcon,
  ListIcon,
  PauseIcon,
  PlayIcon,
  PodcastIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScrollTextIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  type AudioControlDetail,
  type AudioStateDetail,
  PROGRESS_KEY,
  readProgress,
} from "@/components/music/audio-engine";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { audioTime, type PlayerTrack } from "@/lib/music";
import {
  audioMinutes,
  type PublicPostAudio,
  type TimelineEntry,
  timelineLrc,
} from "@/lib/post-audio";
import { cn } from "@/lib/utils";

import "@/components/music/music.css";

const EASE = [0.16, 1, 0.3, 1] as const;
const RATES = [1, 1.25, 1.5, 2, 0.75];

/* 全局播放器的状态：播放器每次更新都会广播 blog:audio-state */
let latest: AudioStateDetail | null = null;
const subscribeAudio = (callback: () => void) => {
  const listener = (event: Event) => {
    latest = (event as CustomEvent<AudioStateDetail>).detail;
    callback();
  };
  window.addEventListener("blog:audio-state", listener);
  return () => window.removeEventListener("blog:audio-state", listener);
};
const subscribeStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("blog:audio-state", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("blog:audio-state", callback);
  };
};

/** 最后一个开始时间不晚于 position 的段落 */
function entryAt(timeline: TimelineEntry[], position: number) {
  let from = 0,
    to = timeline.length - 1,
    found = -1;
  while (from <= to) {
    const mid = (from + to) >> 1;
    if (timeline[mid].start <= position + 0.05) {
      found = mid;
      from = mid + 1;
    } else to = mid - 1;
  }
  return found;
}

type Props = { postId: number; title: string; cover: string; audios: PublicPostAudio[] };

function trackFor(audio: PublicPostAudio, { postId, title, cover }: Props): PlayerTrack {
  return {
    id: `${audio.kind}:${postId}`,
    title,
    artist: audio.kind === "narration" ? "文章朗读" : `AI 播客 · ${audio.hosts.join("、")}`,
    album: "",
    audioUrl: audio.url,
    coverUrl: cover,
    lyrics: timelineLrc(audio.timeline, audio.hosts),
    sourceUrl: "",
    license: "",
    licenseUrl: "",
    duration: audio.duration,
    enabled: true,
    sortOrder: 0,
  };
}

const control = (url: string, action: AudioControlDetail["action"], value?: number) =>
  window.dispatchEvent(
    new CustomEvent<AudioControlDetail>("blog:audio-control", { detail: { url, action, value } }),
  );

/** 标题下方的「收听本文」：用全局播放器播放，支持倍速、记住进度、按小节跳转，朗读时高亮正在读的段落 */
export function ListenBar(props: Props) {
  const { audios } = props;
  const state = useSyncExternalStore(
    subscribeAudio,
    () => latest,
    () => null,
  );
  const progressRaw = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem(PROGRESS_KEY),
    () => null,
  );
  const saved = useMemo(() => (progressRaw ? readProgress() : {}), [progressRaw]);
  const active = audios.find((audio) => audio.url === state?.audioUrl) ?? null;

  const play = (audio: PublicPostAudio, position?: number) =>
    window.dispatchEvent(
      new CustomEvent("blog:play-audio", { detail: { ...trackFor(audio, props), position } }),
    );

  if (!audios.length) return null;
  return (
    <div className="space-y-3" data-listen-bar>
      {active && state ? (
        <ActivePlayer audio={active} state={state} onPlayFrom={(at) => play(active, at)} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {audios
          .filter((audio) => audio !== active)
          .map((audio) => {
            const resume = saved[audio.url]?.position;
            const narration = audio.kind === "narration";
            const Icon = narration ? HeadphonesIcon : PodcastIcon;
            return (
              <button
                key={audio.kind}
                type="button"
                onClick={() => play(audio)}
                className="group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/80 py-1 pr-3.5 pl-1.5 text-sm text-foreground transition-[border-color,background-color,color] duration-300 hover:border-brand/40 hover:bg-brand-soft/50"
              >
                <span className="grid size-6 place-items-center rounded-full bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
                  <Icon className="size-3.5" />
                </span>
                {resume
                  ? `继续${narration ? "收听" : "播客"} · 还剩 ${audioMinutes(audio.duration - resume)} 分钟`
                  : `${narration ? "收听本文" : "AI 播客"} · ${audioMinutes(audio.duration)} 分钟`}
              </button>
            );
          })}
      </div>
      {active?.kind === "narration" && state && (
        <ParagraphFollow
          audio={active}
          position={state.position}
          onPlayFrom={(at) => play(active, at)}
        />
      )}
    </div>
  );
}

function ActivePlayer({
  audio,
  state,
  onPlayFrom,
}: {
  audio: PublicPostAudio;
  state: AudioStateDetail;
  onPlayFrom: (at: number) => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [transcript, setTranscript] = useState(false);
  const timeline = audio.timeline;
  const duration = state.duration || audio.duration;
  const position = scrub ?? state.position;
  const index = entryAt(timeline, position);
  const busy = state.playing || state.loading;
  const narration = audio.kind === "narration";
  const chapters = timeline.filter((entry) => entry.kind === "heading");
  const chapter = [...chapters].reverse().find((entry) => entry.start <= position + 0.05);
  const current = timeline[index];
  const subtitle = narration
    ? chapter
      ? `正在读：${chapter.text}`
      : "从标题开始"
    : current
      ? `${audio.hosts[current.voice ?? 0] ?? ""}：${current.text}`
      : audio.hosts.join(" 和 ");

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      aria-label={narration ? "文章朗读" : "AI 播客"}
      className="rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5"
    >
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          aria-label={busy ? "暂停" : "播放"}
          onClick={() => control(audio.url, "toggle")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground shadow-soft transition-transform hover:scale-105 active:scale-95"
        >
          {busy ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            {narration ? "文章朗读" : "AI 播客"}
            <span
              aria-hidden
              data-paused={!state.playing || undefined}
              className="music-bars flex h-3 items-center gap-[3px]"
            >
              <i />
              <i />
              <i />
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <button
            type="button"
            aria-label="后退 15 秒"
            onClick={() => control(audio.url, "skip", -15)}
            className="hidden size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground sm:grid"
          >
            <RotateCcwIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="前进 15 秒"
            onClick={() => control(audio.url, "skip", 15)}
            className="hidden size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground sm:grid"
          >
            <RotateCwIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`倍速 ${state.rate}×，点按切换`}
            onClick={() =>
              control(audio.url, "rate", RATES[(RATES.indexOf(state.rate) + 1) % RATES.length] ?? 1)
            }
            className={cn(
              "h-8 min-w-11 rounded-full px-2 font-mono text-xs transition-colors hover:bg-muted hover:text-foreground",
              state.rate !== 1 && "text-brand",
            )}
          >
            {state.rate}×
          </button>
          {narration && chapters.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="按小节跳转"
                className="grid size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
              >
                <ListIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>按小节跳转</DropdownMenuLabel>
                  {chapters.map((entry) => (
                    <DropdownMenuItem
                      key={`${entry.say}-${entry.start}`}
                      onClick={() => control(audio.url, "seek", entry.start)}
                      className={cn(entry === chapter && "text-brand")}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.text}</span>
                      <span className="font-mono text-[11px] text-subtle tabular-nums">
                        {audioTime(entry.start)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!narration && (
            <button
              type="button"
              aria-label="文字稿"
              aria-expanded={transcript}
              onClick={() => setTranscript((open) => !open)}
              className={cn(
                "grid size-8 place-items-center rounded-full transition-colors hover:bg-muted hover:text-foreground",
                transcript && "bg-muted text-foreground",
              )}
            >
              <ScrollTextIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-3">
        <Slider
          thumbLabel="播放进度"
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={Math.min(position, Math.max(1, duration))}
          disabled={!duration}
          onValueChange={(value) => setScrub(value as number)}
          onValueCommitted={(value) => {
            control(audio.url, "seek", value as number);
            setScrub(null);
          }}
        />
        {/* 小节标记 */}
        {duration > 0 &&
          chapters.map((entry) => (
            <span
              key={`tick-${entry.start}`}
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-foreground/25"
              style={{ left: `${(entry.start / duration) * 100}%` }}
            />
          ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{audioTime(position)}</span>
        <span>{audioTime(duration)}</span>
      </div>

      <AnimatePresence initial={false}>
        {!narration && transcript && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <Transcript audio={audio} line={current?.line} onSeek={onPlayFrom} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** 播客文字稿：逐句高亮，点一句从那里听 */
function Transcript({
  audio,
  line,
  onSeek,
}: {
  audio: PublicPostAudio;
  line?: number;
  onSeek: (at: number) => void;
}) {
  const box = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const lines = useMemo(() => {
    const out: { line: number; voice: number; start: number; text: string }[] = [];
    for (const entry of audio.timeline) {
      const last = out.at(-1);
      if (last && last.line === entry.line) last.text += entry.text;
      else
        out.push({
          line: entry.line ?? out.length,
          voice: entry.voice ?? 0,
          start: entry.start,
          text: entry.text,
        });
    }
    return out;
  }, [audio.timeline]);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${line}"]`);
    const list = box.current;
    if (!el || !list) return;
    // 当前句放在列表上方三分之一处
    const offset = el.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({
      top: list.scrollTop + offset - list.clientHeight / 3,
      behavior: reduced ? "instant" : "smooth",
    });
  }, [line, reduced]);
  return (
    <ol
      ref={box}
      aria-label="播客文字稿"
      className="mt-3 max-h-72 space-y-1 overflow-y-auto border-t border-border/70 pt-3"
      data-lenis-prevent
    >
      {lines.map((item) => (
        <li key={item.line} data-line={item.line}>
          <button
            type="button"
            onClick={() => onSeek(item.start)}
            aria-current={item.line === line ? "true" : undefined}
            className={cn(
              "flex w-full gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm leading-relaxed transition-colors hover:bg-muted/60",
              item.line === line ? "bg-brand-soft/60 text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "mt-0.5 shrink-0 text-xs font-medium",
                item.voice === 0 ? "text-brand" : "text-ochre",
              )}
            >
              {audio.hosts[item.voice] ?? ""}
            </span>
            <span className="min-w-0">{item.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** 朗读时高亮正在读的段落；鼠标停在段落上时，左侧出现「从这里听」 */
function ParagraphFollow({
  audio,
  position,
  onPlayFrom,
}: {
  audio: PublicPostAudio;
  position: number;
  onPlayFrom: (at: number) => void;
}) {
  const index = entryAt(audio.timeline, position);
  const say = audio.timeline[index]?.say;
  const starts = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of audio.timeline)
      if (entry.say !== undefined && !map.has(entry.say)) map.set(entry.say, entry.start);
    return map;
  }, [audio.timeline]);
  const [hover, setHover] = useState<{ say: number; top: number; left: number } | null>(null);
  // 鼠标从段落移到按钮上要经过一小段空白，稍等再隐藏
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (say === undefined) return;
    const el = document.querySelector(`[data-article-body] [data-say="${say}"]`);
    el?.setAttribute("data-speaking", "");
    return () => el?.removeAttribute("data-speaking");
  }, [say]);

  useEffect(() => {
    const body = document.querySelector<HTMLElement>("[data-article-body]");
    if (!body || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const over = (event: MouseEvent) => {
      const el = (event.target as Element).closest<HTMLElement>("[data-say]");
      const value = el ? Number(el.dataset.say) : NaN;
      if (!el || !starts.has(value)) return;
      clearTimeout(hideTimer.current);
      const rect = el.getBoundingClientRect();
      setHover({ say: value, top: rect.top, left: rect.left });
    };
    const leave = () => {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setHover(null), 300);
    };
    const hide = () => setHover(null);
    body.addEventListener("mouseover", over);
    body.addEventListener("mouseleave", leave);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      clearTimeout(hideTimer.current);
      body.removeEventListener("mouseover", over);
      body.removeEventListener("mouseleave", leave);
      window.removeEventListener("scroll", hide);
    };
  }, [starts]);

  // 渲染到 body，避免页面过渡动画的 transform 影响 fixed 定位
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {hover && hover.left > 44 && (
        <motion.button
          key={hover.say}
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          onClick={() => onPlayFrom(starts.get(hover.say) ?? 0)}
          onMouseEnter={() => clearTimeout(hideTimer.current)}
          onMouseLeave={() => setHover(null)}
          aria-label="从这里听"
          title="从这里听"
          style={{ top: hover.top + 2, left: hover.left - 36 }}
          className="fixed z-30 grid size-7 place-items-center rounded-full border border-border bg-card text-brand shadow-soft transition-colors hover:bg-brand hover:text-brand-foreground"
        >
          <PlayIcon className="size-3 translate-x-px" />
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}
