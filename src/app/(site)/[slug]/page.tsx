import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArticleView } from "@/components/post/article-view";
import { getPublishedPage } from "@/server/posts";

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const loadPage = cache(async (slug: string) => getPublishedPage(safeDecode(slug)));

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) return { title: "页面不存在" };
  return {
    title: page.title,
    description: page.seoDescription || page.excerpt || page.summary || undefined,
    alternates: { canonical: `/${page.slug}` },
  };
}

/** 独立页面，例如 /about */
export default async function StandalonePage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();
  return <ArticleView post={page} />;
}
