"use client";
import Image from "next/image";
import {
  Music2Icon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  audioTime,
  lyricAt,
  parseLrc,
  type MusicConfig,
  type MusicTrack,
  type SavedPlayback,
} from "@/lib/music";
import { getAudioEngine } from "./audio-engine";
import type { AudioRequest } from "./music-launcher";
import "./music.css";
const MODES = { list: "列表循环", single: "单曲循环", shuffle: "随机播放" } as const;
const subscribeMobile = (callback: () => void) => {
  const query = matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
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
  const reduced = useReducedMotion(),
    activeLyric = useRef<HTMLParagraphElement>(null);
  const lines = parseLrc(state.track?.lyrics ?? ""),
    activeLine = lyricAt(lines, state.position);
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
    if (request) {
      const current = engine.getSnapshot();
      if (current.track?.audioUrl === request.track.audioUrl && current.playing) engine.pause();
      else void engine.play(request.track);
    }
  }, [engine, request]);
  useEffect(() => {
    if (open)
      activeLyric.current?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "instant" : "smooth",
      });
  }, [activeLine, open, reduced]);
  const modeIcon =
    state.mode === "single" ? (
      <Repeat1Icon className="size-4" />
    ) : state.mode === "shuffle" ? (
      <ShuffleIcon className="size-4" />
    ) : (
      <RepeatIcon className="size-4" />
    );
  const capsule = (
    <button
      type="button"
      aria-label="打开音乐播放器"
      className={`fixed bottom-6 left-5 z-40 max-w-[13rem] items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm text-foreground shadow-float backdrop-blur transition-colors hover:bg-muted ${!config.showOnMobile && typeof state.track?.id === "number" ? "hidden sm:inline-flex" : "inline-flex"}`}
    >
      {state.playing ? (
        <span aria-hidden className="music-bars flex h-4 items-center gap-0.5">
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : (
        <Music2Icon className="size-4 shrink-0 text-brand" />
      )}
      <span className="truncate">{state.track?.title ?? "音频播放器"}</span>
    </button>
  );
  const content = (
    <div className="space-y-4" data-music-panel>
      <div className="flex items-center gap-3">
        {state.track?.coverUrl ? (
          <Image
            unoptimized
            src={state.track.coverUrl}
            alt={`${state.track.title}封面`}
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"
          >
            <Music2Icon className="size-7" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-semibold">
            {state.track?.title ?? "选择一段音频"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[state.track?.artist, state.track?.album].filter(Boolean).join(" · ") || "轻音乐"}
          </p>
        </div>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div>
        <input
          type="range"
          aria-label="播放进度"
          min={0}
          max={Math.max(1, state.duration)}
          step={0.1}
          value={Math.min(state.position, Math.max(1, state.duration))}
          disabled={!state.duration}
          onChange={(event) => engine.seek(Number(event.target.value))}
          className="w-full accent-brand"
        />
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>{audioTime(state.position)}</span>
          <span>{audioTime(state.duration)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="上一首"
          disabled={!tracks.length}
          onClick={() => void engine.next(-1)}
        >
          <SkipBackIcon />
        </Button>
        <Button
          size="icon"
          className="size-11 rounded-full"
          aria-label={state.playing || state.loading ? "暂停" : "播放"}
          disabled={!state.track}
          onClick={() => engine.toggle()}
        >
          {state.playing || state.loading ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="下一首"
          disabled={!tracks.length}
          onClick={() => void engine.next(1)}
        >
          <SkipForwardIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${MODES[state.mode]}，切换播放模式`}
          title={MODES[state.mode]}
          onClick={() =>
            engine.setMode(
              state.mode === "list" ? "single" : state.mode === "single" ? "shuffle" : "list",
            )
          }
        >
          {modeIcon}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Volume2Icon className="size-4 text-muted-foreground" aria-hidden />
        <input
          type="range"
          aria-label="音量"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          onChange={(event) => engine.setVolume(Number(event.target.value))}
          className="min-w-0 flex-1 accent-brand"
        />
        <span className="w-8 text-right text-xs text-muted-foreground">
          {Math.round(state.volume * 100)}%
        </span>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {state.loading ? "正在缓冲…" : MODES[state.mode]}
      </p>
      {lines.length > 0 && (
        <div
          role="region"
          aria-label="滚动歌词"
          tabIndex={0}
          className="max-h-32 space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-3 text-center text-sm"
          data-lenis-prevent
        >
          {lines.map((line, index) => (
            <p
              key={`${line.time}-${index}`}
              ref={index === activeLine ? activeLyric : undefined}
              aria-current={index === activeLine ? "true" : undefined}
              className={
                index === activeLine ? "font-medium text-foreground" : "text-muted-foreground"
              }
            >
              {line.text || "♪"}
            </p>
          ))}
        </div>
      )}
      {state.track?.artist && (
        <p className="text-xs text-muted-foreground">作者：{state.track.artist}</p>
      )}
      {(state.track?.sourceUrl || state.track?.license) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {state.track.sourceUrl && (
            <a
              href={state.track.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              作品来源
            </a>
          )}
          {state.track.license &&
            (state.track.licenseUrl ? (
              <a
                href={state.track.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {state.track.license}
              </a>
            ) : (
              <span>{state.track.license}</span>
            ))}
        </p>
      )}
      {tracks.length > 0 && (
        <div
          role="region"
          aria-label="播放列表"
          tabIndex={0}
          className="max-h-40 space-y-1 overflow-y-auto border-t border-border pt-3"
          data-lenis-prevent
        >
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              aria-pressed={track.id === state.track?.id}
              onClick={() => void engine.play(track, 0)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted aria-pressed:bg-brand-soft"
            >
              <span className="min-w-0 truncate">
                {track.title}
                <span className="ml-2 text-xs text-muted-foreground">{track.artist}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {audioTime(track.duration)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  if (mobile)
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={capsule} />
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-2xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          data-lenis-prevent
        >
          <SheetHeader className="px-0">
            <SheetTitle>轻音乐</SheetTitle>
            <SheetDescription>选择喜欢的音乐，陪你慢慢阅读。</SheetDescription>
          </SheetHeader>
          {content}
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
        className="max-h-[80svh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl p-5"
        data-lenis-prevent
      >
        <PopoverTitle className="sr-only">轻音乐</PopoverTitle>
        <PopoverDescription className="sr-only">选择喜欢的音乐，陪你慢慢阅读。</PopoverDescription>
        {content}
      </PopoverContent>
    </Popover>
  );
}
