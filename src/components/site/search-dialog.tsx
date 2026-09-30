"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CornerDownLeftIcon, FileTextIcon, LoaderIcon, SearchIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

export type SearchHit = {
  title: string;
  slug: string;
  snippet: string;
  date: string;
  category: string | null;
};

const noopSubscribe = () => () => {};

/** 服务端渲染时按非 Mac 处理，注水后再按实际平台显示快捷键 */
function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    if (!terms.length) return [text];
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  }, [text, terms]);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-brand/15 px-0.5 text-brand">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const isMac = useIsMac();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="搜索"
        className="group/search flex h-9 items-center gap-2 rounded-full px-2.5 text-muted-foreground transition-colors duration-300 hover:bg-foreground/[0.06] hover:text-foreground sm:border sm:border-border/80 sm:pr-1.5 sm:pl-3 sm:hover:border-border"
      >
        <SearchIcon className="size-[1.05rem]" />
        <span className="hidden text-[0.82rem] sm:inline">搜索</span>
        <kbd className="hidden h-6 items-center rounded-full bg-foreground/[0.06] px-2 font-mono text-[0.68rem] tracking-wider sm:inline-flex">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <SearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const request = useRef<AbortController>(undefined);
  const terms = useMemo(() => query.trim().split(/\s+/).filter(Boolean), [query]);

  /** 输入停顿 160ms 后搜索，新的输入会取消旧请求 */
  function search(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    request.current?.abort();
    const q = value.trim();
    if (!q) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      request.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setActive(0);
      } catch {
        /* 被新的输入打断 */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 160);
  }

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    onOpenChange(false);
    router.push(`/posts/${hit.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(() => search(""), 250);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-background/55 backdrop-blur-md transition-opacity duration-300 ease-out-expo data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-lenis-prevent
          className={cn(
            "fixed top-[12vh] left-1/2 z-[61] w-[min(40rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-float outline-none",
            "origin-top transition-[opacity,scale,translate] duration-400 ease-out-expo",
            "data-starting-style:-translate-y-2 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
            "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
          )}
        >
          <Dialog.Title className="sr-only">搜索文章</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-border/80 px-5">
            <SearchIcon className="size-[1.15rem] shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => search(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="搜索文章标题或内容…"
              className="h-14 flex-1 bg-transparent text-[1rem] text-foreground outline-none placeholder:text-subtle"
            />
            {loading && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
            <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
            {!query.trim() ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                输入关键词，搜索全部文章
              </p>
            ) : !loading && hits.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                没有找到与「{query.trim()}」相关的文章
              </p>
            ) : (
              <ul role="listbox" aria-label="搜索结果">
                <AnimatePresence initial={false}>
                  {hits.map((hit, i) => (
                    <motion.li
                      key={hit.slug}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.025, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        data-index={i}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(hit)}
                        className="relative flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left"
                      >
                        {i === active && (
                          <motion.span
                            layoutId="search-active"
                            className="absolute inset-0 -z-10 rounded-xl bg-foreground/[0.055]"
                            transition={{ type: "spring", stiffness: 600, damping: 45 }}
                          />
                        )}
                        <FileTextIcon className="mt-0.5 size-4 shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-serif text-[0.95rem] font-semibold text-foreground">
                              <Highlight text={hit.title} terms={terms} />
                            </span>
                            {hit.category && (
                              <span className="shrink-0 text-xs text-subtle">{hit.category}</span>
                            )}
                          </span>
                          <span className="mt-1 line-clamp-2 text-[0.82rem] leading-relaxed text-muted-foreground">
                            <Highlight text={hit.snippet} terms={terms} />
                          </span>
                        </span>
                        {i === active && (
                          <CornerDownLeftIcon className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                        )}
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border/80 px-5 py-2.5 text-[0.72rem] text-subtle">
            <span>↑ ↓ 选择</span>
            <span>↵ 打开</span>
            <span className="ml-auto">支持多个关键词</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
