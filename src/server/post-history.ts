import "server-only";

import { and, desc, eq, notInArray } from "drizzle-orm";

import { db, schema, type DB } from "@/db";
import type { Post, PostSnapshot } from "@/db/schema";
import type { PostInput } from "./post-service";

export type SaveReason = "manual" | "auto" | "publish";
export type HistoryReason = SaveReason | "ai" | "restore";
type Store = Pick<DB, "select" | "insert" | "update" | "delete">;
const { posts, tags, postTags, postVersions } = schema;

/** 只保留可编辑字段；稳定字段顺序让无变化保存不生成历史。 */
export function normalizeSnapshot(input: PostInput, postId: number): PostSnapshot {
  return {
    id: postId,
    type: input.type ?? "post",
    title: input.title,
    slug: input.slug ?? "",
    content: input.content ?? "",
    excerpt: input.excerpt?.trim() || null,
    cover: input.cover?.trim() || null,
    status: input.status ?? "draft",
    publishedAt: input.publishedAt
      ? (input.publishedAt instanceof Date
          ? input.publishedAt
          : new Date(String(input.publishedAt))
        ).toISOString()
      : null,
    categoryId: input.categoryId ?? null,
    tags: [...new Set(input.tags ?? [])].sort(),
    pinned: input.pinned ?? false,
    allowComments: input.allowComments ?? true,
    seoDescription: input.seoDescription?.trim() || null,
  };
}

export function snapshotForPost(post: Post, store: Store = db): PostSnapshot {
  const names = store
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.id, postTags.tagId))
    .where(eq(postTags.postId, post.id))
    .all()
    .map((tag) => tag.name);
  return normalizeSnapshot({ ...post, tags: names }, post.id);
}

export function sameSnapshot(a: PostSnapshot, b: PostSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 必须与文章及其标签写入共享事务。auto 只合并最近连续的 auto，手动版本永不被合并。 */
export function recordPostVersion(
  store: Store,
  postId: number,
  snapshot: PostSnapshot,
  reason: HistoryReason,
  options: { merge?: boolean; force?: boolean } = {},
): number {
  const latest = store
    .select()
    .from(postVersions)
    .where(eq(postVersions.postId, postId))
    .orderBy(desc(postVersions.createdAt), desc(postVersions.id))
    .limit(1)
    .get();
  if (!options.force && latest && sameSnapshot(latest.snapshot, snapshot)) return latest.id;
  const now = new Date();
  let id: number;
  if (
    options.merge &&
    reason === "auto" &&
    latest?.reason === "auto" &&
    now.getTime() - latest.createdAt.getTime() < 5 * 60 * 1000
  ) {
    store
      .update(postVersions)
      .set({ snapshot, createdAt: now })
      .where(eq(postVersions.id, latest.id))
      .run();
    id = latest.id;
  } else {
    id = store
      .insert(postVersions)
      .values({ postId, snapshot, reason, createdAt: now })
      .returning({ id: postVersions.id })
      .get().id;
  }
  const keep = store
    .select({ id: postVersions.id })
    .from(postVersions)
    .where(eq(postVersions.postId, postId))
    .orderBy(desc(postVersions.createdAt), desc(postVersions.id))
    .limit(50)
    .all()
    .map((row) => row.id);
  store
    .delete(postVersions)
    .where(and(eq(postVersions.postId, postId), notInArray(postVersions.id, keep)))
    .run();
  return id;
}

export function createPostVersion(
  postId: number,
  input: PostInput,
  reason: "ai" | "restore",
): number {
  return db.transaction((tx) => {
    if (!tx.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get()) {
      throw new Error("文章不存在");
    }
    return recordPostVersion(tx, postId, normalizeSnapshot(input, postId), reason, { force: true });
  });
}

export function listPostVersions(postId: number) {
  return db
    .select()
    .from(postVersions)
    .where(eq(postVersions.postId, postId))
    .orderBy(desc(postVersions.createdAt), desc(postVersions.id))
    .limit(50)
    .all()
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      reason: row.reason,
      title: row.snapshot.title,
      content: row.snapshot.content,
      snapshot: row.snapshot,
    }));
}
