import Link from "next/link";

import { daysSince, yearOf } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/server/brand";

import { BrandMark } from "./brand-mark";
import { SocialLinks } from "./social-links";

export function SiteFooter() {
  const s = getSettings();
  const brand = getBrand();
  const year = yearOf(new Date());
  const uptime = daysSince(s.siteStartDate);
  const startYear = uptime?.year ?? null;
  const days = uptime?.days ?? null;

  return (
    <footer className="relative mt-28 border-t border-border/70">
      <div className="container-page flex flex-col gap-8 py-12 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <Link href="/" className="group/logo inline-flex items-center gap-2.5">
            <BrandMark
              brand={brand}
              className="h-6"
              sealClassName="size-6 rounded-[0.38rem] text-[0.8rem]"
            />
            {brand.showTitle && (
              <span className="font-serif font-semibold tracking-[0.08em] text-foreground">
                {s.siteTitle}
              </span>
            )}
          </Link>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {s.footerText || s.siteDescription}
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <SocialLinks social={s.social} className="-mx-2" />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-subtle">
            <span>
              © {startYear && startYear < year ? `${startYear}–${year}` : year} {s.siteTitle}
            </span>
            {days !== null && <span>已运行 {days.toLocaleString("zh-CN")} 天</span>}
            {s.icp && (
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-muted-foreground"
              >
                {s.icp}
              </a>
            )}
            {s.gonganBeian && (
              <a
                href={s.gonganLink || "https://beian.mps.gov.cn/"}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-muted-foreground"
              >
                {s.gonganBeian}
              </a>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
