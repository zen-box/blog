import "server-only";

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db, getSqlite, schema } from "@/db";
import { normalizeSlug, slugify } from "@/lib/slug";

const { series, seriesPosts, posts } = schema;

export type SeriesPost = {
  id: number;
  title: string;
  slug: string;
  readingTime: number;
  publishedAt: Date | null;
};
export type SeriesInfo = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  posts: SeriesPost[];
};

const published = () =>
  and(eq(posts.status, "published"), lte(posts.publishedAt, new Date()), eq(posts.type, "post"));

function postsOf(seriesId: number, publicOnly: boolean) {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      readingTime: posts.readingTime,
      publishedAt: posts.publishedAt,
      status: posts.status,
    })
    .from(seriesPosts)
    .innerJoin(posts, eq(posts.id, seriesPosts.postId))
    .where(and(eq(seriesPosts.seriesId, seriesId), publicOnly ? published() : undefined))
    .orderBy(asc(seriesPosts.position), asc(posts.publishedAt))
    .all();
}

/* ------------------------------------------------------------------ */
/* 前台                                                                   */
/* ------------------------------------------------------------------ */

/** 文章所属的系列（只含已发布的文章） */
export function getSeriesForPost(postId: number): SeriesInfo | null {
  const row = db
    .select({
      id: series.id,
      name: series.name,
      slug: series.slug,
      description: series.description,
    })
    .from(seriesPosts)
    .innerJoin(series, eq(series.id, seriesPosts.seriesId))
    .where(eq(seriesPosts.postId, postId))
    .get();
  if (!row) return null;
  const list = postsOf(row.id, true);
  if (list.length < 2 || !list.some((post) => post.id === postId)) return null;
  return { ...row, posts: list };
}

export function getSeriesBySlug(slug: string): SeriesInfo | null {
  const row = db.select().from(series).where(eq(series.slug, slug)).get();
  if (!row) return null;
  const list = postsOf(row.id, true);
  if (!list.length) return null;
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, posts: list };
}

/** 有已发布文章的系列，系列页的索引用 */
export function listPublicSeries() {
  const rows = db.select().from(series).orderBy(asc(series.name)).all();
  return rows
    .map((row) => ({ ...row, posts: postsOf(row.id, true) }))
    .filter((row) => row.posts.length > 0);
}

/* ------------------------------------------------------------------ */
/* 后台                                                                   */
/* ------------------------------------------------------------------ */

export function listSeriesAdmin() {
  return db
    .select()
    .from(series)
    .orderBy(asc(series.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      posts: postsOf(row.id, false).map((post) => ({
        id: post.id,
        title: post.title,
        status: post.status,
      })),
    }));
}

/** 可以加进系列的文章（不含页面） */
export function listSeriesCandidates() {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      seriesId: seriesPosts.seriesId,
    })
    .from(posts)
    .leftJoin(seriesPosts, eq(seriesPosts.postId, posts.id))
    .where(eq(posts.type, "post"))
    .orderBy(sql`${posts.publishedAt} DESC NULLS LAST`, sql`${posts.id} DESC`)
    .all();
}

export const seriesOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("save"),
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(60),
      slug: z.string().trim().max(80).default(""),
      description: z.string().trim().max(500).default(""),
      postIds: z.array(z.number().int().positive()).max(200),
    })
    .strict(),
  z.object({ op: z.literal("delete"), id: z.number().int().positive() }).strict(),
]);

export class SeriesError extends Error {}

/** 保存系列和其中文章的顺序；一篇文章只能属于一个系列，加进来时会从原系列移出 */
export function saveSeries(input: z.output<typeof seriesOperationSchema> & { op: "save" }) {
  const slug = normalizeSlug(input.slug) || slugify(input.name) || `series-${Date.now()}`;
  return getSqlite()
    .transaction(() => {
      const clash = db.select({ id: series.id }).from(series).where(eq(series.slug, slug)).get();
      if (clash && clash.id !== input.id) throw new SeriesError("这个链接已被其他系列使用");
      let id = input.id;
      if (id) {
        if (!db.select({ id: series.id }).from(series).where(eq(series.id, id)).get())
          throw new SeriesError("系列不存在");
        db.update(series)
          .set({ name: input.name, slug, description: input.description || null })
          .where(eq(series.id, id))
          .run();
      } else {
        id = db
          .insert(series)
          .values({ name: input.name, slug, description: input.description || null })
          .returning({ id: series.id })
          .get().id;
      }
      const ids = [...new Set(input.postIds)];
      if (ids.length) {
        const found = db
          .select({ id: posts.id })
          .from(posts)
          .where(and(inArray(posts.id, ids), eq(posts.type, "post")))
          .all();
        if (found.length !== ids.length) throw new SeriesError("有文章不存在或不是普通文章");
        db.delete(seriesPosts).where(inArray(seriesPosts.postId, ids)).run();
      }
      db.delete(seriesPosts).where(eq(seriesPosts.seriesId, id)).run();
      if (ids.length)
        db.insert(seriesPosts)
          .values(ids.map((postId, position) => ({ postId, seriesId: id!, position })))
          .run();
      return id;
    })
    .immediate();
}

export function deleteSeries(id: number) {
  db.delete(series).where(eq(series.id, id)).run();
}
