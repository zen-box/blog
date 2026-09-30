import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { MomentsManager } from "@/components/admin/moments-manager";
import { listMoments } from "@/server/moments";

export const metadata: Metadata = { title: "说说" };

export default async function AdminMomentsPage({ searchParams }: PageProps<"/admin/moments">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const result = listMoments({ page, pageSize: 15, includeHidden: true });

  return (
    <AdminPage title="说说" description="随手记录的碎片，支持 Markdown 和图片。">
      <MomentsManager
        items={result.items.map((m) => ({
          id: m.id,
          content: m.content,
          html: m.html,
          images: m.images.map((i) => i.url),
          location: m.location,
          visible: m.visible,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
      <AdminPagination page={result.page} pageCount={result.pageCount} base="/admin/moments" />
    </AdminPage>
  );
}
