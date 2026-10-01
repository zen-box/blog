"use client";

import {
  Disc3Icon,
  ListMusicIcon,
  MicVocalIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  audioTime,
  lyricAt,
  parseLrc,
  type MusicConfig,
  type MusicTrack,
  type SavedPlayback,
} from "@/lib/music";
import { cn } from "@/lib/utils";

import { type AudioSnapshot, getAudioEngine } from "./audio-engine";
import type { AudioRequest } from "./music-launcher";
import { MusicCapsule } from "./music-capsule";

import "./music.css";

const MODES = { list: "列表循环", single: "单曲循环", shuffle: "随机播放" } as const;
const EASE = [0.16, 1, 0.3, 1] as const;

const subscribeMobile = (callback: () => void) => {
  const query = matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};

function Bars({ paused }: { paused?: boolean }) {
  return (
    <span
      aria-hidden
      data-paused={paused || undefined}
      className="music-bars flex h-3.5 items-center gap-[3px]"
    >
      <i />
      <i />
      <i />
    </span>
  );
}

function IconButton({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        "grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-40 [&_svg]:size-[18px]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 歌词：当前句居中，上下渐隐 */
function Lyrics({ track, position }: { track: AudioSnapshot["track"]; position: number }) {
  const lines = parseLrc(track?.lyrics ?? "");
  const active = lyricAt(lines, position);
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = box.current;
    const line = el?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el || !line) return;
    el.scrollTo({
      top: line.offsetTop - el.clientHeight / 2 + line.offsetHeight / 2,
      behavior: reduced ? "instant" : "smooth",
    });
  }, [active, reduced, track?.id]);
  if (!lines.length)
    return (
      <div className="grid h-full place-items-center text-xs text-muted-foreground">
        这首曲子没有歌词，安静地听吧
      </div>
    );
  return (
    <div
      ref={box}
      role="region"
      aria-label="歌词"
      tabIndex={0}
      className="music-lyrics relative h-full overflow-y-auto py-16 text-center outline-none"
      data-lenis-prevent
    >
      {lines.map((line, index) => (
        <p
          key={`${line.time}-${index}`}
          data-line={index}
          aria-current={index === active ? "true" : undefined}
          className={cn(
            "px-4 py-1.5 text-[13px] leading-relaxed transition-[color,transform,opacity] duration-500",
            index === active ? "scale-105 text-foreground" : "text-muted-foreground opacity-60",
          )}
        >
          {line.text || "♪"}
        </p>
      ))}
    </div>
  );
}

export default function MusicPlayer({
  config,
  tracks,
  saved,
  request,
}: {
  config: MusicConfig;
  tracks: MusicTrack[];
  saved: SavedPlayback | null;
  request: AudioRequest | null;
}) {
  const [engine] = useState(() => getAudioEngine(config, tracks, saved));
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => matchMedia("(max-width: 639px)").matches,
    () => false,
  );
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"lyrics" | "list">(() =>
    parseLrc(state.track?.lyrics ?? "").length ? "lyrics" : "list",
  );
  const [scrub, setScrub] = useState<number | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);

  useEffect(() => {
    engine.configure(tracks, config);
  }, [engine, tracks, config]);

  useEffect(() => {
    const pauseOther = (event: Event) => {
      if (
        event.target instanceof HTMLMediaElement &&
        event.target !== engine.audio &&
        !event.target.muted
      )
        engine.pause(false);
    };
    document.addEventListener("play", pauseOther, true);
    return () => {
      document.removeEventListener("play", pauseOther, true);
      engine.suspend();
    };
  }, [engine]);

  useEffect(() => {
    if (!request) return;
    const current = engine.getSnapshot();
    if (current.track?.audioUrl === request.track.audioUrl && current.playing) engine.pause();
    else void engine.play(request.track);
  }, [engine, request]);

  const track = state.track;
  const busy = state.playing || state.loading;
  const position = scrub ?? state.position;
  const duration = Math.max(state.duration, 0);
  const meta = [track?.artist, track?.album].filter(Boolean).join(" · ");
  const ModeIcon =
    state.mode === "single" ? Repeat1Icon : state.mode === "shuffle" ? ShuffleIcon : RepeatIcon;
  const VolumeIcon =
    state.volume === 0 ? VolumeXIcon : state.volume < 0.5 ? Volume1Icon : Volume2Icon;
  const hasLyrics = parseLrc(track?.lyrics ?? "").length > 0;

  const capsule = (
    <MusicCapsule
      aria-label={open ? "收起音乐播放器" : "打开音乐播放器"}
      title={track?.title ?? "轻音乐"}
      subtitle={state.loading ? "缓冲中…" : busy ? meta || "正在播放" : "已暂停"}
      cover={track?.coverUrl || undefined}
      playing={state.playing}
      progress={duration ? position / duration : 0}
      className={cn(!config.showOnMobile && typeof track?.id === "number" && "max-sm:hidden")}
    />
  );

  const panel = (
    <div data-music-panel className="relative overflow-hidden">
      {/* 封面虚化做底 */}
      {track?.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.coverUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 w-full scale-125 object-cover opacity-30 blur-3xl dark:opacity-20"
        />
      )}
      <div className="relative px-5 pt-5">
        <div className="flex items-center gap-3.5">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted shadow-soft">
            {track?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={track.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center bg-linear-to-br from-brand/20 to-ochre/25 text-brand">
                <Disc3Icon className="size-7" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-[1.05rem] font-semibold text-foreground">
              {track?.title ?? "选一首曲子"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta || "轻音乐"}</p>
          </div>
        </div>

        <div className="mt-3">
          <Slider
            thumbLabel="播放进度"
            min={0}
            max={Math.max(1, duration)}
            step={0.1}
            value={Math.min(position, Math.max(1, duration))}
            disabled={!duration}
            onValueChange={(v) => setScrub(v as number)}
            onValueCommitted={(v) => {
              engine.seek(v as number);
              setScrub(null);
            }}
          />
          <div className="-mt-1 flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>{audioTime(position)}</span>
            <span>{duration ? audioTime(duration) : "--:--"}</span>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <IconButton
            label={`${MODES[state.mode]}（点按切换）`}
            onClick={() =>
              engine.setMode(
                state.mode === "list" ? "single" : state.mode === "single" ? "shuffle" : "list",
              )
            }
            className={cn(state.mode !== "list" && "text-brand")}
          >
            <ModeIcon />
          </IconButton>
          <IconButton label="上一首" disabled={!tracks.length} onClick={() => void engine.next(-1)}>
            <SkipBackIcon />
          </IconButton>
          <button
            type="button"
            aria-label={busy ? "暂停" : "播放"}
            disabled={!track}
            onClick={() => engine.toggle()}
            className="grid size-12 place-items-center rounded-full bg-brand text-brand-foreground shadow-soft transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {busy ? (
              <PauseIcon className="size-5" />
            ) : (
              <PlayIcon className="size-5 translate-x-px" />
            )}
          </button>
          <IconButton label="下一首" disabled={!tracks.length} onClick={() => void engine.next(1)}>
            <SkipForwardIcon />
          </IconButton>
          <IconButton
            label="音量"
            aria-expanded={volumeOpen}
            onClick={() => setVolumeOpen((v) => !v)}
            className={cn(volumeOpen && "bg-foreground/5 text-foreground")}
          >
            <VolumeIcon />
          </IconButton>
        </div>

        <AnimatePresence initial={false}>
          {volumeOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  aria-label={state.volume ? "静音" : "取消静音"}
                  onClick={() => engine.setVolume(state.volume ? 0 : 0.3)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <VolumeIcon className="size-4" />
                </button>
                <Slider
                  thumbLabel="音量"
                  min={0}
                  max={100}
                  value={Math.round(state.volume * 100)}
                  onValueChange={(v) => engine.setVolume((v as number) / 100)}
                />
                <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">
                  {Math.round(state.volume * 100)}%
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {state.error && (
          <p role="alert" className="mt-2 text-center text-xs text-destructive">
            {state.error}
          </p>
        )}
      </div>

      <div className="relative mt-3 border-t border-border/70">
        <div role="tablist" aria-label="歌词与播放列表" className="flex gap-1 px-4 pt-2.5">
          {(
            [
              ["lyrics", "歌词", MicVocalIcon],
              ["list", `播放列表 · ${tracks.length}`, ListMusicIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === key && (
                <motion.span
                  layoutId="music-tab"
                  className="absolute inset-0 rounded-lg bg-muted"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
              {key === "lyrics" && !hasLyrics && <span className="relative text-subtle">无</span>}
            </button>
          ))}
        </div>
        <div className="h-48">
          {tab === "lyrics" ? (
            <Lyrics track={track} position={state.position} />
          ) : (
            <ol
              aria-label="播放列表"
              className="h-full overflow-y-auto px-2 py-2"
              data-lenis-prevent
            >
              {tracks.map((item, index) => {
                const current = item.id === track?.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      onClick={() => void engine.play(item, current ? undefined : 0)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/70",
                        current && "bg-brand/[0.07]",
                      )}
                    >
                      <span className="grid w-4 shrink-0 place-items-center font-mono text-[11px] text-subtle tabular-nums">
                        {current ? <Bars paused={!state.playing} /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            current ? "text-brand" : "text-foreground",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.artist && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {item.artist}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-subtle tabular-nums">
                        {item.duration ? audioTime(item.duration) : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!tracks.length && (
                <li className="grid h-full place-items-center text-xs text-muted-foreground">
                  播放列表是空的
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      {(track?.license || track?.sourceUrl) && (
        <footer className="relative flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/70 px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>{track.artist ? `作者 ${track.artist}` : "署名"}</span>
          {track.license && (
            <>
              <span aria-hidden>·</span>
              {track.licenseUrl ? (
                <a
                  href={track.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-border underline-offset-2 hover:text-foreground"
                >
                  {track.license}
                </a>
              ) : (
                <span>{track.license}</span>
              )}
            </>
          )}
          {track.sourceUrl && (
            <>
              <span aria-hidden>·</span>
              <a
                href={track.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border underline-offset-2 hover:text-foreground"
              >
                作品来源
              </a>
            </>
          )}
        </footer>
      )}
    </div>
  );

  if (mobile)
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={capsule} />
        <SheetContent
          side="bottom"
          className="max-h-[88svh] gap-0 overflow-y-auto rounded-t-3xl p-0 pb-[env(safe-area-inset-bottom)]"
          data-lenis-prevent
        >
          <SheetTitle className="sr-only">轻音乐</SheetTitle>
          <SheetDescription className="sr-only">选一首喜欢的曲子，陪你慢慢读。</SheetDescription>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" aria-hidden />
          {panel}
        </SheetContent>
      </Sheet>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={capsule} />
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        className="w-[21rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-0"
        data-lenis-prevent
      >
        <PopoverTitle className="sr-only">轻音乐</PopoverTitle>
        <PopoverDescription className="sr-only">选一首喜欢的曲子，陪你慢慢读。</PopoverDescription>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
