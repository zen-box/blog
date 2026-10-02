import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeriesList } from "@/components/post/series-list";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { formatDate } from "@/lib/format";
import { getSeriesBySlug } from "@/server/series";

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/series/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const series = getSeriesBySlug(safeDecode(slug));
  if (!series) return { title: "系列不存在" };
  return {
    title: `系列 · ${series.name}`,
    description: series.description || undefined,
    alternates: { canonical: `/series/${series.slug}` },
  };
}

export default async function SeriesPage({ params }: PageProps<"/series/[slug]">) {
  const { slug } = await params;
  const series = getSeriesBySlug(safeDecode(slug));
  if (!series) notFound();
  const minutes = series.posts.reduce((n, post) => n + post.readingTime, 0);
  return (
    <PageView>
      <PageHeader
        eyebrow="Series"
        title={series.name}
        description={
          <>
            {series.description && <p>{series.description}</p>}
            <p className="mt-2 text-sm text-subtle">
              {series.posts.length} 篇 · 读完大约 {minutes} 分钟
            </p>
          </>
        }
      />
      <div className="container-page">
        <div className="max-w-3xl">
          <SeriesList
            posts={series.posts.map((post) => ({
              id: post.id,
              title: post.title,
              slug: post.slug,
              readingTime: post.readingTime,
              date: formatDate(post.publishedAt),
            }))}
          />
        </div>
      </div>
    </PageView>
  );
}
