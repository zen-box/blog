import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

function pageList(current: number, total: number): (number | "…")[] {
  const set = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const pill =
    "inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground transition-[color,border-color,background-color,translate] duration-300 ease-out-expo hover:border-foreground/25 hover:bg-card hover:text-foreground";

  return (
    <nav aria-label="分页" className="mt-14 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cn(pill, "group/prev")}>
          <ArrowLeftIcon className="size-4 transition-transform duration-300 group-hover/prev:-translate-x-0.5" />
          上一页
        </Link>
      ) : (
        <span />
      )}

      <ol className="hidden items-center gap-1 sm:flex">
        {pageList(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`gap-${i}`} className="px-2 text-subtle">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "grid size-10 place-items-center rounded-full font-mono text-sm transition-colors duration-300",
                  p === page
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
      </ol>
      <span className="text-sm text-muted-foreground sm:hidden">
        {page} / {pageCount}
      </span>

      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={cn(pill, "group/next")}>
          下一页
          <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover/next:translate-x-0.5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
