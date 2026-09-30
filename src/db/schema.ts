import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`)
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Better Auth                                                          */
/* ------------------------------------------------------------------ */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 两步验证：TOTP 密钥与备用码（均由 Better Auth 用站点密钥加密后存储） */
export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 开启时要先用动态码验证一次，验证前为 false */
    verified: integer("verified", { mode: "boolean" }).default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Blog                                                                 */
/* ------------------------------------------------------------------ */

export type TocItem = { id: string; text: string; depth: number };

export type ImageMeta = {
  width: number;
  height: number;
  /** base64 thumbhash, used to paint a blurred placeholder */
  thumbhash?: string | null;
};

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** post: 普通文章；page: 独立页面（关于等） */
    type: text("type", { enum: ["post", "page"] })
      .notNull()
      .default("post"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    /** 手写摘要 */
    excerpt: text("excerpt"),
    /** 自动摘要（正文前段或 <!-- more --> 之前的内容） */
    summary: text("summary"),
    /** Markdown 原文 */
    content: text("content").notNull().default(""),
    /** 预渲染好的 HTML，保存时生成 */
    html: text("html").notNull().default(""),
    toc: text("toc", { mode: "json" }).$type<TocItem[]>(),
    /** 渲染管线版本号，管线升级后据此重新渲染 */
    renderVersion: integer("render_version").notNull().default(0),
    cover: text("cover"),
    coverMeta: text("cover_meta", { mode: "json" }).$type<ImageMeta>(),
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    allowComments: integer("allow_comments", { mode: "boolean" }).notNull().default(true),
    seoDescription: text("seo_description"),
    wordCount: integer("word_count").notNull().default(0),
    readingTime: integer("reading_time").notNull().default(0),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("posts_type_slug_idx").on(t.type, t.slug),
    index("posts_listing_idx").on(t.type, t.status, t.publishedAt),
    index("posts_category_idx").on(t.categoryId),
  ],
);

export const postTags = sqliteTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index("post_tags_tag_idx").on(t.tagId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    /** 所属顶层评论，便于把整串回复一次取出 */
    rootId: integer("root_id"),
    author: text("author").notNull(),
    email: text("email"),
    url: text("url"),
    content: text("content").notNull(),
    html: text("html").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "spam", "trash"],
    })
      .notNull()
      .default("pending"),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    /** 有人回复时是否邮件通知 */
    notify: integer("notify", { mode: "boolean" }).notNull().default(true),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_post_idx").on(t.postId, t.status, t.createdAt),
    index("comments_status_idx").on(t.status, t.createdAt),
  ],
);

export const links = sqliteTable(
  "links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    avatar: text("avatar"),
    description: text("description"),
    /** 分组，例如「挚友」「技术」 */
    group: text("group").notNull().default("友链"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["approved", "pending", "rejected"] })
      .notNull()
      .default("approved"),
    /** 申请人邮箱（仅后台可见） */
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [index("links_status_idx").on(t.status, t.sortOrder)],
);

export type MomentImage = ImageMeta & { url: string };

export const moments = sqliteTable(
  "moments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    content: text("content").notNull().default(""),
    html: text("html").notNull().default(""),
    images: text("images", { mode: "json" })
      .$type<MomentImage[]>()
      .notNull()
      .default(sql`'[]'`),
    location: text("location"),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("moments_created_idx").on(t.createdAt)],
);

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 原始文件名 */
    filename: text("filename").notNull(),
    /** 逻辑路径，对外地址为 /uploads/<path>，例如 2026/09/abc.webp */
    path: text("path").notNull().unique(),
    /** 文件实际存放的位置 */
    storage: text("storage", { enum: ["local", "s3"] })
      .notNull()
      .default("local"),
    /** 存放在 S3 时的对象键（含前缀） */
    storageKey: text("storage_key"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    thumbhash: text("thumbhash"),
    alt: text("alt"),
    createdAt: createdAt(),
  },
  (t) => [index("media_created_idx").on(t.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* 访问统计                                                              */
/* ------------------------------------------------------------------ */

export const dailyStats = sqliteTable("daily_stats", {
  /** YYYY-MM-DD（站点时区） */
  date: text("date").primaryKey(),
  pv: integer("pv").notNull().default(0),
  uv: integer("uv").notNull().default(0),
});

/** 用于当天 UV 去重，只保存加盐哈希，不存原始 IP */
export const visitors = sqliteTable(
  "visitors",
  {
    date: text("date").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.hash] })],
);

export const pathStats = sqliteTable(
  "path_stats",
  {
    date: text("date").notNull(),
    path: text("path").notNull(),
    pv: integer("pv").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.date, t.path] }), index("path_stats_path_idx").on(t.path)],
);

/** 点赞去重：每位访客对每篇文章只计一次 */
export const postLikes = sqliteTable(
  "post_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.hash] })],
);

/** 链接卡片：外部网页的标题、简介和封面，后台抓取后缓存；图片文件在数据目录的 link-previews 下 */
export const linkPreviews = sqliteTable("link_previews", {
  url: text("url").primaryKey(),
  /** error 表示抓取失败，过一段时间后重试 */
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  title: text("title"),
  description: text("description"),
  siteName: text("site_name"),
  image: text("image"),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  thumbhash: text("thumbhash"),
  icon: text("icon"),
  error: text("error"),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export type Post = typeof posts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Moment = typeof moments.$inferSelect;
export type Media = typeof media.$inferSelect;
