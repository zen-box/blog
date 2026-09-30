import { PenLineIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/admin/admin-page";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ContentList } from "@/components/admin/content-list";
import { listPostsAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "文章" };

const STATUSES = ["all", "published", "draft"] as const;

export default async function AdminPostsPage({ searchParams }: PageProps<"/admin/posts">) {
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const result = listPostsAdmin({ type: "post", status, q, page });

  return (
    <AdminPage
      title="文章"
      description={`共 ${result.counts.all} 篇，已发布 ${result.counts.published} 篇`}
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
      <ContentList type="post" rows={result.items} counts={result.counts} status={status} q={q} />
      <AdminPagination
        page={result.page}
        pageCount={result.pageCount}
        params={{ status: status === "all" ? undefined : status, q: q || undefined }}
        base="/admin/posts"
      />
    </AdminPage>
  );
}
