"use client";

import { EyeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { formatCount } from "@/lib/format";

/** 记录文章浏览（同一会话只计一次）并显示浏览量 */
export function ViewCounter({ postId, initial }: { postId: number; initial: number }) {
  const [views, setViews] = useState(initial);

  useEffect(() => {
    const key = `viewed:${postId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: location.pathname, postId }),
    })
      .then((r) => r.json())
      .then((d: { views?: number }) => {
        if (typeof d.views === "number") setViews(d.views);
      })
      .catch(() => {});
  }, [postId]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <EyeIcon className="size-3.5" />
      <span className="tabular-nums">{formatCount(views)}</span> 次阅读
    </span>
  );
}
