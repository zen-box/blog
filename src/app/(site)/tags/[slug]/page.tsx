import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { Pagination } from "@/components/site/pagination";
import { PostList } from "@/components/site/post-list";
import { getSettings } from "@/lib/settings";
import { getTagBySlug, listPosts } from "@/server/posts";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: PageProps<"/tags/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tag = getTagBySlug(decode(slug));
  if (!tag) return { title: "标签不存在" };
  return { title: `标签：${tag.name}`, alternates: { canonical: `/tags/${tag.slug}` } };
}

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[slug]">) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const tag = getTagBySlug(decode(slug));
  if (!tag) notFound();

  const page = Math.max(1, Number(pageParam) || 1);
  const result = listPosts({ page, pageSize: getSettings().postsPerPage, tagId: tag.id });
  if (page > result.pageCount) notFound();

  return (
    <PageView>
      <PageHeader
        eyebrow={
          <Link href="/tags" className="transition-colors hover:text-brand">
            标签
          </Link>
        }
        title={
          <>
            <span className="mr-1 text-brand/50">#</span>
            {tag.name}
          </>
        }
        description={<p className="text-sm text-subtle">共 {result.total} 篇文章</p>}
      />
      <div className="container-page">
        {result.items.length ? (
          <PostList posts={result.items} />
        ) : (
          <p className="py-16 text-center text-muted-foreground">这个标签下还没有文章</p>
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(p) => `/tags/${tag.slug}${p > 1 ? `?page=${p}` : ""}`}
        />
      </div>
    </PageView>
  );
}
