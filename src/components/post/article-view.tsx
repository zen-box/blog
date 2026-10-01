import "katex/dist/katex.min.css";

import { PageView } from "@/components/site/page-view";
import { absoluteUrl, getSettings, siteUrl } from "@/lib/settings";
import { getCommentTree } from "@/server/comments";
import { withLinkCards } from "@/server/link-preview";
import type { AdjacentPost, PostDetail } from "@/server/posts";
import { resolveUploadUrl } from "@/server/storage";
import { getPublishedReaderInsights } from "@/server/reader-ai";
import { ReaderInsightsCard } from "./reader-insights";

import { Comments } from "./comments";
import { PostContent } from "./post-content";
import { PostFooter, PostHero, PostNav, RelatedPosts } from "./post-parts";
import { ReadingProgress } from "./reading-progress";
import { MobileToc, Toc } from "./toc";

export function ArticleView({
  post,
  adjacent,
  related = [],
}: {
  post: PostDetail;
  adjacent?: { prev: AdjacentPost | null; next: AdjacentPost | null };
  related?: AdjacentPost[];
}) {
  const s = getSettings();
  const isPage = post.type === "page";
  const { items, total } = getCommentTree(post.id);
  const url = `${siteUrl()}${isPage ? "" : "/posts"}/${encodeURI(post.slug)}`;
  const toc = post.toc ?? [];
  const showComments = post.allowComments || total > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": isPage ? "WebPage" : "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || post.summary || undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Person", name: s.authorName },
    image: post.cover ? absoluteUrl(resolveUploadUrl(post.cover)) : undefined,
    mainEntityOfPage: url,
    keywords: post.tags.map((t) => t.name).join(",") || undefined,
  };

  return (
    <PageView>
      <ReadingProgress />
      <article>
        <PostHero post={post} commentCount={total} />

        <div className="mx-auto mt-12 grid w-full max-w-[82rem] grid-cols-1 px-5 sm:mt-14 md:px-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] xl:gap-14">
          <div aria-hidden className="hidden xl:block" />
          <div className="mx-auto w-full max-w-[42rem] min-w-0">
            {!isPage && (
              <ReaderInsightsCard
                key={post.content}
                insights={getPublishedReaderInsights(post.id, post.content)}
              />
            )}
            <PostContent html={withLinkCards(post.html)} />
          </div>
          <aside className="hidden xl:block">
            <Toc items={toc} />
          </aside>
        </div>

        {!isPage && <PostFooter post={post} settings={s} url={url} />}
      </article>

      {!isPage && adjacent && <PostNav newer={adjacent.next} older={adjacent.prev} />}
      {!isPage && <RelatedPosts posts={related} />}

      {showComments && (
        <div className="container-read mt-16">
          <Comments
            postId={post.id}
            initial={items}
            total={total}
            enabled={s.comments.enabled && post.allowComments}
          />
        </div>
      )}

      <MobileToc items={toc} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </PageView>
  );
}
