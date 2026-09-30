import { pinyin } from "pinyin-pro";

/** 中文转拼音后生成 URL 友好的 slug：为什么选择 SQLite → wei-shen-me-xuan-ze-sqlite */
export function slugify(input: string, maxLength = 80): string {
  const parts = pinyin(input.trim(), {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  });
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug;
}

/** 用户手填的 slug：保留字母数字、中文与连字符 */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\?#%&=+]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
