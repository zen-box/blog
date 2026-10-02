import { and, eq, lte } from "drizzle-orm";

import { db, schema } from "@/db";
import { pngResponse, postOgImage } from "@/server/og-image";

/** 文章和页面的分享图；地址里带 ?v=更新时间，内容变了就是新地址 */
export async function GET(_request: Request, ctx: RouteContext<"/og/post/[id]">) {
  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return new Response("Not found", { status: 404 });
  const { posts, categories } = schema;
  const post = db
    .select({
      id: posts.id,
      title: posts.title,
      cover: posts.cover,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      category: categories.name,
    })
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(
      and(
        eq(posts.id, Number(id)),
        eq(posts.status, "published"),
        lte(posts.publishedAt, new Date()),
      ),
    )
    .get();
  if (!post) return new Response("Not found", { status: 404 });
  return pngResponse(await postOgImage(post));
}
