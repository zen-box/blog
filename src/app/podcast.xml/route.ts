import { absoluteUrl, getSettings, siteUrl } from "@/lib/settings";
import { listPodcastEpisodes } from "@/server/post-audio";
import { resolveUploadUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** 播客订阅源：每篇文章的 AI 播客（没有播客时用朗读），Apple 播客、Pocket Casts 等应用可以订阅 */
export async function GET() {
  const s = getSettings();
  const base = siteUrl();
  const episodes = listPodcastEpisodes();
  const cover = s.logo ? absoluteUrl(resolveUploadUrl(s.logo)) : "";

  const items = episodes
    .map(({ post, kind, url, size, duration }) => {
      const link = `${base}/posts/${encodeURI(post.slug)}`;
      const description = post.seoDescription || post.excerpt || post.summary || "";
      return `    <item>
      <title>${esc(kind === "narration" ? `${post.title}（朗读）` : post.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(`${link}#${kind}`)}</guid>
      <pubDate>${post.publishedAt!.toUTCString()}</pubDate>
      <description>${cdata(description)}</description>
      <enclosure url="${esc(absoluteUrl(resolveUploadUrl(url)))}" length="${size}" type="audio/mpeg" />
      <itunes:duration>${Math.round(duration)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>${
        post.cover
          ? `\n      <itunes:image href="${esc(absoluteUrl(resolveUploadUrl(post.cover)))}" />`
          : ""
      }
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(s.siteTitle)}</title>
    <link>${esc(base)}</link>
    <description>${esc(s.siteDescription)}</description>
    <language>zh-cn</language>
    <atom:link href="${esc(base)}/podcast.xml" rel="self" type="application/rss+xml" />
    <itunes:author>${esc(s.authorName)}</itunes:author>
    <itunes:summary>${esc(s.siteDescription)}</itunes:summary>
${
  cover
    ? `    <itunes:image href="${esc(cover)}" />
`
    : ""
}    <itunes:category text="Technology" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <lastBuildDate>${new Date(Math.max(0, ...episodes.map((e) => e.updatedAt)) || Date.now()).toUTCString()}</lastBuildDate>
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
