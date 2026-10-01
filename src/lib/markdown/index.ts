import "server-only";

import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { eq } from "drizzle-orm";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { thumbHashToDataURL } from "thumbhash";
import { unified } from "unified";

import { db, schema } from "@/db";
import type { TocItem } from "@/db/schema";
import { resolveUploadUrl } from "@/server/storage";

import { remarkDiagrams } from "./diagrams";
import { CODE_THEMES, getHighlighter } from "./highlighter";
import { preprocessMarkdown } from "./preprocess";
import {
  rehypeImages,
  rehypePreserveCodeMeta,
  rehypeRemoveComments,
  rehypeTableWrap,
  rehypeToc,
  transformerCodeFrame,
  transformerLineNotations,
  type ImageResolver,
} from "./rehype-plugins";
import {
  remarkAlerts,
  remarkBlogDirectives,
  remarkLinkCards,
  remarkMark,
  remarkStats,
} from "./remark-plugins";
import { remarkTerminal } from "./terminal";

/** 渲染管线版本：修改管线后递增，旧文章会在访问或后台操作时重新渲染 */
export const RENDER_VERSION = 5;

export function thumbhashToDataUrl(b64: string): string | undefined {
  try {
    return thumbHashToDataURL(Buffer.from(b64, "base64"));
  } catch {
    return undefined;
  }
}

/** 本站上传的图片：从媒体库读取宽高和 thumbhash 占位 */
const resolveImage: ImageResolver = (src) => {
  if (!src.startsWith("/uploads/")) return;
  let rel: string;
  try {
    rel = decodeURIComponent(src.slice("/uploads/".length).split(/[?#]/)[0]);
  } catch {
    return;
  }
  const row = db
    .select({
      width: schema.media.width,
      height: schema.media.height,
      thumbhash: schema.media.thumbhash,
    })
    .from(schema.media)
    .where(eq(schema.media.path, rel))
    .get();
  if (!row) return;
  const direct = resolveUploadUrl(src);
  return {
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    placeholder: row.thumbhash ? thumbhashToDataUrl(row.thumbhash) : undefined,
    src: direct !== src ? direct : undefined,
  };
};

async function createFullProcessor() {
  const highlighter = await getHighlighter();
  return unified()
    .use(remarkParse)
    .use(remarkStats)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkTerminal)
    .use(remarkAlerts)
    .use(remarkBlogDirectives)
    .use(remarkLinkCards)
    .use(remarkMark)
    .use(remarkDiagrams)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: "脚注",
      footnoteBackLabel: (i: number) => `返回正文 ${i + 1}`,
      footnoteLabelProperties: { className: ["footnote-label"] },
    })
    .use(rehypePreserveCodeMeta)
    .use(rehypeRaw)
    .use(rehypeRemoveComments)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { className: ["heading-anchor"], ariaHidden: "true", tabIndex: -1 },
      content: { type: "text", value: "#" },
    })
    .use(rehypeKatex, { strict: false, throwOnError: false })
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: CODE_THEMES,
      defaultColor: false,
      lazy: true,
      fallbackLanguage: "text",
      onError: () => {},
      transformers: [
        transformerLineNotations(),
        transformerNotationWordHighlight({ matchAlgorithm: "v3" }),
        transformerMetaHighlight(),
        transformerMetaWordHighlight(),
        transformerCodeFrame(),
      ],
    })
    .use(rehypeImages, { resolve: resolveImage })
    .use(rehypeTableWrap)
    .use(rehypeExternalLinks, {
      target: "_blank",
      rel: ["noopener", "noreferrer"],
    })
    .use(rehypeToc)
    .use(rehypeStringify);
}

type FullProcessor = Awaited<ReturnType<typeof createFullProcessor>>;
const holder = globalThis as typeof globalThis & {
  __blogMd?: Promise<FullProcessor>;
};

export type RenderResult = {
  html: string;
  toc: TocItem[];
  wordCount: number;
  readingTime: number;
  excerpt: string;
};

/** 文章 / 页面 / 说说：完整能力，允许原始 HTML（只有管理员能写） */
export async function renderMarkdown(markdown: string): Promise<RenderResult> {
  holder.__blogMd ??= createFullProcessor();
  const processor = await holder.__blogMd;
  const file = await processor.process(preprocessMarkdown(markdown));
  const stats = file.data.stats;
  return {
    html: String(file),
    toc: file.data.toc ?? [],
    wordCount: stats?.wordCount ?? 0,
    readingTime: stats?.readingTime ?? 1,
    excerpt: stats?.excerpt ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* 评论：不可信输入，严格白名单                                              */
/* ------------------------------------------------------------------ */

const commentSchema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [
    "p",
    "br",
    "strong",
    "em",
    "del",
    "a",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "hr",
  ],
  attributes: {
    a: ["href"],
    code: [["className", /^language-/]],
  },
  protocols: { href: ["http", "https", "mailto"] },
};

const commentProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkRehype)
  .use(rehypeSanitize, commentSchema)
  .use(rehypeExternalLinks, {
    target: "_blank",
    rel: ["nofollow", "noopener", "noreferrer", "ugc"],
  })
  .use(rehypeStringify);

export async function renderComment(markdown: string): Promise<string> {
  return String(await commentProcessor.process(markdown));
}
