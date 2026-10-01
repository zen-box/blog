import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { AiPage } from "@/components/admin/ai-page";
import { requireAdmin } from "@/lib/auth";
import { getAiUsage, publicAiConfig } from "@/server/ai-config";
import { getReaderAiConfig } from "@/server/reader-ai-config";

export const metadata: Metadata = { title: "AI 助手" };

export default async function AdminAiPage() {
  await requireAdmin();
  const { config, hasKey } = publicAiConfig();
  return (
    <AdminPage
      title="AI 助手"
      description="写作时调用的模型服务，以及读者看到的 AI 内容。API Key 只保存在服务器，不会发送到浏览器。"
    >
      <AiPage
        initial={config}
        initialHasKey={hasKey}
        initialReader={getReaderAiConfig()}
        usage={getAiUsage().days}
      />
    </AdminPage>
  );
}
