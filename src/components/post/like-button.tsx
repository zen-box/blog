"use client";

import { HeartIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const PARTICLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export function LikeButton({ postId, initial }: { postId: number; initial: number }) {
  const [likes, setLikes] = useState(initial);
  const [clicked, setClicked] = useState(false);
  const [burst, setBurst] = useState(0);
  // 是否点过赞记录在本地；服务端渲染时视为未点赞
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => localStorage.getItem(`liked:${postId}`) === "1",
    () => false,
  );
  const liked = stored || clicked;

  async function like() {
    if (liked) {
      setBurst((b) => b + 1);
      return;
    }
    setClicked(true);
    setLikes((n) => n + 1);
    setBurst((b) => b + 1);
    localStorage.setItem(`liked:${postId}`, "1");
    try {
      const res = await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = (await res.json()) as { likes?: number };
      if (typeof data.likes === "number") setLikes(data.likes);
    } catch {
      /* 保持乐观更新 */
    }
  }

  return (
    <button
      type="button"
      onClick={like}
      aria-pressed={liked}
      aria-label={liked ? "已点赞" : "点赞"}
      className={cn(
        "group/like relative inline-flex h-11 items-center gap-2.5 rounded-full border px-5 text-sm transition-[color,border-color,background-color] duration-300",
        liked
          ? "border-[#c4543f]/30 bg-[#c4543f]/[0.07] text-[#c4543f] dark:text-[#e57a62]"
          : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      <span className="relative grid place-items-center">
        <motion.span
          key={burst}
          initial={burst ? { scale: 0.6 } : false}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 12 }}
          className="grid place-items-center"
        >
          <HeartIcon className={cn("size-[1.1rem]", liked && "fill-current")} />
        </motion.span>
        <AnimatePresence>
          {burst > 0 &&
            PARTICLES.map((angle, i) => (
              <motion.span
                key={`${burst}-${i}`}
                aria-hidden
                className="absolute size-1 rounded-full bg-current"
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 18,
                  y: Math.sin(angle) * 18,
                  opacity: 0,
                  scale: 0.4,
                }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
        </AnimatePresence>
      </span>
      <span className="tabular-nums">{likes > 0 ? likes : "喜欢"}</span>
    </button>
  );
}
