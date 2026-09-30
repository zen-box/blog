import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import { publishedPost } from "./posts";

const { posts, categories } = schema;

export type SearchHit = {
  title: string;
  slug: string;
  snippet: string;
  date: string;
  category: string | null;
};

/** 粗略地把 Markdown 转成纯文本，用于摘要 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^:{2,}.*$/gm, " ")
    .replace(/:[a-z-]+\[([^\]]*)\](\{[^}]*\})?/gi, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\[!\w+\]/g, "")
    .replace(/[`*_~=|$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function snippetFor(text: string, terms: string[], radius = 60): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, radius * 2);
  const chars = Array.from(text);
  // 以字符（而非 UTF-16 单元）计算位置，避免截断汉字
  const prefix = Array.from(text.slice(0, at)).length;
  const start = Math.max(0, prefix - radius / 2);
  const end = Math.min(chars.length, start + radius * 2);
  return (
    (start > 0 ? "…" : "") + chars.slice(start, end).join("") + (end < chars.length ? "…" : "")
  );
}

export function searchPosts(query: string, limit = 20): SearchHit[] {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => t.slice(0, 50));
  if (!terms.length) return [];

  const conds = terms.map((t) => {
    const p = `%${escapeLike(t)}%`;
    return sql`(${posts.title} LIKE ${p} ESCAPE '\\' OR ${posts.content} LIKE ${p} ESCAPE '\\' OR coalesce(${posts.excerpt}, '') LIKE ${p} ESCAPE '\\')`;
  });

  const rows = db
    .select({
      title: posts.title,
      slug: posts.slug,
      content: posts.content,
      publishedAt: posts.publishedAt,
      category: categories.name,
    })
    .from(posts)
    .leftJoin(categories, eq(categories.id, posts.categoryId))
    .where(and(publishedPost(), ...conds))
    .limit(200)
    .all();

  const scored = rows.map((r) => {
    const title = r.title.toLowerCase();
    const body = r.content.toLowerCase();
    let score = 0;
    for (const t of terms.map((x) => x.toLowerCase())) {
      if (title.includes(t)) score += 20;
      score += Math.min(body.split(t).length - 1, 10);
    }
    return { r, score };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score || (b.r.publishedAt?.getTime() ?? 0) - (a.r.publishedAt?.getTime() ?? 0),
  );

  return scored.slice(0, limit).map(({ r }) => ({
    title: r.title,
    slug: r.slug,
    snippet: snippetFor(stripMarkdown(r.content), terms),
    date: r.publishedAt?.toISOString() ?? "",
    category: r.category,
  }));
}
