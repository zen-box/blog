import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { SeriesManager } from "@/components/admin/series-manager";
import { listSeriesAdmin, listSeriesCandidates } from "@/server/series";

export const metadata: Metadata = { title: "系列" };

export default function AdminSeriesPage() {
  return (
    <AdminPage
      title="系列"
      description="把几篇文章串成一个系列，读者在文章里能看到目录和自己的阅读进度。"
    >
      <SeriesManager initial={listSeriesAdmin()} candidates={listSeriesCandidates()} />
    </AdminPage>
  );
}
