import { ArrowRightIcon, PinIcon } from "lucide-react";
import { ViewTransition } from "react";

import { formatDate, formatDateISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PostListItem } from "@/server/posts";

import { Cover } from "./cover";
import { PostLink } from "./post-link";

export function PostCard({ post, priority = false }: { post: PostListItem; priority?: boolean }) {
  return (
    <article className="group/card relative">
      <PostLink
        href={`/posts/${post.slug}`}
        className={cn(
          "relative grid items-center gap-5 rounded-[1.4rem] p-3 sm:gap-8 sm:p-4",
          "transition-[background-color,box-shadow,translate] duration-500 ease-out-expo",
          "hover:-translate-y-0.5 hover:bg-card hover:shadow-soft focus-visible:bg-card",
          post.cover && "sm:grid-cols-[minmax(0,17rem)_1fr]",
        )}
      >
        {post.cover && (
          <ViewTransition name={`post-cover-${post.id}`} share="morph" default="none">
            <Cover
              src={post.cover}
              meta={post.coverMeta}
              alt={post.title}
              thumb
              priority={priority}
              className="aspect-[16/10] rounded-2xl"
              imgClassName="transition-transform duration-[900ms] ease-out-expo group-hover/card:scale-[1.045]"
            />
          </ViewTransition>
        )}

        <div className={cn("min-w-0 py-1", !post.cover && "px-2")}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8rem] text-muted-foreground">
            {post.pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.72rem] font-medium text-brand">
                <PinIcon className="size-3" />
                置顶
              </span>
            )}
            {post.category && <span className="text-brand">{post.category.name}</span>}
            <time dateTime={formatDateISO(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
            <span aria-hidden className="text-subtle">
              ·
            </span>
            <span>{post.readingTime} 分钟阅读</span>
          </div>

          <ViewTransition name={`post-title-${post.id}`} share="morph-text" default="none">
            <h2 className="mt-2.5 w-fit font-serif text-[1.28rem] leading-snug font-semibold text-balance text-foreground transition-colors duration-300 group-hover/card:text-brand sm:text-[1.42rem]">
              {post.title}
            </h2>
          </ViewTransition>

          {post.excerpt && (
            <p className="mt-2.5 line-clamp-2 text-[0.94rem] leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          )}

          <span className="mt-4 inline-flex -translate-x-1.5 items-center gap-1.5 text-[0.82rem] font-medium text-brand opacity-0 transition-[opacity,translate] duration-500 ease-out-expo group-hover/card:translate-x-0 group-hover/card:opacity-100">
            阅读全文
            <ArrowRightIcon className="size-3.5" />
          </span>
        </div>
      </PostLink>
    </article>
  );
}
