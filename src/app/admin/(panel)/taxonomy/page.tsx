import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";
import { db, schema } from "@/db";

export const metadata: Metadata = { title: "分类与标签" };

export default function AdminTaxonomyPage() {
  const { categories, tags, posts, postTags } = schema;
  const categoryRows = db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
      count: sql<number>`count(${posts.id})`,
    })
    .from(categories)
    .leftJoin(posts, eq(posts.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
  const tagRows = db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`count(${postTags.postId})`,
    })
    .from(tags)
    .leftJoin(postTags, eq(postTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .all();

  return (
    <AdminPage
      title="分类与标签"
      description="一篇文章属于一个分类，可以有多个标签。标签在写文章时自动创建。"
    >
      <TaxonomyManager categories={categoryRows} tags={tagRows} />
    </AdminPage>
  );
}
