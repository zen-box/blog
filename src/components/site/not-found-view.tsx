import { ArrowLeftIcon, ArchiveIcon } from "lucide-react";
import Link from "next/link";

import { Stagger } from "@/components/motion/reveal";

import { PageView } from "./page-view";

export function NotFoundView() {
  return (
    <PageView>
      <section className="container-page flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
        <Stagger className="flex flex-col items-center">
          {[
            <p
              key="code"
              aria-hidden
              className="font-serif text-[clamp(6rem,22vw,11rem)] leading-none font-bold tracking-tight text-foreground/[0.08] select-none"
            >
              404
            </p>,
            <h1
              key="title"
              className="-mt-6 font-serif text-2xl font-semibold text-foreground sm:-mt-10 sm:text-3xl"
            >
              这一页走丢了
            </h1>,
            <p key="desc" className="mt-4 max-w-sm text-balance text-muted-foreground">
              你要找的页面可能已被移动、删除，或者从来就不存在。
            </p>,
            <div key="actions" className="mt-8 flex gap-3">
              <Link
                href="/"
                className="group/home inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm text-background transition-opacity hover:opacity-90"
              >
                <ArrowLeftIcon className="size-4 transition-transform duration-300 group-hover/home:-translate-x-0.5" />
                回到首页
              </Link>
              <Link
                href="/archive"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                <ArchiveIcon className="size-4" />
                文章归档
              </Link>
            </div>,
          ]}
        </Stagger>
      </section>
    </PageView>
  );
}
