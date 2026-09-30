import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { AdminPage } from "@/components/admin/admin-page";
import { SettingsForm } from "@/components/admin/settings-form";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { iconVersion } from "@/server/brand";
import { linkPreviewCount } from "@/server/link-preview";
import { mailConfigured } from "@/server/mail";
import { proxyEndpoint } from "@/server/outbound";

export const metadata: Metadata = { title: "设置" };

const mediaCount = (storage: "local" | "s3") =>
  db.select({ n: count() }).from(schema.media).where(eq(schema.media.storage, storage)).get()?.n ??
  0;

export default function AdminSettingsPage() {
  const s = getSettings();
  return (
    <AdminPage title="设置" description="站点信息、外观、评论、邮件通知、存储、链接卡片等。">
      <SettingsForm
        // 密钥类字段不下发到浏览器，留空保存表示不修改
        initial={{
          ...s,
          smtp: { ...s.smtp, pass: "" },
          storage: { ...s.storage, s3: { ...s.storage.s3, secretAccessKey: "" } },
          outbound: { ...s.outbound, proxy: "" },
        }}
        hasSmtpPass={!!s.smtp.pass}
        hasS3Secret={!!s.storage.s3.secretAccessKey}
        proxyEndpoint={proxyEndpoint(s.outbound.proxy)}
        linkPreviewCount={linkPreviewCount()}
        mailReady={mailConfigured()}
        envSiteUrl={process.env.SITE_URL ?? ""}
        iconUrl={`/site-icon?v=${iconVersion()}`}
        localCount={mediaCount("local")}
        s3Count={mediaCount("s3")}
      />
    </AdminPage>
  );
}
