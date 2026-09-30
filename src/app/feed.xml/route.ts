import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { getSettings, siteUrl } from "@/lib/settings";
import { withLinkCards } from "@/server/link-preview";
import { publishedPost } from "@/server/posts";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** 订阅内容：绝对地址、去掉交互按钮和内联占位图，标签页全部展开，链接卡片简化成链接 */
function feedHtml(html: string, base: string) {
  return withLinkCards(html)
    .replace(
      /<a class="link-card[^"]*" href="([^"]*)"[^>]*><span class="link-card-body"><span class="link-card-title">([\s\S]*?)<\/span>(?:<span class="link-card-desc">([\s\S]*?)<\/span>)?[\s\S]*?<\/a>/g,
      (_, href: string, title: string, desc?: string) =>
        `<p><a href="${href}">${title}</a>${desc ? `<br>${desc}` : ""}</p>`,
    )
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, "")
    .replace(/<div class="md-tab-panel"([^>]*)>/g, (_, attrs: string) => {
      const label = /aria-label="([^"]*)"/.exec(attrs)?.[1];
      const shown = attrs.replace(/\shidden(?:="")?/, "");
      return `<div class="md-tab-panel"${shown}>${label ? `<p><strong>${label}</strong></p>` : ""}`;
    })
    .replace(/ style="background-image:url\(data:[^"]*\)"/g, "")
    .replace(/ (src|href|poster)="\/(?!\/)/g, ` $1="${base}/`);
}

export async function GET() {
  const s = getSettings();
  const base = siteUrl();
  const rows = db
    .select({
      title: schema.posts.title,
      slug: schema.posts.slug,
      html: schema.posts.html,
      excerpt: schema.posts.excerpt,
      summary: schema.posts.summary,
      publishedAt: schema.posts.publishedAt,
      updatedAt: schema.posts.updatedAt,
      category: schema.categories.name,
    })
    .from(schema.posts)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.posts.categoryId))
    .where(publishedPost())
    .orderBy(desc(schema.posts.publishedAt))
    .limit(20)
    .all();

  const items = rows
    .map((p) => {
      const url = `${base}/posts/${encodeURI(p.slug)}`;
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${(p.publishedAt ?? p.updatedAt).toUTCString()}</pubDate>
      ${p.category ? `<category>${esc(p.category)}</category>` : ""}
      <description>${cdata(p.excerpt || p.summary || "")}</description>
      <content:encoded>${cdata(feedHtml(p.html, base))}</content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(s.siteTitle)}</title>
    <link>${esc(base)}</link>
    <description>${esc(s.siteDescription)}</description>
    <language>zh-CN</language>
    <atom:link href="${esc(base)}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${(rows[0]?.publishedAt ?? new Date()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
