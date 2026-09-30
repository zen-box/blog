import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { getCategoriesWithCount } from "@/server/posts";

export const metadata: Metadata = { title: "分类", alternates: { canonical: "/categories" } };

export default function CategoriesPage() {
  const categories = getCategoriesWithCount();
  return (
    <PageView>
      <PageHeader eyebrow="Categories" title="分类" description={`${categories.length} 个分类`} />
      <div className="container-page">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c, i) => (
            <Reveal key={c.id} delay={Math.min(i, 8) * 0.05}>
              <Link
                href={`/categories/${c.slug}`}
                className="group/cat relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card/60 p-6 transition-[translate,box-shadow,border-color,background-color] duration-500 ease-out-expo hover:-translate-y-1 hover:border-transparent hover:bg-card hover:shadow-soft"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-3 -bottom-6 font-serif text-[6.5rem] leading-none font-bold text-foreground/[0.035] transition-[color,translate] duration-700 ease-out-expo select-none group-hover/cat:-translate-y-1 group-hover/cat:text-brand/[0.08]"
                >
                  {Array.from(c.name)[0]}
                </span>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-xl font-semibold text-foreground transition-colors group-hover/cat:text-brand">
                    {c.name}
                  </h2>
                  <ArrowUpRightIcon className="size-4 text-subtle transition-[color,translate] duration-500 ease-out-expo group-hover/cat:translate-x-0.5 group-hover/cat:-translate-y-0.5 group-hover/cat:text-brand" />
                </div>
                <p className="mt-2 line-clamp-2 min-h-[2.8em] text-sm leading-relaxed text-muted-foreground">
                  {c.description || "暂无介绍"}
                </p>
                <p className="mt-6 text-sm text-subtle">
                  <span className="font-mono text-foreground tabular-nums">{c.count}</span> 篇文章
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </PageView>
  );
}
