import "server-only";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { dayKey } from "@/lib/format";

import { isBot, visitorHash } from "./request";

const { dailyStats, visitors, pathStats, posts, postLikes } = schema;

let lastCleanup = "";

export function trackView(headers: Headers, pathname: string, postId?: number) {
  if (isBot(headers.get("user-agent"))) return;
  const date = dayKey();
  const hash = visitorHash(headers, date);
  const path = pathname.slice(0, 300);

  db.transaction((tx) => {
    const fresh =
      tx.insert(visitors).values({ date, hash }).onConflictDoNothing().run().changes > 0;
    tx.insert(dailyStats)
      .values({ date, pv: 1, uv: fresh ? 1 : 0 })
      .onConflictDoUpdate({
        target: dailyStats.date,
        set: {
          pv: sql`${dailyStats.pv} + 1`,
          uv: sql`${dailyStats.uv} + ${fresh ? 1 : 0}`,
        },
      })
      .run();
    tx.insert(pathStats)
      .values({ date, path, pv: 1 })
      .onConflictDoUpdate({
        target: [pathStats.date, pathStats.path],
        set: { pv: sql`${pathStats.pv} + 1` },
      })
      .run();
    if (postId) {
      tx.update(posts)
        .set({ views: sql`${posts.views} + 1` })
        .where(eq(posts.id, postId))
        .run();
    }
  });

  // 每天清理一次过期的去重记录
  if (lastCleanup !== date) {
    lastCleanup = date;
    const cutoff = dayKey(Date.now() - 2 * 86_400_000);
    db.delete(visitors).where(lt(visitors.date, cutoff)).run();
  }
}

export function getPostViews(postId: number): number {
  return db.select({ v: posts.views }).from(posts).where(eq(posts.id, postId)).get()?.v ?? 0;
}

/** 点赞：同一访客只计一次，返回最新点赞数 */
export function likePost(headers: Headers, postId: number): { likes: number; added: boolean } {
  const hash = visitorHash(headers, "like");
  const added = db.transaction((tx) => {
    const ok =
      tx.insert(postLikes).values({ postId, hash }).onConflictDoNothing().run().changes > 0;
    if (ok) {
      tx.update(posts)
        .set({ likes: sql`${posts.likes} + 1` })
        .where(eq(posts.id, postId))
        .run();
    }
    return ok;
  });
  const likes = db.select({ l: posts.likes }).from(posts).where(eq(posts.id, postId)).get()?.l ?? 0;
  return { likes, added };
}

export function hasLiked(headers: Headers, postId: number): boolean {
  const hash = visitorHash(headers, "like");
  return !!db
    .select({ p: postLikes.postId })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.hash, hash)))
    .get();
}

/** 仪表盘：最近 N 天的访问趋势 */
export function getTrend(days = 30) {
  const since = dayKey(Date.now() - (days - 1) * 86_400_000);
  const rows = db.select().from(dailyStats).where(gte(dailyStats.date, since)).all();
  const map = new Map(rows.map((r) => [r.date, r]));
  const out: { date: string; pv: number; uv: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(Date.now() - i * 86_400_000);
    const r = map.get(date);
    out.push({ date, pv: r?.pv ?? 0, uv: r?.uv ?? 0 });
  }
  return out;
}

export function getTopPaths(days = 30, limit = 8) {
  const since = dayKey(Date.now() - (days - 1) * 86_400_000);
  return db
    .select({ path: pathStats.path, pv: sql<number>`sum(${pathStats.pv})` })
    .from(pathStats)
    .where(gte(pathStats.date, since))
    .groupBy(pathStats.path)
    .orderBy(desc(sql`sum(${pathStats.pv})`))
    .limit(limit)
    .all();
}

export function getTotals() {
  const today = dayKey();
  const t = db.select().from(dailyStats).where(eq(dailyStats.date, today)).get();
  const all = db
    .select({
      pv: sql<number>`coalesce(sum(${dailyStats.pv}), 0)`,
      uv: sql<number>`coalesce(sum(${dailyStats.uv}), 0)`,
    })
    .from(dailyStats)
    .get();
  return { todayPv: t?.pv ?? 0, todayUv: t?.uv ?? 0, totalPv: all?.pv ?? 0, totalUv: all?.uv ?? 0 };
}
