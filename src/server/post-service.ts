import "server-only";

import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { ImageMeta, Post } from "@/db/schema";
import { RENDER_VERSION, renderMarkdown } from "@/lib/markdown";
import { normalizeSlug, slugify } from "@/lib/slug";

import { findMediaByUrl } from "./media";
import { recordPostVersion, sameSnapshot, snapshotForPost, type SaveReason } from "./post-history";

const { posts, tags, postTags, categories } = schema;

/** 与前台固定路由冲突的独立页面 slug */
const RESERVED_PAGE_SLUGS = new Set([
  "admin",
  "api",
  "archive",
  "categories",
  "tags",
  "posts",
  "page",
  "moments",
  "links",
  "uploads",
  "feed.xml",
  "sitemap.xml",
  "robots.txt",
  "search",
]);

export const postInputSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(["post", "page"]).default("post"),
  title: z.string().trim().min(1, "标题不能为空").max(200),
  slug: z.string().trim().max(120).optional().default(""),
  content: z.string().default(""),
  excerpt: z.string().trim().max(500).optional().nullable(),
  cover: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishedAt: z.coerce.date().optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  pinned: z.boolean().default(false),
  allowComments: z.boolean().default(true),
  seoDescription: z.string().trim().max(300).optional().nullable(),
});

export type PostInput = z.input<typeof postInputSchema>;

function uniqueSlug(type: "post" | "page", base: string, excludeId?: number): string {
  let slug = base || `${type}-${Date.now().toString(36)}`;
  if (type === "page" && RESERVED_PAGE_SLUGS.has(slug)) slug = `${slug}-page`;
  for (let i = 2; ; i++) {
    const clash = db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.type, type),
          eq(posts.slug, slug),
          excludeId ? ne(posts.id, excludeId) : undefined,
        ),
      )
      .get();
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
}

function coverMetaFor(url: string | null | undefined): ImageMeta | null {
  const m = findMediaByUrl(url);
  if (!m?.width || !m?.height) return null;
  return { width: m.width, height: m.height, thumbhash: m.thumbhash };
}

/** 按名称确保标签存在，返回标签 id */
export function ensureTags(names: string[]): number[] {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const existing = db.select().from(tags).where(inArray(tags.name, unique)).all();
  const ids = existing.map((t) => t.id);
  for (const name of unique) {
    if (existing.some((t) => t.name === name)) continue;
    let slug = slugify(name) || normalizeSlug(name) || `tag-${Date.now().toString(36)}`;
    const clash = db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get();
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    ids.push(db.insert(tags).values({ name, slug }).returning({ id: tags.id }).get().id);
  }
  return ids;
}

/** 删除没有文章使用的标签 */
export function pruneUnusedTags() {
  db.delete(tags)
    .where(notInArray(tags.id, db.select({ id: postTags.tagId }).from(postTags)))
    .run();
}

export async function savePost(raw: PostInput, reason: SaveReason = "manual"): Promise<Post> {
  reason = z.enum(["manual", "auto", "publish"]).parse(reason);
  const input = postInputSchema.parse(raw);
  const existing = input.id
    ? db.select().from(posts).where(eq(posts.id, input.id)).get()
    : undefined;
  if (input.id && !existing) throw new Error("文章不存在");

  const wantedSlug = input.slug ? normalizeSlug(input.slug) : slugify(input.title);
  const slug = uniqueSlug(input.type, wantedSlug, input.id);

  const rendered = await renderMarkdown(input.content);

  let publishedAt = input.publishedAt ?? existing?.publishedAt ?? null;
  if (input.status === "published" && !publishedAt) publishedAt = new Date();

  if (input.categoryId) {
    const cat = db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .get();
    if (!cat) input.categoryId = null;
  }

  const values = {
    type: input.type,
    title: input.title,
    slug,
    content: input.content,
    html: rendered.html,
    toc: rendered.toc,
    summary: rendered.excerpt,
    renderVersion: RENDER_VERSION,
    wordCount: rendered.wordCount,
    readingTime: rendered.readingTime,
    excerpt: input.excerpt?.trim() || null,
    cover: input.cover?.trim() || null,
    coverMeta: coverMetaFor(input.cover),
    status: input.status,
    publishedAt,
    categoryId: input.type === "post" ? (input.categoryId ?? null) : null,
    pinned: input.type === "post" ? input.pinned : false,
    allowComments: input.allowComments,
    seoDescription: input.seoDescription?.trim() || null,
  };

  const shouldEnqueue =
    input.type === "post" &&
    input.status === "published" &&
    (existing?.status !== "published" || existing.content !== input.content);
  const enqueue = shouldEnqueue ? (await import("./reader-ai")).enqueueAutoSummary : undefined;

  const saved = db.transaction((tx) => {
    const current = input.id
      ? tx.select().from(posts).where(eq(posts.id, input.id)).get()
      : undefined;
    if (input.id && !current) throw new Error("文章不存在");
    const before = current ? snapshotForPost(current, tx) : undefined;
    const tagIds = input.type === "post" ? ensureTags(input.tags) : [];
    const row = current
      ? tx
          .update(posts)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(posts.id, current.id))
          .returning()
          .get()
      : tx.insert(posts).values(values).returning().get();
    tx.delete(postTags).where(eq(postTags.postId, row.id)).run();
    if (tagIds.length) {
      tx.insert(postTags)
        .values(tagIds.map((tagId) => ({ postId: row.id, tagId })))
        .run();
    }
    const after = snapshotForPost(row, tx);
    if (!before || !sameSnapshot(before, after)) {
      const effectiveReason =
        row.status === "published" && current?.status !== "published" ? "publish" : reason;
      // 保存前后的正文、标签及全部可编辑元数据在同一事务内留存。
      if (before)
        recordPostVersion(
          tx,
          row.id,
          before,
          effectiveReason === "auto" ? "manual" : effectiveReason,
        );
      recordPostVersion(tx, row.id, after, effectiveReason, { merge: effectiveReason === "auto" });
    }
    // Article and authorized background work commit together, including save failures.
    enqueue?.(row);
    return row;
  });

  pruneUnusedTags();
  return saved;
}

export function deletePost(id: number) {
  db.delete(posts).where(eq(posts.id, id)).run();
  pruneUnusedTags();
}

/** 管线升级后重新渲染全部内容 */
export async function rerenderAll(): Promise<number> {
  const rows = db.select({ id: posts.id, content: posts.content }).from(posts).all();
  for (const row of rows) {
    const r = await renderMarkdown(row.content);
    db.update(posts)
      .set({
        html: r.html,
        toc: r.toc,
        summary: r.excerpt,
        wordCount: r.wordCount,
        readingTime: r.readingTime,
        renderVersion: RENDER_VERSION,
      })
      .where(eq(posts.id, row.id))
      .run();
  }
  return rows.length;
}

export function tagNamesFor(postId: number): string[] {
  return db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, postId))
    .orderBy(sql`${tags.name}`)
    .all()
    .map((t) => t.name);
}
