"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";

import { MARKDOWN_GUIDE } from "@/content/markdown-guide";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import {
  getSettings,
  saveSettings,
  siteSettingsSchema,
  siteUrl,
  type SiteSettings,
} from "@/lib/settings";
import { normalizeSlug, slugify } from "@/lib/slug";
import { createComment, deleteComment, setCommentStatus } from "@/server/comments";
import { clearLinkPreviews } from "@/server/link-preview";
import { deleteLink, saveLink, type LinkInput } from "@/server/links";
import { listDevices, revokeDevices } from "@/server/security";
import { mailConfigured, mailTemplate, sendMail } from "@/server/mail";
import { deleteMedia, listMedia, localMediaCount, migrateBatchToS3 } from "@/server/media";
import { deleteMoment, saveMoment, type MomentInput } from "@/server/moments";
import { type OutboundConfig, parseProxy, testOutbound } from "@/server/outbound";
import { testS3Connection, type S3Config } from "@/server/storage";
import {
  deletePost,
  pruneUnusedTags,
  rerenderAll,
  savePost,
  type PostInput,
} from "@/server/post-service";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "内容格式不正确";
  const message = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed/.test(message)) return "名称或别名已被占用";
  return message || "操作失败";
}

/** 所有后台操作的统一入口：先校验管理员，再执行，最后刷新页面数据 */
async function run<T>(fn: () => Promise<T> | T, revalidate = true): Promise<ActionResult<T>> {
  await requireAdmin();
  try {
    const data = await fn();
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/* ------------------------------- 初始化 ------------------------------- */

/** 首次创建管理员后：设置博主昵称，并放入一篇语法指南草稿供参考 */
export async function completeSetup(name: string) {
  return run(async () => {
    const trimmed = name.trim().slice(0, 40);
    if (trimmed) saveSettings({ authorName: trimmed });
    const exists = db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.type, "post"))
      .limit(1)
      .get();
    if (!exists) {
      await savePost({
        title: "Markdown 语法指南",
        slug: "markdown-guide",
        content: MARKDOWN_GUIDE,
        status: "draft",
        tags: ["Markdown"],
      });
    }
    return null;
  });
}

/* ------------------------------- 文章 ------------------------------- */

/** 编辑器保存：不刷新当前页面，避免打断正在编辑的内容（前台页面都是实时渲染的） */
export async function savePostAction(
  input: PostInput,
  reason: "manual" | "auto" | "publish" = "manual",
) {
  return run(async () => {
    const post = await savePost(input, reason);
    return {
      id: post.id,
      slug: post.slug,
      status: post.status,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      updatedAt: post.updatedAt.toISOString(),
    };
  }, false);
}

export async function deletePostAction(id: number) {
  return run(() => deletePost(id));
}

/* ---------------------------- 分类与标签 ---------------------------- */

const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "请填写分类名称").max(30),
  slug: z.string().trim().max(60).optional().default(""),
  description: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export async function saveCategoryAction(raw: z.input<typeof categorySchema>) {
  return run(() => {
    const input = categorySchema.parse(raw);
    const slug = normalizeSlug(input.slug || slugify(input.name)) || `c-${Date.now().toString(36)}`;
    const values = {
      name: input.name,
      slug,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder,
    };
    const clash = db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.slug, slug),
          input.id ? ne(schema.categories.id, input.id) : undefined,
        ),
      )
      .get();
    if (clash) throw new Error("这个别名已被其他分类使用");
    if (input.id) {
      db.update(schema.categories).set(values).where(eq(schema.categories.id, input.id)).run();
    } else {
      db.insert(schema.categories).values(values).run();
    }
    return null;
  });
}

export async function deleteCategoryAction(id: number) {
  return run(() => {
    db.delete(schema.categories).where(eq(schema.categories.id, id)).run();
    return null;
  });
}

export async function saveTagAction(id: number, name: string, slug: string) {
  return run(() => {
    const n = name.trim();
    if (!n) throw new Error("请填写标签名称");
    const s = normalizeSlug(slug || slugify(n)) || `t-${Date.now().toString(36)}`;
    db.update(schema.tags).set({ name: n, slug: s }).where(eq(schema.tags.id, id)).run();
    return null;
  });
}

export async function deleteTagAction(id: number) {
  return run(() => {
    db.delete(schema.tags).where(eq(schema.tags.id, id)).run();
    pruneUnusedTags();
    return null;
  });
}

/* ------------------------------- 评论 ------------------------------- */

export async function setCommentStatusAction(
  ids: number[],
  status: "pending" | "approved" | "spam" | "trash",
) {
  return run(async () => {
    for (const id of ids) await setCommentStatus(id, status);
    return null;
  });
}

export async function deleteCommentAction(ids: number[]) {
  return run(() => {
    for (const id of ids) deleteComment(id);
    return null;
  });
}

export async function replyCommentAction(parentId: number, content: string) {
  return run(async () => {
    const parent = db.select().from(schema.comments).where(eq(schema.comments.id, parentId)).get();
    if (!parent) throw new Error("评论不存在");
    // 回复即视为认可原评论
    if (parent.status !== "approved") await setCommentStatus(parent.id, "approved");
    const s = getSettings();
    await createComment(
      {
        postId: parent.postId,
        parentId: parent.id,
        author: s.authorName,
        email: s.social.email || undefined,
        content,
        notify: false,
      },
      { ip: "", userAgent: "admin", isAdmin: true },
    );
    return null;
  });
}

/* ------------------------------- 说说 ------------------------------- */

export async function saveMomentAction(input: MomentInput) {
  return run(async () => {
    const m = await saveMoment(input);
    return { id: m.id };
  });
}

export async function deleteMomentAction(id: number) {
  return run(() => deleteMoment(id));
}

/* ------------------------------- 友链 ------------------------------- */

export async function saveLinkAction(input: LinkInput) {
  return run(() => {
    saveLink(input);
    return null;
  });
}

export async function deleteLinkAction(id: number) {
  return run(() => deleteLink(id));
}

export async function setLinkStatusAction(id: number, status: "approved" | "pending" | "rejected") {
  return run(() => {
    db.update(schema.links).set({ status }).where(eq(schema.links.id, id)).run();
    return null;
  });
}

/* ------------------------------- 媒体 ------------------------------- */

export async function deleteMediaAction(id: number) {
  return run(() => deleteMedia(id));
}

export async function listMediaAction(page: number, imagesOnly = false) {
  return run(() => {
    const pageSize = 30;
    const items = listMedia({ page, pageSize });
    return {
      hasMore: items.length === pageSize,
      items: (imagesOnly ? items.filter((m) => m.mime.startsWith("image/")) : items).map((m) => ({
        id: m.id,
        url: m.url,
        filename: m.filename,
        mime: m.mime,
        width: m.width,
        height: m.height,
      })),
    };
  }, false);
}

/* ------------------------------- 设置 ------------------------------- */

/** 影响图片直链的存储配置；变化后需要重新渲染文章（HTML 中写入了直链） */
const storageAddress = (s: SiteSettings) => {
  const { endpoint, bucket, prefix, publicUrl } = s.storage.s3;
  return JSON.stringify([endpoint, bucket, prefix, publicUrl]);
};

export async function saveSettingsAction(patch: Partial<SiteSettings>) {
  return run(async () => {
    const current = getSettings();
    // 先合并再整体校验：对 partial() 校验会给缺失字段填上默认值，覆盖已有设置
    const merged = siteSettingsSchema.parse({ ...current, ...patch });
    // 密码类字段留空表示不修改
    if (patch.smtp && !patch.smtp.pass) merged.smtp.pass = current.smtp.pass;
    if (patch.storage?.s3 && !patch.storage.s3.secretAccessKey) {
      merged.storage.s3.secretAccessKey = current.storage.s3.secretAccessKey;
    }
    // 代理地址可能带用户名密码，和密钥一样留空表示不修改
    if (patch.outbound && !patch.outbound.proxy.trim()) {
      merged.outbound.proxy = current.outbound.proxy;
    } else {
      merged.outbound.proxy = merged.outbound.proxy.trim();
    }
    if (merged.outbound.mode === "proxy") {
      if (!merged.outbound.proxy) throw new Error("请填写代理地址");
      parseProxy(merged.outbound.proxy);
    }
    saveSettings(merged);
    if (storageAddress(current) !== storageAddress(merged)) await rerenderAll();
    return null;
  });
}

/** 用表单中（可能尚未保存）的配置测试连接 */
export async function testStorageAction(input: S3Config) {
  return run(() => {
    const saved = getSettings().storage.s3;
    return testS3Connection({
      ...input,
      secretAccessKey: input.secretAccessKey || saved.secretAccessKey,
    });
  }, false);
}

/** 用表单中的出口设置访问测试地址，返回目标网站看到的 IP；代理地址留空时用已保存的 */
export async function testOutboundAction(input: OutboundConfig) {
  return run(async () => {
    const proxy = input.proxy.trim() || getSettings().outbound.proxy;
    if (input.mode === "proxy") parseProxy(proxy);
    return testOutbound({ mode: input.mode, proxy });
  }, false);
}

export async function clearLinkPreviewsAction() {
  return run(() => clearLinkPreviews());
}

/** 分批把本地文件迁移到 S3；全部完成后重新渲染文章 */
export async function migrateToS3Action(afterId: number, removeLocal: boolean) {
  return run(async () => {
    const result = await migrateBatchToS3({ afterId, limit: 8, removeLocal });
    if (result.done) await rerenderAll();
    return { ...result, remaining: localMediaCount() };
  }, false);
}

export async function testMailAction(to: string) {
  return run(async () => {
    const address = z.email("请填写正确的邮箱").parse(to.trim());
    if (!mailConfigured()) throw new Error("请先填写并保存 SMTP 配置");
    await sendMail(
      address,
      "测试邮件",
      mailTemplate({
        title: "邮件配置成功",
        intro: "收到这封邮件，说明博客的邮件通知已经可以正常工作了。",
        body: "评论提醒、回复通知和友链申请都会通过这个邮箱发送。",
        link: `${siteUrl()}/`,
        linkText: "打开博客",
      }),
    );
    return null;
  }, false);
}

export async function rerenderAllAction() {
  return run(() => rerenderAll());
}

/* ------------------------------- 登录设备 ------------------------------- */

/** 退出其他设备（当前设备请用「退出登录」）；返回退出的数量 */
export async function revokeDevicesAction(ids: string[] | "others") {
  const { session } = await requireAdmin();
  return run(() => {
    const { userId, id: current } = session;
    const targets =
      ids === "others"
        ? listDevices(userId, current).map((d) => d.id)
        : z.array(z.string()).max(100).parse(ids);
    return revokeDevices(
      userId,
      targets.filter((id) => id !== current),
    );
  }, false);
}
