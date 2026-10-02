"use client";

import { BookmarkIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const KEY = "blog-reading-v1";
const EASE = [0.16, 1, 0.3, 1] as const;
/** 读到哪一段（data-say）、进度比例、时间 */
type Place = { say: number; ratio: number; at: number };

function readAll(): Record<string, Place> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function save(post: string, place: Place | null) {
  const all = readAll();
  if (place) all[post] = place;
  else delete all[post];
  // 只留最近 50 篇
  const recent = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {}
}

function scrollToBlock(el: Element) {
  if (window.__lenis) window.__lenis.scrollTo(el as HTMLElement, { offset: -110, duration: 1 });
  else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 110, behavior: "smooth" });
}

/** 屏幕上方第一段可见的正文 */
function currentBlock() {
  const blocks = document.querySelectorAll<HTMLElement>("[data-article-body] [data-say]");
  for (const el of blocks) if (el.getBoundingClientRect().bottom > 120) return el;
  return null;
}

/** 长文记住读到的段落；再次打开时提示「上次读到这里」 */
export function ReadingResume({ postId }: { postId: number }) {
  const post = String(postId);
  const [offer, setOffer] = useState<{ el: Element; snippet: string; docked: boolean } | null>(
    null,
  );
  const offered = useRef(false);

  useEffect(() => {
    const saved = readAll()[post];
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 刚打开、还在页面顶部，而且上次读到一半：提示继续
    if (saved && !offered.current && scrollY < 300 && saved.ratio > 0.08 && saved.ratio < 0.95) {
      const el = document.querySelector(`[data-article-body] [data-say="${saved.say}"]`);
      if (el) {
        offered.current = true;
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        timer = setTimeout(
          () =>
            setOffer({
              el,
              snippet: text.length > 16 ? `${text.slice(0, 16)}…` : text,
              // 宽屏放在底部正中；窄屏底部左右已有音乐和目录按钮，改放到顶栏下面
              docked: matchMedia("(min-width: 64rem)").matches,
            }),
          600,
        );
      }
    }
    let frame = 0;
    let last = 0;
    const record = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        const ratio = max > 0 ? scrollY / max : 0;
        // 开始往下读了就收起提示
        if (ratio > 0.15) setOffer(null);
        if (Date.now() - last < 800) return;
        last = Date.now();
        if (ratio >= 0.95) return save(post, null);
        const el = currentBlock();
        if (el && ratio > 0.05)
          save(post, {
            say: Number(el.dataset.say),
            ratio: Math.round(ratio * 100) / 100,
            at: Date.now(),
          });
      });
    };
    addEventListener("scroll", record, { passive: true });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      removeEventListener("scroll", record);
    };
  }, [post]);

  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), 15000);
    return () => clearTimeout(timer);
  }, [offer]);

  return (
    <AnimatePresence>
      {offer && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: offer.docked ? 24 : -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offer.docked ? 24 : -16 }}
          transition={{ duration: 0.45, ease: EASE }}
          className={cn(
            "fixed left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/95 py-1.5 pr-1.5 pl-4 text-sm whitespace-nowrap shadow-float backdrop-blur",
            offer.docked ? "bottom-8" : "top-[calc(var(--header-h)+0.75rem)]",
          )}
        >
          <BookmarkIcon className="mr-1 size-3.5 shrink-0 text-brand" />
          <span className="min-w-0 truncate text-muted-foreground">
            上次读到「<span className="text-foreground">{offer.snippet}</span>」
          </span>
          <button
            type="button"
            onClick={() => {
              const target = offer.el;
              setOffer(null);
              scrollToBlock(target);
              target.setAttribute("data-resume", "");
              setTimeout(() => target.removeAttribute("data-resume"), 2400);
            }}
            className="ml-1.5 h-8 shrink-0 rounded-full bg-foreground px-3.5 text-background transition-opacity hover:opacity-90"
          >
            继续阅读
          </button>
          <button
            type="button"
            aria-label="不用了"
            onClick={() => setOffer(null)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
