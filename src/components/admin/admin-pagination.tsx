import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function AdminPagination({
  page,
  pageCount,
  base,
  params = {},
}: {
  page: number;
  pageCount: number;
  base: string;
  params?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:bg-muted";
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        第 {page} / {pageCount} 页
      </span>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={cn(btn, page <= 1 && "pointer-events-none opacity-40")}
        >
          <ChevronLeftIcon className="size-4" />
          上一页
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={page >= pageCount}
          className={cn(btn, page >= pageCount && "pointer-events-none opacity-40")}
        >
          下一页
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  );
}
