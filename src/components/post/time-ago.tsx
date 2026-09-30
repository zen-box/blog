"use client";

import { useNow } from "@/hooks/use-now";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";

/** 首屏渲染绝对日期（与服务端一致），注水后切换为相对时间 */
export function TimeAgo({ date, className }: { date: string | Date; className?: string }) {
  const now = useNow();
  return (
    <time
      dateTime={new Date(date).toISOString()}
      title={formatDateTime(date)}
      className={className}
    >
      {now ? formatRelative(date, now) : formatDate(date)}
    </time>
  );
}
