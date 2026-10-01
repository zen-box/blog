import { LoaderIcon } from "lucide-react";

/** 前后台共用的页面加载占位，保持原有卡片和阅读宽度。 */
export function PagePending() {
  return (
    <div
      className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-6xl px-4 py-8 md:px-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <LoaderIcon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        正在加载，请稍候…
      </div>
    </div>
  );
}
