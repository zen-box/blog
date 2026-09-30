import { MapPinIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MomentImages } from "@/components/moments/moment-images";
import { Reveal } from "@/components/motion/reveal";
import { TimeAgo } from "@/components/post/time-ago";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { UserAvatar } from "@/components/site/user-avatar";
import { Pagination } from "@/components/site/pagination";
import { thumbUrl } from "@/lib/images";
import { thumbhashToDataUrl } from "@/lib/markdown";
import { getSettings } from "@/lib/settings";
import { avatarFallback, avatarUrl } from "@/server/comments";
import { withLinkCards } from "@/server/link-preview";
import { listMoments } from "@/server/moments";
import { resolveUploadUrl } from "@/server/storage";

export const metadata: Metadata = { title: "说说", alternates: { canonical: "/moments" } };

export default async function MomentsPage({ searchParams }: PageProps<"/moments">) {
  const { page: pageParam } = await searchParams;
  const s = getSettings();
  const page = Math.max(1, Number(pageParam) || 1);
  const result = listMoments({ page, pageSize: 12 });
  if (page > result.pageCount) notFound();
  const avatar = s.authorAvatar
    ? resolveUploadUrl(s.authorAvatar)
    : avatarUrl(s.social.email || null, 96, s.authorName);

  return (
    <PageView>
      <PageHeader
        eyebrow="Moments"
        title="说说"
        description="一些零碎的想法，和不值得写成文章的日常。"
      />
      <div className="container-page">
        {result.items.length ? (
          <ol className="relative max-w-2xl">
            <span aria-hidden className="absolute top-2 bottom-2 left-5 w-px bg-border/80" />
            {result.items.map((m, i) => (
              <li key={m.id} className="relative pb-8 last:pb-0">
                <Reveal delay={Math.min(i, 5) * 0.05}>
                  <article className="flex gap-4">
                    <UserAvatar
                      src={avatar}
                      fallback={avatarFallback(s.social.email || s.authorName)}
                      alt=""
                      width={40}
                      height={40}
                      className="relative z-10 size-10 shrink-0 rounded-full bg-muted object-cover ring-4 ring-background"
                    />
                    <div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/70 px-5 py-4 transition-[background-color,box-shadow] duration-500 hover:bg-card hover:shadow-soft">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-medium text-foreground">{s.authorName}</span>
                        <TimeAgo date={m.createdAt} className="text-xs text-subtle" />
                      </div>
                      {m.html && (
                        <div
                          className="prose-blog prose-comment mt-2"
                          dangerouslySetInnerHTML={{ __html: withLinkCards(m.html) }}
                        />
                      )}
                      <MomentImages
                        images={m.images.map((img) => ({
                          url: resolveUploadUrl(img.url),
                          thumb: resolveUploadUrl(thumbUrl(img.url) ?? img.url),
                          width: img.width,
                          height: img.height,
                          placeholder: img.thumbhash
                            ? thumbhashToDataUrl(img.thumbhash)
                            : undefined,
                        }))}
                      />
                      {m.location && (
                        <p className="mt-3 inline-flex items-center gap-1 text-xs text-subtle">
                          <MapPinIcon className="size-3" />
                          {m.location}
                        </p>
                      )}
                    </div>
                  </article>
                </Reveal>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-16 text-center text-muted-foreground">还没有说说</p>
        )}
        <div className="max-w-2xl">
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            hrefFor={(p) => (p > 1 ? `/moments?page=${p}` : "/moments")}
          />
        </div>
      </div>
    </PageView>
  );
}
