import { count } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { MediaLibrary } from "@/components/admin/media-library";
import { db, schema } from "@/db";
import { listMedia } from "@/server/media";

export const metadata: Metadata = { title: "媒体库" };

const PAGE_SIZE = 40;

export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/media">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const items = listMedia({ page, pageSize: PAGE_SIZE });
  const total = db.select({ n: count() }).from(schema.media).get()?.n ?? 0;

  return (
    <AdminPage
      title="媒体库"
      description={`共 ${total} 个文件。上传的图片会自动转为 WebP 并生成缩略图。`}
    >
      <MediaLibrary
        items={items.map((m) => ({
          id: m.id,
          url: m.url,
          filename: m.filename,
          mime: m.mime,
          size: m.size,
          width: m.width,
          height: m.height,
          storage: m.storage,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        base="/admin/media"
      />
    </AdminPage>
  );
}
