import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { Pagination } from "@/components/site/pagination";
import { PostList } from "@/components/site/post-list";
import { getSettings } from "@/lib/settings";
import { getCategoryBySlug, listPosts } from "@/server/posts";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(decode(slug));
  if (!category) return { title: "分类不存在" };
  return {
    title: `分类：${category.name}`,
    description: category.description ?? undefined,
    alternates: { canonical: `/categories/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const category = getCategoryBySlug(decode(slug));
  if (!category) notFound();

  const page = Math.max(1, Number(pageParam) || 1);
  const result = listPosts({ page, pageSize: getSettings().postsPerPage, categoryId: category.id });
  if (page > result.pageCount) notFound();

  return (
    <PageView>
      <PageHeader
        eyebrow={
          <Link href="/categories" className="transition-colors hover:text-brand">
            分类
          </Link>
        }
        title={category.name}
        description={
          <>
            {category.description && <p>{category.description}</p>}
            <p className="mt-1 text-sm text-subtle">共 {result.total} 篇文章</p>
          </>
        }
      />
      <div className="container-page">
        {result.items.length ? (
          <PostList posts={result.items} />
        ) : (
          <p className="py-16 text-center text-muted-foreground">这个分类下还没有文章</p>
        )}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          hrefFor={(p) => `/categories/${category.slug}${p > 1 ? `?page=${p}` : ""}`}
        />
      </div>
    </PageView>
  );
}
