import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
  FileTextIcon,
  MessageCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { ViewTransition } from "react";

import { Cover } from "@/components/site/cover";
import { PostLink } from "@/components/site/post-link";
import { formatDate, formatDateISO } from "@/lib/format";
import { thumbUrl } from "@/lib/images";
import type { SiteSettings } from "@/lib/settings";
import type { AdjacentPost, PostDetail } from "@/server/posts";
import { resolveUploadUrl } from "@/server/storage";

import { LikeButton } from "./like-button";
import { PosterButton } from "./poster-button";
import { ShareButton } from "./share-button";
import { ViewCounter } from "./view-counter";

export function PostHero({
  post,
  commentCount,
  listen,
}: {
  post: PostDetail;
  commentCount: number;
  /** 标题下方的「收听本文」 */
  listen?: React.ReactNode;
}) {
  const isPage = post.type === "page";
  return (
    <>
      <header className="container-read pt-12 sm:pt-20">
        {!isPage && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {post.category && (
              <Link
                href={`/categories/${post.category.slug}`}
                className="text-brand transition-opacity hover:opacity-75"
              >
                {post.category.name}
              </Link>
            )}
            {post.category && <span className="text-subtle">/</span>}
            <time dateTime={formatDateISO(post.publishedAt)}>{formatDate(post.publishedAt)}</time>
          </div>
        )}
        <ViewTransition name={`post-title-${post.id}`} share="morph-text" default="none">
          <h1 className="mt-4 w-fit font-serif text-[clamp(1.85rem,4.4vw,2.7rem)] leading-[1.32] font-bold tracking-[0.01em] text-balance text-foreground">
            {post.title}
          </h1>
        </ViewTransition>
        {!isPage && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.82rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              {post.readingTime} 分钟
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileTextIcon className="size-3.5" />
              {post.wordCount.toLocaleString("zh-CN")} 字
            </span>
            <ViewCounter postId={post.id} initial={post.views} />
            <a
              href="#comments"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-brand"
            >
              <MessageCircleIcon className="size-3.5" />
              {commentCount} 条评论
            </a>
          </div>
        )}
        {listen && <div className="mt-6">{listen}</div>}
      </header>

      {post.cover && (
        <div className="container-page mt-10 sm:mt-12">
          <ViewTransition name={`post-cover-${post.id}`} share="morph" default="none">
            <Cover
              src={post.cover}
              meta={post.coverMeta}
              alt={post.title}
              priority
              progressive
              className="mx-auto aspect-[2/1] max-w-[56rem] rounded-3xl shadow-soft"
            />
          </ViewTransition>
        </div>
      )}
    </>
  );
}

export function PostFooter({
  post,
  settings,
  url,
}: {
  post: PostDetail;
  settings: SiteSettings;
  url: string;
}) {
  const updated =
    post.publishedAt && post.updatedAt.getTime() - post.publishedAt.getTime() > 86_400_000;
  return (
    <footer className="container-read mt-14 space-y-10">
      {(post.tags.length > 0 || updated) && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <Link
                key={t.slug}
                href={`/tags/${t.slug}`}
                className="rounded-full border border-border px-3 py-1 text-[0.8rem] text-muted-foreground transition-[color,border-color,background-color] duration-300 hover:border-brand/40 hover:bg-brand-soft/60 hover:text-brand"
              >
                <span className="mr-0.5 text-subtle">#</span>
                {t.name}
              </Link>
            ))}
          </div>
          {updated && (
            <p className="text-xs text-subtle">最后更新于 {formatDate(post.updatedAt)}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <LikeButton postId={post.id} initial={post.likes} />
        <ShareButton title={post.title} />
        <PosterButton
          title={post.title}
          excerpt={post.excerpt || post.summary || ""}
          cover={post.cover ? resolveUploadUrl(post.cover) : undefined}
          meta={[post.category?.name, formatDate(post.publishedAt)].filter(Boolean).join(" · ")}
          author={settings.authorName}
          site={settings.siteTitle}
          url={url}
        />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-4 text-[0.82rem] leading-7 text-muted-foreground sm:px-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-2 font-serif text-[6.5rem] leading-none text-foreground/[0.04] select-none"
        >
          ©
        </span>
        <p>
          <span className="text-foreground">本文作者：</span>
          {settings.authorName}
        </p>
        <p className="truncate">
          <span className="text-foreground">本文链接：</span>
          <a href={url} className="transition-colors hover:text-brand">
            {decodeURI(url)}
          </a>
        </p>
        <p>
          <span className="text-foreground">版权声明：</span>
          除特别声明外，本博客文章均采用{" "}
          <a
            href={settings.licenseUrl}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-brand underline decoration-brand/40 underline-offset-4"
          >
            {settings.license}
          </a>{" "}
          许可协议，转载请注明出处。
        </p>
      </div>
    </footer>
  );
}

export function PostNav({
  newer,
  older,
}: {
  newer: AdjacentPost | null;
  older: AdjacentPost | null;
}) {
  if (!newer && !older) return null;
  const card =
    "group/nav flex flex-col rounded-2xl border border-border p-5 transition-[background-color,box-shadow,border-color,translate] duration-500 ease-out-expo hover:-translate-y-0.5 hover:border-transparent hover:bg-card hover:shadow-soft";
  return (
    <nav aria-label="上下篇" className="container-read mt-14 grid gap-3 sm:grid-cols-2">
      {newer ? (
        <PostLink href={`/posts/${newer.slug}`} className={card}>
          <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
            <ArrowLeftIcon className="size-3.5 transition-transform duration-300 group-hover/nav:-translate-x-0.5" />
            上一篇
          </span>
          <span className="mt-2 line-clamp-2 font-serif font-semibold text-foreground transition-colors group-hover/nav:text-brand">
            {newer.title}
          </span>
        </PostLink>
      ) : (
        <div className="max-sm:hidden" />
      )}
      {older && (
        <PostLink href={`/posts/${older.slug}`} className={`${card} items-end text-right`}>
          <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
            下一篇
            <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover/nav:translate-x-0.5" />
          </span>
          <span className="mt-2 line-clamp-2 font-serif font-semibold text-foreground transition-colors group-hover/nav:text-brand">
            {older.title}
          </span>
        </PostLink>
      )}
    </nav>
  );
}

export function RelatedPosts({ posts }: { posts: AdjacentPost[] }) {
  if (!posts.length) return null;
  return (
    <section className="container-read mt-16">
      <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">相关文章</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {posts.map((p) => (
          <PostLink key={p.slug} href={`/posts/${p.slug}`} className="group/rel block">
            <div className="aspect-[16/10] overflow-hidden rounded-xl bg-muted">
              {p.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveUploadUrl(thumbUrl(p.cover) ?? p.cover)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-700 ease-out-expo group-hover/rel:scale-105"
                />
              ) : (
                <div className="grid size-full place-items-center font-serif text-3xl text-subtle">
                  {Array.from(p.title)[0]}
                </div>
              )}
            </div>
            <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-foreground transition-colors group-hover/rel:text-brand">
              {p.title}
            </p>
          </PostLink>
        ))}
      </div>
    </section>
  );
}
