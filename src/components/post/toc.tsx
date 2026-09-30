"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ListIcon } from "lucide-react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { TocItem } from "@/db/schema";
import { cn } from "@/lib/utils";

const OFFSET = 120;

function useActiveHeading(items: TocItem[]) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = items[0].id;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) current = item.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);
  return active;
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -96, duration: 1 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function TocList({
  items,
  active,
  onNavigate,
}: {
  items: TocItem[];
  active: string | null;
  onNavigate?: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState({ top: 0, height: 0 });
  const minDepth = Math.min(...items.map((i) => i.depth));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(active ?? "")}"]`,
    );
    if (el) setBar({ top: el.offsetTop, height: el.offsetHeight });
  }, [active]);

  return (
    <div className="relative">
      <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-border" />
      <motion.span
        aria-hidden
        className="absolute left-0 w-[2px] -translate-x-[0.5px] rounded-full bg-brand"
        initial={false}
        animate={{ top: bar.top + 6, height: Math.max(0, bar.height - 12) }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      />
      <ul ref={listRef} className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} data-id={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToHeading(item.id);
                onNavigate?.();
              }}
              style={{ paddingLeft: `${0.9 + (item.depth - minDepth) * 0.85}rem` }}
              className={cn(
                "block py-1.5 pr-2 text-[0.84rem] leading-snug transition-colors duration-300",
                active === item.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useReadProgress() {
  const { scrollYProgress } = useScroll();
  const [pct, setPct] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setPct(Math.round(v * 100)));
  return pct;
}

/** 桌面端：右侧悬停目录 */
export function Toc({ items }: { items: TocItem[] }) {
  const active = useActiveHeading(items);
  const pct = useReadProgress();
  if (!items.length) return null;
  return (
    <nav aria-label="文章目录" className="sticky top-[calc(var(--header-h)+2.5rem)] w-56">
      <p className="mb-3 flex items-center justify-between pl-[0.9rem] text-xs tracking-[0.18em] text-subtle">
        <span>目录</span>
        <span className="font-mono tracking-normal tabular-nums">{pct}%</span>
      </p>
      <div
        data-lenis-prevent
        className="max-h-[calc(100vh-12rem)] overflow-y-auto overscroll-contain"
      >
        <TocList items={items} active={active} />
      </div>
    </nav>
  );
}

/** 移动端：浮动按钮 + 底部面板 */
export function MobileToc({ items }: { items: TocItem[] }) {
  const active = useActiveHeading(items);
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="打开目录"
        className="fixed right-5 bottom-20 z-40 grid size-11 place-items-center rounded-full border border-border/80 bg-card/85 text-muted-foreground shadow-soft backdrop-blur-md transition-colors hover:text-brand md:right-8 md:bottom-24 xl:hidden"
      >
        <ListIcon className="size-[1.05rem]" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-background/50 backdrop-blur-sm transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-lenis-prevent
          className="fixed inset-x-0 bottom-0 z-[61] max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-border bg-popover px-5 pt-3 pb-8 shadow-float transition-transform duration-500 ease-out-expo outline-none data-ending-style:translate-y-full data-starting-style:translate-y-full"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <Dialog.Title className="mb-3 pl-[0.9rem] text-xs tracking-[0.18em] text-subtle">
            目录
          </Dialog.Title>
          <TocList items={items} active={active} onNavigate={() => setOpen(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
