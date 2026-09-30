import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { Link } from "@/db/schema";
import { getSettings, siteUrl } from "@/lib/settings";

import { escapeHtml, mailTemplate, sendMail } from "./mail";

const { links } = schema;

export type LinkGroup = { name: string; items: Link[] };

export function getLinkGroups(): LinkGroup[] {
  const rows = db
    .select()
    .from(links)
    .where(eq(links.status, "approved"))
    .orderBy(asc(links.sortOrder), asc(links.id))
    .all();
  const groups = new Map<string, Link[]>();
  for (const row of rows) {
    const list = groups.get(row.group) ?? [];
    list.push(row);
    groups.set(row.group, list);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

const url = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.url("网址格式不正确"));

export const linkInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "请填写站点名称").max(40),
  url,
  avatar: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  description: z.string().trim().max(120).optional().nullable(),
  group: z.string().trim().max(20).optional().default("友链"),
  sortOrder: z.number().int().optional().default(0),
  status: z.enum(["approved", "pending", "rejected"]).optional().default("approved"),
  email: z.string().trim().max(120).optional().nullable(),
});

export type LinkInput = z.input<typeof linkInputSchema>;

export function saveLink(raw: LinkInput) {
  const input = linkInputSchema.parse(raw);
  const values = {
    name: input.name,
    url: input.url,
    avatar: input.avatar,
    description: input.description?.trim() || null,
    group: input.group || "友链",
    sortOrder: input.sortOrder,
    status: input.status,
    email: input.email?.trim() || null,
  };
  if (input.id) {
    return db.update(links).set(values).where(eq(links.id, input.id)).returning().get();
  }
  return db.insert(links).values(values).returning().get();
}

export function deleteLink(id: number) {
  db.delete(links).where(eq(links.id, id)).run();
}

export const applySchema = z.object({
  name: z.string().trim().min(1, "请填写站点名称").max(40, "站点名称太长了"),
  url,
  avatar: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.url("头像地址格式不正确").optional()),
  description: z.string().trim().min(1, "请填写一句话介绍").max(120, "介绍太长了"),
  email: z.email("邮箱格式不正确"),
});

/** 前台提交友链申请：进入待审核 */
export async function applyLink(raw: z.input<typeof applySchema>) {
  const input = applySchema.parse(raw);
  const host = new URL(input.url).host;
  const dup = db
    .select({ id: links.id, status: links.status, url: links.url })
    .from(links)
    .all()
    .find((l) => {
      try {
        return new URL(l.url).host === host;
      } catch {
        return false;
      }
    });
  if (dup) {
    throw new Error(
      dup.status === "approved" ? "这个站点已经在友链里啦" : "已经收到过这个站点的申请了",
    );
  }
  const row = db
    .insert(links)
    .values({
      name: input.name,
      url: input.url,
      avatar: input.avatar ?? null,
      description: input.description,
      email: input.email,
      status: "pending",
    })
    .returning()
    .get();

  const { smtp } = getSettings();
  if (smtp.notifyTo) {
    void sendMail(
      smtp.notifyTo,
      `新的友链申请：${input.name}`,
      mailTemplate({
        title: "收到一条友链申请",
        intro: `<b>${escapeHtml(input.name)}</b> 申请交换友链。`,
        body: `网址：${escapeHtml(input.url)}<br>介绍：${escapeHtml(input.description)}<br>邮箱：${escapeHtml(input.email)}`,
        link: `${siteUrl()}/admin/links`,
        linkText: "去后台处理",
      }),
    ).catch(() => {});
  }
  return row;
}

export function pendingLinkCount(): number {
  return db
    .select({ id: links.id })
    .from(links)
    .where(and(eq(links.status, "pending")))
    .all().length;
}
