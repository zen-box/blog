import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { listPublicSeries } from "@/server/series";

export const metadata: Metadata = { title: "系列", alternates: { canonical: "/series" } };

export default function SeriesIndexPage() {
  const list = listPublicSeries();
  return (
    <PageView>
      <PageHeader
        eyebrow="Series"
        title="系列"
        description={list.length ? "按主题串起来的文章，适合从头读到尾。" : "还没有系列。"}
      />
      <div className="container-page">
        <ul className="grid max-w-4xl gap-4 sm:grid-cols-2">
          {list.map((series) => (
            <li key={series.id}>
              <Link
                href={`/series/${series.slug}`}
                className="group block h-full rounded-2xl border border-border bg-card px-6 py-5 transition-[border-color,background-color] duration-300 hover:border-brand/40 hover:bg-brand-soft/30"
              >
                <span className="block font-serif text-lg font-semibold text-foreground transition-colors group-hover:text-brand">
                  {series.name}
                </span>
                {series.description && (
                  <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                    {series.description}
                  </span>
                )}
                <span className="mt-3 block text-xs text-subtle">{series.posts.length} 篇</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageView>
  );
}
