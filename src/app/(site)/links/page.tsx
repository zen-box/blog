import type { Metadata } from "next";

import { ApplyForm, SiteInfo } from "@/components/links/apply-form";
import { LinkCard } from "@/components/links/link-card";
import { Reveal } from "@/components/motion/reveal";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { renderMarkdown } from "@/lib/markdown";
import { absoluteUrl, getSettings, siteUrl } from "@/lib/settings";
import { withLinkCards } from "@/server/link-preview";
import { getLinkGroups } from "@/server/links";
import { resolveUploadUrl } from "@/server/storage";

export const metadata: Metadata = { title: "友链", alternates: { canonical: "/links" } };

export default async function LinksPage() {
  const s = getSettings();
  const groups = getLinkGroups();
  const intro = s.links.intro.trim()
    ? withLinkCards((await renderMarkdown(s.links.intro)).html)
    : "";
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <PageView>
      <PageHeader eyebrow="Friends" title="友链" description={`${total} 位朋友`} />
      <div className="container-page space-y-14">
        {groups.map((g, gi) => (
          <section key={g.name}>
            {groups.length > 1 && (
              <h2 className="mb-4 font-serif text-lg font-semibold text-foreground">
                {g.name}
                <span className="ml-2 font-sans text-sm font-normal text-subtle">
                  {g.items.length}
                </span>
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((l, i) => (
                <Reveal key={l.id} delay={Math.min(gi * 3 + i, 9) * 0.04}>
                  <LinkCard
                    name={l.name}
                    url={l.url}
                    avatar={l.avatar}
                    description={l.description}
                  />
                </Reveal>
              ))}
            </div>
          </section>
        ))}

        <Reveal>
          <section className="grid gap-8 border-t border-border/70 pt-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 font-serif text-lg font-semibold text-foreground">交换友链</h2>
              {intro && (
                <div
                  className="prose-blog prose-comment"
                  dangerouslySetInnerHTML={{ __html: intro }}
                />
              )}
              <h3 className="mt-6 mb-3 text-sm font-medium text-foreground">本站信息</h3>
              <SiteInfo
                rows={[
                  { label: "名称", value: s.siteTitle },
                  { label: "地址", value: siteUrl() },
                  ...(s.authorAvatar
                    ? [
                        {
                          label: "头像",
                          value: absoluteUrl(resolveUploadUrl(s.authorAvatar)),
                        },
                      ]
                    : []),
                  { label: "介绍", value: s.siteDescription },
                ]}
              />
            </div>
            {s.links.allowApply && (
              <div>
                <h2 className="mb-3 font-serif text-lg font-semibold text-foreground">提交申请</h2>
                <ApplyForm />
              </div>
            )}
          </section>
        </Reveal>
      </div>
    </PageView>
  );
}
