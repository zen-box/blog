import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { CustomHead } from "@/components/custom-head";
import { ThemeScript, ThemeSync } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { getSettings, siteUrl } from "@/lib/settings";
import { faviconKind, ICON_MIME, iconVersion } from "@/server/brand";
import { getTtsConfig } from "@/server/tts-config";

// 内容来自 SQLite，每次请求实时渲染（查询是微秒级）
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  const kind = faviconKind(s.favicon);
  const v = iconVersion();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: s.siteTitle, template: `%s · ${s.siteTitle}` },
    description: s.siteDescription,
    keywords: s.siteKeywords
      .split(/[,，]/)
      .map((k) => k.trim())
      .filter(Boolean),
    authors: [{ name: s.authorName }],
    alternates: {
      canonical: "/",
      types: {
        "application/rss+xml": [
          { url: "/feed.xml", title: s.siteTitle },
          ...(getTtsConfig().enabled
            ? [{ url: "/podcast.xml", title: `${s.siteTitle} · 播客` }]
            : []),
        ],
      },
    },
    openGraph: {
      type: "website",
      siteName: s.siteTitle,
      title: s.siteTitle,
      description: s.siteDescription,
      locale: "zh_CN",
    },
    icons: {
      icon: [{ url: `/site-icon?v=${v}`, type: ICON_MIME[kind] }],
      apple: kind === "raster" || kind === "svg" ? [{ url: `/site-icon/apple?v=${v}` }] : undefined,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#16171b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const s = getSettings();
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      style={{ "--hue": s.accentHue } as React.CSSProperties}
    >
      <head>
        <ThemeScript />
        <CustomHead html={s.customHead} />
      </head>
      <body>
        {children}
        <ThemeSync />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
