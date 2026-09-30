import { getSettings } from "@/lib/settings";
import { getBrand } from "@/server/brand";

import { HeaderShell } from "./header-shell";

export function SiteHeader() {
  return <HeaderShell brand={getBrand()} nav={getSettings().navItems} />;
}
