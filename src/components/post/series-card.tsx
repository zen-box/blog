"use client";

import { ArrowRightIcon, CheckIcon, ChevronDownIcon, LibraryBigIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { markRead, useReadPosts } from "./read-store";

const EASE = [0.16, 1, 0.3, 1] as const;

export type SeriesCardData = {
  name: string;
  slug: string;
  posts: { id: number; title: string; slug: string }[];
};

/** 读到四分之三就算读过 */
function useMarkRead(postId: number) {
  useEffect(() => {
    let done = false;
    const check = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (!done && max > 0 && scrollY / max > 0.75) {
        done = true;
        markRead(postId);
      }
    };
    addEventListener("scroll", check, { passive: true });
    return () => removeEventListener("scroll", check);
  }, [postId]);
}

/** 文章开头的系列卡片：目录、本文是第几篇、读过几篇 */
export function SeriesCard({ series, currentId }: { series: SeriesCardData; currentId: number }) {
  const read = useReadPosts();
  useMarkRead(currentId);
  const index = series.posts.findIndex((post) => post.id === currentId);
  const [open, setOpen] = useState(series.posts.length <= 6);
  const done = series.posts.filter((post) => read.has(post.id)).length;

  return (
    <section
      aria-label={`系列：${series.name}`}
      className="mb-8 overflow-hidden rounded-2xl border border-border bg-card"
      data-series
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <LibraryBigIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">
            <span className="text-muted-foreground">系列 · </span>
            {series.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            第 {index + 1} 篇，共 {series.posts.length} 篇
            {done > 0 && <span className="text-subtle"> · 读过 {done} 篇</span>}
          </span>
        </span>
        {/* 阅读进度 */}
        <span
          aria-hidden
          className="hidden h-1 w-16 overflow-hidden rounded-full bg-muted sm:block"
        >
          <span
            className="block h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${(done / series.posts.length) * 100}%` }}
          />
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <ol className="border-t border-border/70 px-2 py-2">
              {series.posts.map((post, i) => {
                const current = post.id === currentId;
                const seen = read.has(post.id);
                return (
                  <li key={post.id}>
                    <Link
                      href={`/posts/${post.slug}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60",
                        current ? "bg-brand-soft/50 text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] tabular-nums",
                          seen && !current
                            ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                            : current
                              ? "bg-brand text-brand-foreground"
                              : "border border-border text-subtle",
                        )}
                      >
                        {seen && !current ? <CheckIcon className="size-3" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{post.title}</span>
                      {current && <span className="shrink-0 text-xs text-brand">正在读</span>}
                    </Link>
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-border/70 px-5 py-2.5 text-xs">
              <Link href={`/series/${series.slug}`} className="text-brand hover:opacity-80">
                查看整个系列
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** 文章末尾：本系列的下一篇 */
export function SeriesNext({ series, currentId }: { series: SeriesCardData; currentId: number }) {
  const index = series.posts.findIndex((post) => post.id === currentId);
  const next = series.posts[index + 1];
  if (!next) return null;
  return (
    <Link
      href={`/posts/${next.slug}`}
      className="group mt-12 flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-[border-color,background-color] duration-300 hover:border-brand/40 hover:bg-brand-soft/30"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">
          「{series.name}」下一篇 · 第 {index + 2} 篇
        </span>
        <span className="mt-1 block truncate font-serif text-[1.05rem] font-semibold text-foreground">
          {next.title}
        </span>
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand" />
    </Link>
  );
}
