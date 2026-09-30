import "server-only";

import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { MomentImage } from "@/db/schema";
import { renderMarkdown } from "@/lib/markdown";

import { findMediaByUrl } from "./media";

const { moments } = schema;

export function listMoments(opts: { page?: number; pageSize?: number; includeHidden?: boolean }) {
  const pageSize = opts.pageSize ?? 10;
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.includeHidden ? undefined : eq(moments.visible, true);
  const items = db
    .select()
    .from(moments)
    .where(where)
    .orderBy(desc(moments.createdAt), desc(moments.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  const total = db.select({ n: count() }).from(moments).where(where).get()?.n ?? 0;
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export const momentInputSchema = z.object({
  id: z.number().int().positive().optional(),
  content: z.string().max(5000).default(""),
  images: z.array(z.string().trim().min(1).max(1000)).max(9).default([]),
  location: z.string().trim().max(60).optional().nullable(),
  visible: z.boolean().default(true),
  createdAt: z.coerce.date().optional().nullable(),
});

export type MomentInput = z.input<typeof momentInputSchema>;

export async function saveMoment(raw: MomentInput) {
  const input = momentInputSchema.parse(raw);
  if (!input.content.trim() && !input.images.length) throw new Error("说点什么吧");

  const images: MomentImage[] = input.images.map((url) => {
    const m = findMediaByUrl(url);
    return {
      url,
      width: m?.width ?? 0,
      height: m?.height ?? 0,
      thumbhash: m?.thumbhash ?? null,
    };
  });
  const { html } = await renderMarkdown(input.content);
  const values = {
    content: input.content,
    html,
    images,
    location: input.location?.trim() || null,
    visible: input.visible,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
  if (input.id) {
    return db
      .update(moments)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(moments.id, input.id))
      .returning()
      .get();
  }
  return db.insert(moments).values(values).returning().get();
}

export function deleteMoment(id: number) {
  db.delete(moments).where(eq(moments.id, id)).run();
}
