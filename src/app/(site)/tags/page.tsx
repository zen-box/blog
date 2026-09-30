import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { PageHeader } from "@/components/site/page-header";
import { PageView } from "@/components/site/page-view";
import { getTagsWithCount } from "@/server/posts";

export const metadata: Metadata = { title: "标签", alternates: { canonical: "/tags" } };

export default function TagsPage() {
  const tags = getTagsWithCount();
  const max = Math.max(1, ...tags.map((t) => t.count));
  const min = Math.min(max, ...tags.map((t) => t.count));

  return (
    <PageView>
      <PageHeader eyebrow="Tags" title="标签" description={`${tags.length} 个标签`} />
      <div className="container-page">
        <Reveal>
          <ul className="flex max-w-4xl flex-wrap items-baseline gap-x-2 gap-y-3">
            {tags.map((t) => {
              const weight = max === min ? 0.5 : (t.count - min) / (max - min);
              return (
                <li key={t.id}>
                  <Link
                    href={`/tags/${t.slug}`}
                    style={{ fontSize: `${0.92 + weight * 0.7}rem` }}
                    className="group/tag inline-flex items-baseline gap-1 rounded-full px-3.5 py-1.5 text-muted-foreground transition-[color,background-color,translate] duration-300 ease-out-expo hover:-translate-y-0.5 hover:bg-brand-soft/70 hover:text-brand"
                  >
                    <span className="text-subtle transition-colors group-hover/tag:text-brand/60">
                      #
                    </span>
                    {t.name}
                    <sup className="ml-0.5 font-mono text-[0.68rem] text-subtle">{t.count}</sup>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </PageView>
  );
}
