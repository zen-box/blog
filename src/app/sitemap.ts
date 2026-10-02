import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { siteUrl } from "@/lib/settings";
import { getCategoriesWithCount, getTagsWithCount, publishedPost } from "@/server/posts";
import { listPublicSeries } from "@/server/series";

// 每次请求实时生成（否则构建时就会读取数据库）
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const posts = db
    .select({ slug: schema.posts.slug, updatedAt: schema.posts.updatedAt })
    .from(schema.posts)
    .where(publishedPost())
    .all();
  const pages = db
    .select({ slug: schema.posts.slug, updatedAt: schema.posts.updatedAt })
    .from(schema.posts)
    .where(and(eq(schema.posts.type, "page"), eq(schema.posts.status, "published")))
    .all();

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/archive`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/moments`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/links`, changeFrequency: "monthly", priority: 0.4 },
    ...posts.map((p) => ({
      url: `${base}/posts/${encodeURI(p.slug)}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...pages.map((p) => ({
      url: `${base}/${encodeURI(p.slug)}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...getCategoriesWithCount()
      .filter((c) => c.count > 0)
      .map((c) => ({ url: `${base}/categories/${encodeURI(c.slug)}`, priority: 0.4 })),
    ...getTagsWithCount().map((t) => ({ url: `${base}/tags/${encodeURI(t.slug)}`, priority: 0.3 })),
    ...listPublicSeries().map((s) => ({
      url: `${base}/series/${encodeURI(s.slug)}`,
      priority: 0.5,
    })),
  ];
}
