import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/admin/admin-page";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ContentList } from "@/components/admin/content-list";
import { listPostsAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "页面" };

const STATUSES = ["all", "published", "draft"] as const;

export default async function AdminPagesPage({ searchParams }: PageProps<"/admin/pages">) {
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? "all";
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const result = listPostsAdmin({ type: "page", status, q, page });

  return (
    <AdminPage
      title="页面"
      description="独立页面，例如「关于」，地址为 /别名。"
      actions={
        <Link
          href="/admin/pages/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" />
          新建页面
        </Link>
      }
    >
      <ContentList type="page" rows={result.items} counts={result.counts} status={status} q={q} />
      <AdminPagination
        page={result.page}
        pageCount={result.pageCount}
        params={{ status: status === "all" ? undefined : status, q: q || undefined }}
        base="/admin/pages"
      />
    </AdminPage>
  );
}
