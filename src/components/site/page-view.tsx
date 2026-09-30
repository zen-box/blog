import { ViewTransition } from "react";

import { cn } from "@/lib/utils";

/**
 * 每个页面的内容容器：导航时旧页面快速淡出、新页面柔和上浮。
 * 放在 page.tsx 里而不是 layout（布局在导航间保持挂载，不会触发 enter/exit）。
 */
export function PageView({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div className={cn("pt-(--header-h)", className)}>{children}</div>
    </ViewTransition>
  );
}
