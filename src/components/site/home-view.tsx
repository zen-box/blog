import { ArrowRightIcon, PenLineIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Stagger } from "@/components/motion/reveal";
import { formatCount } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getSiteStats, listPosts } from "@/server/posts";

import { PageView } from "./page-view";
import { Pagination } from "./pagination";
import { PostList } from "./post-list";
import { SocialLinks } from "./social-links";

export function HomeView({ page }: { page: number }) {
  const s = getSettings();
  const result = listPosts({ page, pageSize: s.postsPerPage, pinnedFirst: true });
  if (page > result.pageCount) notFound();
  const stats = getSiteStats();
  const isFirst = page === 1;

  return (
    <PageView>
      {isFirst ? (
        <section className="container-page pt-14 pb-10 sm:pt-24 sm:pb-16">
          <Stagger className="max-w-3xl">
            {[
              <p
                key="hi"
                className="flex items-center gap-3 text-[0.82rem] tracking-[0.22em] text-muted-foreground"
              >
                <span className="h-px w-8 bg-brand/60" />
                你好，我是 {s.authorName}
              </p>,
              <h1
                key="title"
                className="mt-5 font-serif text-[clamp(2.1rem,5.4vw,3.55rem)] leading-[1.22] font-bold tracking-[0.02em] text-balance text-foreground"
              >
                {s.heroTitle}
              </h1>,
              <p
                key="sub"
                className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-muted-foreground"
              >
                {s.heroSubtitle}
              </p>,
              <div key="meta" className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <SocialLinks social={s.social} className="-mx-2" />
                {stats.postCount > 0 && (
                  <p className="text-[0.82rem] text-subtle">
                    {stats.postCount} 篇文章 · {formatCount(stats.words)} 字
                  </p>
                )}
              </div>,
            ]}
          </Stagger>
        </section>
      ) : (
        <section className="container-page pt-14 pb-6 sm:pt-20">
          <p className="font-serif text-2xl font-semibold text-foreground">
            第 {page} 页
            <span className="ml-3 text-base font-normal text-muted-foreground">
              / 共 {result.pageCount} 页
            </span>
          </p>
        </section>
      )}

      <section className="container-page">
        {isFirst && (
          <div className="mb-5 flex items-end justify-between border-b border-border/70 pb-4">
            <h2 className="font-serif text-lg font-semibold tracking-wide text-foreground">
              最新文章
            </h2>
            <Link
              href="/archive"
              className="group/all inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-brand"
            >
              全部归档
              <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover/all:translate-x-0.5" />
            </Link>
          </div>
        )}

        {result.items.length ? (
          <PostList posts={result.items} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border py-20 text-center">
            <PenLineIcon className="size-8 text-subtle" />
            <p className="font-serif text-lg text-foreground">还没有发布文章</p>
            <p className="text-sm text-muted-foreground">
              去{" "}
              <Link href="/admin/posts/new" className="text-brand underline underline-offset-4">
                后台
              </Link>{" "}
              写下第一篇吧
            </p>
          </div>
        )}

        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(p) => (p === 1 ? "/" : `/page/${p}`)}
        />
      </section>
    </PageView>
  );
}
