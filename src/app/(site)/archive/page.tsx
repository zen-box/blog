import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { PostLink } from "@/components/site/post-link";
import { formatDateISO, formatMonthDay } from "@/lib/format";
import { getArchive, getSiteStats } from "@/server/posts";

export const metadata: Metadata = { title: "归档", alternates: { canonical: "/archive" } };

export default function ArchivePage() {
  const { years, total } = getArchive();
  const stats = getSiteStats();

  return (
    <PageView>
      <PageHeader
        eyebrow="Archive"
        title="归档"
        description={
          total ? (
            <>
              共 {total} 篇文章，{stats.words.toLocaleString("zh-CN")} 字。继续写下去。
            </>
          ) : (
            "这里还空空如也。"
          )
        }
      >
        <div className="mt-6 flex gap-2 text-sm">
          <Link
            href="/categories"
            className="rounded-full border border-border px-4 py-1.5 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            分类 · {stats.categoryCount}
          </Link>
          <Link
            href="/tags"
            className="rounded-full border border-border px-4 py-1.5 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            标签 · {stats.tagCount}
          </Link>
        </div>
      </PageHeader>

      <div className="container-page">
        <div className="max-w-3xl space-y-14">
          {years.map((y, yi) => (
            <Reveal key={y.year} delay={yi === 0 ? 0.1 : 0}>
              <section className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:gap-10">
                <h2 className="flex items-baseline gap-3 sm:block">
                  <span className="font-serif text-4xl font-bold tracking-tight text-foreground/90 tabular-nums sm:text-5xl">
                    {y.year}
                  </span>
                  <span className="text-sm text-subtle sm:mt-2 sm:block">{y.posts.length} 篇</span>
                </h2>
                <ol className="relative border-l border-border/80">
                  {y.posts.map((p) => (
                    <li key={p.id} className="group/item relative">
                      <span
                        aria-hidden
                        className="absolute top-1/2 -left-[4.5px] size-2 -translate-y-1/2 rounded-full border border-border bg-background transition-[background-color,border-color,scale] duration-300 group-hover/item:scale-125 group-hover/item:border-brand group-hover/item:bg-brand"
                      />
                      <PostLink
                        href={`/posts/${p.slug}`}
                        className="flex items-baseline gap-5 py-2.5 pl-6 transition-[translate] duration-500 ease-out-expo group-hover/item:translate-x-1"
                      >
                        <time
                          dateTime={formatDateISO(p.publishedAt)}
                          className="shrink-0 font-mono text-[0.8rem] text-subtle tabular-nums"
                        >
                          {formatMonthDay(p.publishedAt)}
                        </time>
                        <span className="text-[1rem] text-foreground transition-colors duration-300 group-hover/item:text-brand">
                          {p.title}
                        </span>
                      </PostLink>
                    </li>
                  ))}
                </ol>
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </PageView>
  );
}
