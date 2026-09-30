"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** 记录页面访问；文章页由 ViewCounter 负责（带文章 id） */
export function PageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/posts/")) return;
    const body = JSON.stringify({ path: pathname });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", { method: "POST", body, keepalive: true });
    }
  }, [pathname]);
  return null;
}
