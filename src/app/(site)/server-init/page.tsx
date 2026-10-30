import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

import { ServerInitTool } from "@/components/site/server-init-tool";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { formatCount } from "@/lib/format";
import { absoluteUrl } from "@/lib/settings";
import { getScriptUsage } from "@/server/stats";

export const metadata: Metadata = {
  title: "服务器初始化脚本",
  description: "Linux 服务器初始化与安全加固脚本。",
  alternates: { canonical: "/server-init" },
};

export default function ServerInitPage() {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "server-init.sh"), "utf8");
  const usage = getScriptUsage();
  const command = `curl -fsSL ${absoluteUrl("/server-init.sh")} | sudo bash`;

  return (
    <PageView>
      <PageHeader
        eyebrow="Server Tool"
        title="Linux 服务器初始化"
        description="把常用的初始化与安全加固步骤集中在一个可查看、可复制的一键脚本里。"
      />
      <div className="container-page pb-20">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-2xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground">今日下载</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-foreground tabular-nums">
              {formatCount(usage.today)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-muted-foreground">累计下载</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-foreground tabular-nums">
              {formatCount(usage.total)}
            </p>
          </div>
        </div>
        <p className="mb-5 text-xs text-subtle">按脚本下载请求计数，不代表脚本已成功执行。</p>
        <ServerInitTool command={command} script={script} />
      </div>
    </PageView>
  );
}
