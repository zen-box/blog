import "server-only";

import crypto from "node:crypto";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { renderComment } from "@/lib/markdown";
import { getSettings, siteUrl } from "@/lib/settings";

import { escapeHtml, mailTemplate, sendMail } from "./mail";
import { resolveUploadUrl } from "./storage";

const { comments, posts } = schema;

export type PublicComment = {
  id: number;
  parentId: number | null;
  rootId: number | null;
  author: string;
  url: string | null;
  avatar: string;
  html: string;
  isAdmin: boolean;
  createdAt: string;
  replyTo: string | null;
  replies?: PublicComment[];
};

export function avatarUrl(email: string | null | undefined, size = 96): string {
  const { comments: c, authorAvatar } = getSettings();
  const mirror = c.avatarMirror.replace(/\/?$/, "/");
  const hash = crypto
    .createHash("md5")
    .update((email ?? "").trim().toLowerCase())
    .digest("hex");
  if (!email && authorAvatar) return resolveUploadUrl(authorAvatar);
  return `${mirror}${hash}?d=mp&s=${size}`;
}

type Row = typeof comments.$inferSelect;

function toPublic(row: Row, byId: Map<number, Row>): PublicComment {
  const s = getSettings();
  const parent = row.parentId ? byId.get(row.parentId) : undefined;
  return {
    id: row.id,
    parentId: row.parentId,
    rootId: row.rootId,
    author: row.author,
    url: row.url,
    avatar: row.isAdmin && s.authorAvatar ? resolveUploadUrl(s.authorAvatar) : avatarUrl(row.email),
    html: row.html,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt.toISOString(),
    replyTo: parent && parent.id !== row.rootId ? parent.author : null,
  };
}

/** 已通过的评论：顶层评论按时间倒序，回复按时间正序挂在顶层评论下 */
export function getCommentTree(postId: number): { items: PublicComment[]; total: number } {
  const rows = db
    .select()
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.status, "approved")))
    .orderBy(asc(comments.createdAt))
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roots: PublicComment[] = [];
  const replies = new Map<number, PublicComment[]>();
  for (const row of rows) {
    const c = toPublic(row, byId);
    if (!row.rootId || !byId.has(row.rootId)) roots.push(c);
    else {
      const list = replies.get(row.rootId) ?? [];
      list.push(c);
      replies.set(row.rootId, list);
    }
  }
  for (const root of roots) root.replies = replies.get(root.id) ?? [];
  roots.reverse();
  return { items: roots, total: rows.length };
}

export function countApproved(postId: number): number {
  return (
    db
      .select({ n: count() })
      .from(comments)
      .where(and(eq(comments.postId, postId), eq(comments.status, "approved")))
      .get()?.n ?? 0
  );
}

export const commentInputSchema = z.object({
  postId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
  author: z.string().trim().min(1, "请填写昵称").max(40, "昵称太长了"),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.email("邮箱格式不正确").optional()),
  url: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
    .pipe(z.url("网址格式不正确").optional()),
  content: z.string().trim().min(2, "评论内容太短了").max(5000, "评论内容太长了"),
  notify: z.boolean().optional().default(true),
});

export type CommentInput = z.input<typeof commentInputSchema>;

export async function createComment(
  raw: CommentInput,
  meta: { ip: string; userAgent: string; isAdmin: boolean },
): Promise<{ comment: PublicComment; status: Row["status"] }> {
  const input = commentInputSchema.parse(raw);
  const s = getSettings();

  const post = db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      type: posts.type,
      allowComments: posts.allowComments,
      status: posts.status,
    })
    .from(posts)
    .where(eq(posts.id, input.postId))
    .get();
  if (!post || post.status !== "published") throw new Error("文章不存在");
  if (!s.comments.enabled || !post.allowComments) throw new Error("评论已关闭");

  let rootId: number | null = null;
  let parent: Row | undefined;
  if (input.parentId) {
    parent = db.select().from(comments).where(eq(comments.id, input.parentId)).get();
    if (!parent || parent.postId !== post.id || parent.status !== "approved") {
      throw new Error("回复的评论不存在");
    }
    rootId = parent.rootId ?? parent.id;
  }

  // 审核策略
  let status: Row["status"] = "approved";
  if (!meta.isAdmin) {
    const blocked = s.comments.blockedWords
      .split(/[\n,，]/)
      .map((w) => w.trim())
      .filter(Boolean);
    const text =
      `${input.author} ${input.email ?? ""} ${input.url ?? ""} ${input.content}`.toLowerCase();
    if (blocked.some((w) => text.includes(w.toLowerCase()))) {
      status = "spam";
    } else if (s.comments.moderation === "all") {
      status = "pending";
    } else if (s.comments.moderation === "first") {
      const trusted = input.email
        ? db
            .select({ id: comments.id })
            .from(comments)
            .where(and(eq(comments.email, input.email), eq(comments.status, "approved")))
            .get()
        : undefined;
      status = trusted ? "approved" : "pending";
    }
  }

  const html = await renderComment(input.content);
  const row = db
    .insert(comments)
    .values({
      postId: post.id,
      parentId: input.parentId ?? null,
      rootId,
      author: meta.isAdmin ? s.authorName : input.author,
      email: input.email ?? null,
      url: input.url ?? null,
      content: input.content,
      html,
      status,
      isAdmin: meta.isAdmin,
      notify: input.notify,
      ip: meta.ip,
      userAgent: meta.userAgent.slice(0, 300),
    })
    .returning()
    .get();

  const byId = new Map<number, Row>([[row.id, row]]);
  if (parent) byId.set(parent.id, parent);
  const comment = toPublic(row, byId);

  const link = `${siteUrl()}${post.type === "page" ? "" : "/posts"}/${post.slug}#comment-${row.id}`;
  void notifyNewComment(row, post.title, link).catch(() => {});
  if (status === "approved" && parent)
    void notifyReply(row, parent, post.title, link).catch(() => {});

  return { comment, status };
}

async function notifyNewComment(row: Row, title: string, link: string) {
  const { smtp } = getSettings();
  if (row.isAdmin || !smtp.notifyTo) return;
  const statusText =
    row.status === "approved" ? "" : row.status === "pending" ? "（待审核）" : "（疑似垃圾）";
  await sendMail(
    smtp.notifyTo,
    `「${title}」有新评论${statusText}`,
    mailTemplate({
      title: `${row.author} 评论了你的文章`,
      intro: `文章：<b>${escapeHtml(title)}</b> ${statusText}`,
      body: row.html,
      link,
      linkText: "查看评论",
    }),
  );
}

/** 评论通过审核或直接发布后，通知被回复的人 */
export async function notifyReply(row: Row, parent: Row, title: string, link: string) {
  if (!parent.email || !parent.notify || parent.email === row.email) return;
  await sendMail(
    parent.email,
    `你在「${title}」的评论有了新回复`,
    mailTemplate({
      title: `${row.author} 回复了你`,
      intro: `你好 ${escapeHtml(parent.author)}，你在「${escapeHtml(title)}」下的评论收到了回复：`,
      quote: parent.html,
      body: row.html,
      link,
      linkText: "查看回复",
    }),
  );
}

/* ---------------------------- 后台管理 ---------------------------- */

export function listCommentsAdmin(opts: {
  status?: Row["status"] | "all";
  page?: number;
  pageSize?: number;
}) {
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.status && opts.status !== "all" ? eq(comments.status, opts.status) : undefined;
  const items = db
    .select({
      comment: comments,
      postTitle: posts.title,
      postSlug: posts.slug,
      postType: posts.type,
    })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total = db.select({ n: count() }).from(comments).where(where).get()?.n ?? 0;
  const counts = db
    .select({ status: comments.status, n: count() })
    .from(comments)
    .groupBy(comments.status)
    .all();
  return {
    items: items.map((i) => ({ ...i, avatar: avatarUrl(i.comment.email, 64) })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<
      Record<Row["status"], number>
    >,
  };
}

export async function setCommentStatus(id: number, status: Row["status"]) {
  const row = db.select().from(comments).where(eq(comments.id, id)).get();
  if (!row) return;
  db.update(comments).set({ status }).where(eq(comments.id, id)).run();
  // 审核通过时补发回复通知
  if (row.status !== "approved" && status === "approved" && row.parentId) {
    const parent = db.select().from(comments).where(eq(comments.id, row.parentId)).get();
    const post = db
      .select({ title: posts.title, slug: posts.slug, type: posts.type })
      .from(posts)
      .where(eq(posts.id, row.postId))
      .get();
    if (parent && post) {
      const link = `${siteUrl()}${post.type === "page" ? "" : "/posts"}/${post.slug}#comment-${row.id}`;
      void notifyReply({ ...row, status }, parent, post.title, link).catch(() => {});
    }
  }
}

export function deleteComment(id: number) {
  // 删除评论时一并删除它下面的回复
  db.delete(comments)
    .where(
      sql`${comments.id} = ${id} OR ${comments.parentId} = ${id} OR ${comments.rootId} = ${id}`,
    )
    .run();
}

export function pendingCount(): number {
  return (
    db.select({ n: count() }).from(comments).where(eq(comments.status, "pending")).get()?.n ?? 0
  );
}
