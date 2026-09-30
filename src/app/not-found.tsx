import type { Metadata } from "next";

import { NotFoundView } from "@/components/site/not-found-view";
import { SiteChrome } from "@/components/site/site-chrome";

export const metadata: Metadata = { title: "页面不存在" };

export default function RootNotFound() {
  return (
    <SiteChrome>
      <NotFoundView />
    </SiteChrome>
  );
}
