"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { useReadPosts } from "./read-store";

type Item = { id: number; title: string; slug: string; readingTime: number; date: string };

/** 系列页的文章目录：按顺序排列，标出读过的 */
export function SeriesList({ posts }: { posts: Item[] }) {
  const read = useReadPosts();
  const done = posts.filter((post) => read.has(post.id)).length;
  return (
    <div>
      <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${(done / posts.length) * 100}%` }}
          />
        </span>
        {done ? `读过 ${done} / ${posts.length} 篇` : `共 ${posts.length} 篇，从第一篇开始吧`}
      </div>
      <ol className="space-y-3">
        {posts.map((post, i) => {
          const seen = read.has(post.id);
          return (
            <li key={post.id}>
              <Link
                href={`/posts/${post.slug}`}
                className="group flex items-center gap-5 rounded-2xl border border-border bg-card px-5 py-4 transition-[border-color,background-color] duration-300 hover:border-brand/40 hover:bg-brand-soft/30"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full font-serif text-base tabular-nums",
                    seen
                      ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {seen ? <CheckIcon className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[1.05rem] font-semibold text-foreground transition-colors group-hover:text-brand">
                    {post.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {post.date} · {post.readingTime} 分钟
                    {seen && <span className="text-subtle"> · 读过</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
