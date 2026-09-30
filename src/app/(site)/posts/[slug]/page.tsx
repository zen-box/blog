import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArticleView } from "@/components/post/article-view";
import { getAdjacentPosts, getPublishedPost, getRelatedPosts } from "@/server/posts";
import { resolveUploadUrl } from "@/server/storage";

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const loadPost = cache(async (slug: string) => getPublishedPost(safeDecode(slug)));

export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "文章不存在" };
  const description = post.seoDescription || post.excerpt || post.summary || undefined;
  return {
    title: post.title,
    description,
    keywords: post.tags.map((t) => t.name),
    alternates: { canonical: `/posts/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      tags: post.tags.map((t) => t.name),
      images: post.cover ? [{ url: resolveUploadUrl(post.cover) }] : undefined,
    },
    twitter: { card: post.cover ? "summary_large_image" : "summary" },
  };
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();
  return (
    <ArticleView post={post} adjacent={getAdjacentPosts(post)} related={getRelatedPosts(post)} />
  );
}
