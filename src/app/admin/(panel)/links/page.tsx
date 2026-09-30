import { asc } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { LinksManager } from "@/components/admin/links-manager";
import { db, schema } from "@/db";

export const metadata: Metadata = { title: "友链" };

export default function AdminLinksPage() {
  const rows = db
    .select()
    .from(schema.links)
    .orderBy(asc(schema.links.sortOrder), asc(schema.links.id))
    .all();
  return (
    <AdminPage title="友链" description="管理友情链接和收到的申请。">
      <LinksManager
        links={rows.map((l) => ({
          id: l.id,
          name: l.name,
          url: l.url,
          avatar: l.avatar,
          description: l.description,
          group: l.group,
          sortOrder: l.sortOrder,
          status: l.status,
          email: l.email,
        }))}
      />
    </AdminPage>
  );
}
