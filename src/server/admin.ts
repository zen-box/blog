import "server-only";

import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";

import { db, schema } from "@/db";

import { tagNamesFor } from "./post-service";

const { posts, categories, comments, tags } = schema;

export type AdminPostRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  pinned: boolean;
  views: number;
  category: string | null;
  comments: number;
  publishedAt: Date | null;
  updatedAt: Date;
  /** 已发布但发布时间在将来 */
  scheduled: boolean;
};

export function listPostsAdmin(opts: {
  type: "post" | "page";
  status?: "all" | "published" | "draft";
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [eq(posts.type, opts.type)];
  if (opts.status && opts.status !== "all") conds.push(eq(posts.status, opts.status));
  const q = opts.q?.trim();
  if (q) {
    const p = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(or(like(posts.title, p), like(posts.slug, p))!);
  }
  const where = and(...conds);

  const rows = db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      status: posts.status,
      pinned: posts.pinned,
      views: posts.views,
      category: categories.name,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(where)
    .orderBy(desc(sql`coalesce(${posts.publishedAt}, ${posts.updatedAt})`), desc(posts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const ids = rows.map((r) => r.id);
  const commentCounts = ids.length
    ? db
        .select({ postId: comments.postId, n: count() })
        .from(comments)
        .where(and(inArray(comments.postId, ids), eq(comments.status, "approved")))
        .groupBy(comments.postId)
        .all()
    : [];
  const cmap = new Map(commentCounts.map((c) => [c.postId, c.n]));

  const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;
  const statusCounts = db
    .select({ status: posts.status, n: count() })
    .from(posts)
    .where(eq(posts.type, opts.type))
    .groupBy(posts.status)
    .all();
  const counts = { all: 0, published: 0, draft: 0 };
  for (const c of statusCounts) {
    counts[c.status] = c.n;
    counts.all += c.n;
  }

  return {
    items: rows.map((r) => ({
      ...r,
      comments: cmap.get(r.id) ?? 0,
      scheduled:
        r.status === "published" && !!r.publishedAt && r.publishedAt.getTime() > Date.now(),
    })) satisfies AdminPostRow[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

export type EditorPost = {
  id?: number;
  type: "post" | "page";
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover: string;
  status: "draft" | "published";
  publishedAt: string | null;
  categoryId: number | null;
  tags: string[];
  pinned: boolean;
  allowComments: boolean;
  seoDescription: string;
  updatedAt: string | null;
};

export function emptyEditorPost(type: "post" | "page"): EditorPost {
  return {
    type,
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    cover: "",
    status: "draft",
    publishedAt: null,
    categoryId: null,
    tags: [],
    pinned: false,
    allowComments: true,
    seoDescription: "",
    updatedAt: null,
  };
}

export function getEditorPost(id: number, type: "post" | "page"): EditorPost | null {
  const p = db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.type, type)))
    .get();
  if (!p) return null;
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    slug: p.slug,
    content: p.content,
    excerpt: p.excerpt ?? "",
    cover: p.cover ?? "",
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    categoryId: p.categoryId,
    tags: tagNamesFor(p.id),
    pinned: p.pinned,
    allowComments: p.allowComments,
    seoDescription: p.seoDescription ?? "",
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function editorOptions() {
  return {
    categories: db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all(),
    allTags: db
      .select({ name: tags.name })
      .from(tags)
      .orderBy(asc(tags.name))
      .all()
      .map((t) => t.name),
  };
}
