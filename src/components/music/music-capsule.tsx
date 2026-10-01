"use client";

import { Disc3Icon } from "lucide-react";

import { cn } from "@/lib/utils";

/** 左下角的音乐入口：唱片封面（播放时缓慢转动）+ 外圈进度 + 曲名 */
export function MusicCapsule({
  title,
  subtitle,
  cover,
  playing = false,
  progress = 0,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "title"> & {
  title: string;
  subtitle?: string;
  cover?: string;
  playing?: boolean;
  /** 0–1 */
  progress?: number;
}) {
  const r = 16.5;
  const length = 2 * Math.PI * r;
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "music-capsule fixed bottom-6 left-5 z-40 inline-flex h-11 max-w-[15rem] items-center gap-2.5 rounded-full border border-border/80 bg-card/90 py-1 pr-4 pl-1 text-left shadow-float backdrop-blur-md transition-[background-color,box-shadow,transform] duration-300 hover:bg-card active:scale-[0.98] md:bottom-8 md:left-8",
        className,
      )}
    >
      <span className="relative size-9 shrink-0">
        <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="1.5" className="stroke-border" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="stroke-brand transition-[stroke-dashoffset] duration-700 ease-linear"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
          />
        </svg>
        <span
          aria-hidden
          data-playing={playing || undefined}
          className="music-vinyl absolute inset-[4px] overflow-hidden rounded-full bg-muted"
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center bg-linear-to-br from-brand/20 to-ochre/25 text-brand">
              <Disc3Icon className="size-4" />
            </span>
          )}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm leading-tight text-foreground">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}
