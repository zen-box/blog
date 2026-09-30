import "server-only";

import { and, asc, count, desc, eq, gt, inArray, lt, lte, ne, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ImageMeta, Post } from "@/db/schema";
import { yearOf } from "@/lib/format";
import { RENDER_VERSION, renderMarkdown } from "@/lib/markdown";

const { posts, categories, tags, postTags, comments } = schema;

export type TaxonomyRef = { name: string; slug: string };

export type PostListItem = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  cover: string | null;
  coverMeta: ImageMeta | null;
  publishedAt: Date | null;
  readingTime: number;
  wordCount: number;
  views: number;
  pinned: boolean;
  category: TaxonomyRef | null;
  tags: TaxonomyRef[];
  commentCount: number;
};

/** 已发布且发布时间已到（支持定时发布） */
export function publishedPost(): SQL {
  return and(
    eq(posts.type, "post"),
    eq(posts.status, "published"),
    lte(posts.publishedAt, new Date()),
  )!;
}

const listColumns = {
  id: posts.id,
  title: posts.title,
  slug: posts.slug,
  excerpt: posts.excerpt,
  summary: posts.summary,
  cover: posts.cover,
  coverMeta: posts.coverMeta,
  publishedAt: posts.publishedAt,
  readingTime: posts.readingTime,
  wordCount: posts.wordCount,
  views: posts.views,
  pinned: posts.pinned,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

type ListRow = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  summary: string | null;
  cover: string | null;
  coverMeta: ImageMeta | null;
  publishedAt: Date | null;
  readingTime: number;
  wordCount: number;
  views: number;
  pinned: boolean;
  categoryName: string | null;
  categorySlug: string | null;
};

function hydrate(rows: ListRow[]): PostListItem[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const tagRows = db
    .select({ postId: postTags.postId, name: tags.name, slug: tags.slug })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(inArray(postTags.postId, ids))
    .orderBy(asc(tags.name))
    .all();
  const tagMap = new Map<number, TaxonomyRef[]>();
  for (const t of tagRows) {
    const list = tagMap.get(t.postId) ?? [];
    list.push({ name: t.name, slug: t.slug });
    tagMap.set(t.postId, list);
  }

  const countRows = db
    .select({ postId: comments.postId, n: count() })
    .from(comments)
    .where(and(inArray(comments.postId, ids), eq(comments.status, "approved")))
    .groupBy(comments.postId)
    .all();
  const countMap = new Map(countRows.map((c) => [c.postId, c.n]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt?.trim() || r.summary || "",
    cover: r.cover,
    coverMeta: r.coverMeta,
    publishedAt: r.publishedAt,
    readingTime: r.readingTime,
    wordCount: r.wordCount,
    views: r.views,
    pinned: r.pinned,
    category:
      r.categoryName && r.categorySlug ? { name: r.categoryName, slug: r.categorySlug } : null,
    tags: tagMap.get(r.id) ?? [],
    commentCount: countMap.get(r.id) ?? 0,
  }));
}

export type ListOptions = {
  page?: number;
  pageSize: number;
  categoryId?: number;
  tagId?: number;
  pinnedFirst?: boolean;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
};

export function listPosts(opts: ListOptions): Paginated<PostListItem> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const conds: SQL[] = [publishedPost()];
  if (opts.categoryId) conds.push(eq(posts.categoryId, opts.categoryId));
  if (opts.tagId) {
    conds.push(
      inArray(
        posts.id,
        db.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tagId, opts.tagId)),
      ),
    );
  }
  const where = and(...conds);

  const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;

  const order = opts.pinnedFirst
    ? [desc(posts.pinned), desc(posts.publishedAt), desc(posts.id)]
    : [desc(posts.publishedAt), desc(posts.id)];

  const rows = db
    .select(listColumns)
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(opts.pageSize)
    .offset((page - 1) * opts.pageSize)
    .all() as ListRow[];

  return {
    items: hydrate(rows),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / opts.pageSize)),
  };
}

/** 旧版本管线渲染的内容，读取时顺便升级 */
async function ensureRendered(post: Post): Promise<Post> {
  if (post.renderVersion >= RENDER_VERSION) return post;
  const r = await renderMarkdown(post.content);
  const patch = {
    html: r.html,
    toc: r.toc,
    summary: r.excerpt,
    wordCount: r.wordCount,
    readingTime: r.readingTime,
    renderVersion: RENDER_VERSION,
  };
  db.update(posts).set(patch).where(eq(posts.id, post.id)).run();
  return { ...post, ...patch };
}

export type PostDetail = Post & {
  category: (TaxonomyRef & { id: number }) | null;
  tags: TaxonomyRef[];
};

function withRelations(post: Post): PostDetail {
  const category = post.categoryId
    ? (db
        .select({ id: categories.id, name: categories.name, slug: categories.slug })
        .from(categories)
        .where(eq(categories.id, post.categoryId))
        .get() ?? null)
    : null;
  const postTagList = db
    .select({ name: tags.name, slug: tags.slug })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, post.id))
    .orderBy(asc(tags.name))
    .all();
  return { ...post, category, tags: postTagList };
}

export async function getPublishedPost(slug: string): Promise<PostDetail | null> {
  const post = db
    .select()
    .from(posts)
    .where(and(publishedPost(), eq(posts.slug, slug)))
    .get();
  if (!post) return null;
  return withRelations(await ensureRendered(post));
}

export async function getPublishedPage(slug: string): Promise<PostDetail | null> {
  const page = db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "page"), eq(posts.status, "published"), eq(posts.slug, slug)))
    .get();
  if (!page) return null;
  return withRelations(await ensureRendered(page));
}

export type AdjacentPost = { title: string; slug: string; cover: string | null };

export function getAdjacentPosts(post: Post): {
  prev: AdjacentPost | null;
  next: AdjacentPost | null;
} {
  if (!post.publishedAt) return { prev: null, next: null };
  const cols = { title: posts.title, slug: posts.slug, cover: posts.cover };
  const prev =
    db
      .select(cols)
      .from(posts)
      .where(and(publishedPost(), lt(posts.publishedAt, post.publishedAt)))
      .orderBy(desc(posts.publishedAt))
      .limit(1)
      .get() ?? null;
  const next =
    db
      .select(cols)
      .from(posts)
      .where(and(publishedPost(), gt(posts.publishedAt, post.publishedAt)))
      .orderBy(asc(posts.publishedAt))
      .limit(1)
      .get() ?? null;
  return { prev, next };
}

/** 相关文章：共享标签最多的几篇 */
export function getRelatedPosts(post: PostDetail, limit = 3): AdjacentPost[] {
  const tagIds = db
    .select({ id: postTags.tagId })
    .from(postTags)
    .where(eq(postTags.postId, post.id))
    .all()
    .map((t) => t.id);
  if (!tagIds.length) return [];
  return db
    .select({ title: posts.title, slug: posts.slug, cover: posts.cover })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(and(publishedPost(), inArray(postTags.tagId, tagIds), ne(posts.id, post.id)))
    .groupBy(posts.id)
    .orderBy(desc(sql`count(*)`), desc(posts.publishedAt))
    .limit(limit)
    .all();
}

export type ArchiveYear = {
  year: number;
  posts: { id: number; title: string; slug: string; publishedAt: Date }[];
};

export function getArchive(): { years: ArchiveYear[]; total: number } {
  const rows = db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(publishedPost())
    .orderBy(desc(posts.publishedAt))
    .all();
  const map = new Map<number, ArchiveYear>();
  for (const r of rows) {
    if (!r.publishedAt) continue;
    const year = yearOf(r.publishedAt);
    const entry = map.get(year) ?? { year, posts: [] };
    entry.posts.push({ ...r, publishedAt: r.publishedAt });
    map.set(year, entry);
  }
  return { years: [...map.values()], total: rows.length };
}

export type TaxonomyWithCount = TaxonomyRef & {
  id: number;
  count: number;
  description?: string | null;
};

export function getCategoriesWithCount(): TaxonomyWithCount[] {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      count: sql<number>`count(${posts.id})`,
    })
    .from(categories)
    .leftJoin(posts, and(eq(posts.categoryId, categories.id), publishedPost()))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
    .all();
}

export function getTagsWithCount(): TaxonomyWithCount[] {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`count(${posts.id})`,
    })
    .from(tags)
    .innerJoin(postTags, eq(postTags.tagId, tags.id))
    .innerJoin(posts, and(eq(posts.id, postTags.postId), publishedPost()))
    .groupBy(tags.id)
    .orderBy(desc(sql`count(${posts.id})`), asc(tags.name))
    .all();
}

export function getCategoryBySlug(slug: string) {
  return db.select().from(categories).where(eq(categories.slug, slug)).get() ?? null;
}

export function getTagBySlug(slug: string) {
  return db.select().from(tags).where(eq(tags.slug, slug)).get() ?? null;
}

export function getSiteStats() {
  const postCount = db.select({ n: count() }).from(posts).where(publishedPost()).get()?.n ?? 0;
  const words =
    db
      .select({ n: sql<number>`coalesce(sum(${posts.wordCount}), 0)` })
      .from(posts)
      .where(publishedPost())
      .get()?.n ?? 0;
  const categoryCount = db.select({ n: count() }).from(categories).get()?.n ?? 0;
  const tagCount = db.select({ n: count() }).from(tags).get()?.n ?? 0;
  return { postCount, words, categoryCount, tagCount };
}
