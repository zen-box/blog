import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { iconVersion } from "@/server/brand";
import { pendingCount } from "@/server/comments";
import { pendingLinkCount } from "@/server/links";

export const metadata: Metadata = {
  title: { default: "后台", template: "%s · 后台" },
  robots: { index: false },
};

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  const cookieStore = await cookies();
  const s = getSettings();

  return (
    <AdminShell
      defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      siteTitle={s.siteTitle}
      iconUrl={s.favicon ? `/site-icon?v=${iconVersion()}` : null}
      user={{ name: session.user.name, email: session.user.email }}
      badges={{ comments: pendingCount(), links: pendingLinkCount() }}
    >
      {children}
    </AdminShell>
  );
}
