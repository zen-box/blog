import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { JobsManager } from "@/components/admin/jobs-manager";
export const metadata: Metadata = { title: "后台任务" };
export default function AdminJobsPage() {
  return (
    <AdminPage
      title="后台任务"
      description="查看摘要生成进度、失败原因与重试结果。任务会持久保存，服务重启后继续处理。"
    >
      <JobsManager />
    </AdminPage>
  );
}
