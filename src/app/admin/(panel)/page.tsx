import { desc, eq, count as sqlCount } from "drizzle-orm";
import {
  EyeIcon,
  FileTextIcon,
  MessageCircleIcon,
  PenLineIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage, Panel } from "@/components/admin/admin-page";
import { CountUp } from "@/components/admin/count-up";
import { TrafficChart } from "@/components/admin/traffic-chart";
import { db, schema } from "@/db";
import { formatCount, formatRelative } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { listCommentsAdmin } from "@/server/comments";
import { getSiteStats } from "@/server/posts";
import { getTopPaths, getTotals, getTrend } from "@/server/stats";

export const metadata: Metadata = { title: "仪表盘" };

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Shanghai",
    }).format(new Date()),
  );
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 transition-shadow duration-500 hover:shadow-soft">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <Icon className="size-4 text-subtle" />
      </div>
      <CountUp
        value={value}
        className="mt-3 block font-serif text-3xl font-semibold text-foreground tabular-nums"
      />
      {note && <p className="mt-1.5 text-xs text-subtle">{note}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const s = getSettings();
  const stats = getSiteStats();
  const totals = getTotals();
  const trend = getTrend(30);
  const top = getTopPaths(30, 6);
  const comments = listCommentsAdmin({ status: "all", pageSize: 5 });
  const drafts =
    db.select({ n: sqlCount() }).from(schema.posts).where(eq(schema.posts.status, "draft")).get()
      ?.n ?? 0;
  const recent = db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      status: schema.posts.status,
      type: schema.posts.type,
      updatedAt: schema.posts.updatedAt,
    })
    .from(schema.posts)
    .orderBy(desc(schema.posts.updatedAt))
    .limit(6)
    .all();
  const monthPv = trend.reduce((n, d) => n + d.pv, 0);

  return (
    <AdminPage
      title={`${greeting()}，${s.authorName}`}
      description="这里是博客的概况。"
      actions={
        <Link
          href="/admin/posts/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90"
        >
          <PenLineIcon className="size-4" />
          写文章
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={FileTextIcon}
          label="文章"
          value={stats.postCount}
          note={`${formatCount(stats.words)} 字 · ${drafts} 篇草稿`}
        />
        <Stat
          icon={MessageCircleIcon}
          label="评论"
          value={comments.counts.approved ?? 0}
          note={`${comments.counts.pending ?? 0} 条待审核`}
        />
        <Stat
          icon={EyeIcon}
          label="今日浏览"
          value={totals.todayPv}
          note={`${totals.todayUv} 位访客`}
        />
        <Stat
          icon={TrendingUpIcon}
          label="累计浏览"
          value={totals.totalPv}
          note={`近 30 天 ${formatCount(monthPv)}`}
        />
      </div>

      <Panel
        title="近 30 天访问"
        className="mt-4"
        action={<UsersIcon className="size-4 text-subtle" />}
      >
        <div className="px-3 pt-4 pb-2">
          <TrafficChart data={trend} />
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="最新评论"
          action={
            <Link href="/admin/comments" className="text-xs text-muted-foreground hover:text-brand">
              全部
            </Link>
          }
        >
          {comments.items.length ? (
            <ul className="divide-y divide-border/70">
              {comments.items.map(({ comment: c, postTitle, avatar }) => (
                <li key={c.id} className="flex gap-3 px-5 py-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatar} alt="" className="size-8 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">{c.author}</span>
                      {c.status === "pending" && (
                        <span className="rounded-full bg-amber-500/12 px-1.5 text-[0.68rem] text-amber-700 dark:text-amber-400">
                          待审核
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-subtle">
                        {formatRelative(c.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{c.content}</p>
                    <p className="mt-0.5 truncate text-xs text-subtle">于《{postTitle}》</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">还没有评论</p>
          )}
        </Panel>

        <div className="grid gap-4">
          <Panel title="最近编辑">
            <ul className="divide-y divide-border/70">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/${p.type === "page" ? "pages" : "posts"}/${p.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{p.title}</span>
                    {p.status === "draft" && <span className="text-xs text-subtle">草稿</span>}
                    <span className="shrink-0 text-xs text-subtle">
                      {formatRelative(p.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="热门页面（30 天）">
            {top.length ? (
              <ul className="space-y-2.5 px-5 py-4">
                {top.map((t) => {
                  const pct = Math.max(4, Math.round((t.pv / (top[0]?.pv || 1)) * 100));
                  return (
                    <li key={t.path} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {safeDecode(t.path)}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">
                          {t.pv}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">暂无访问数据</p>
            )}
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}
