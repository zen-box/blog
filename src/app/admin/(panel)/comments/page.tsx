import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { CommentsManager } from "@/components/admin/comments-manager";
import { listCommentsAdmin, pendingCount } from "@/server/comments";

export const metadata: Metadata = { title: "评论" };

const STATUSES = ["pending", "approved", "spam", "trash", "all"] as const;
type Status = (typeof STATUSES)[number];

export default async function AdminCommentsPage({ searchParams }: PageProps<"/admin/comments">) {
  const sp = await searchParams;
  const status: Status =
    STATUSES.find((s) => s === sp.status) ?? (pendingCount() > 0 ? "pending" : "all");
  const page = Math.max(1, Number(sp.page) || 1);
  const result = listCommentsAdmin({ status, page });

  return (
    <AdminPage title="评论" description="审核、回复和管理读者的留言。">
      <CommentsManager
        status={status}
        counts={result.counts}
        items={result.items.map(
          ({ comment: c, postTitle, postSlug, postType, avatar, avatarFallback }) => ({
            id: c.id,
            author: c.author,
            email: c.email,
            url: c.url,
            ip: c.ip,
            html: c.html,
            status: c.status,
            isAdmin: c.isAdmin,
            createdAt: c.createdAt.toISOString(),
            avatar,
            avatarFallback,
            postTitle,
            postUrl: postType === "page" ? `/${postSlug}` : `/posts/${postSlug}`,
          }),
        )}
      />
      <AdminPagination
        page={result.page}
        pageCount={result.pageCount}
        base="/admin/comments"
        params={{ status }}
      />
    </AdminPage>
  );
}
