"use client";

import { ImageIcon, QuoteIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { quoteCard, type ShareSource } from "./share-canvas";
import { ShareImageDialog } from "./share-image";

const EASE = [0.16, 1, 0.3, 1] as const;
const noop = () => () => {};

/** 选中正文后的小工具条：复制引用（带出处）、生成金句卡片 */
export function QuoteSelection(source: ShareSource) {
  const [selection, setSelection] = useState<{
    text: string;
    top: number;
    left: number;
    below: boolean;
  } | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  // 浮层渲染到 body；服务端和注水阶段先不渲染
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    const body = document.querySelector("[data-article-body]");
    if (!body) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = getSelection();
        const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
        if (!sel || sel.isCollapsed || text.length < 4 || text.length > 500)
          return setSelection(null);
        const range = sel.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const el = node instanceof Element ? node : node.parentElement;
        // 只在正文段落里出现；代码、终端输出、图表里不打扰
        if (
          !el ||
          !body.contains(el) ||
          el.closest("pre, code, .term, .md-chart, .md-mermaid, .md-markmap")
        )
          return setSelection(null);
        const rects = range.getClientRects();
        const first = rects[0] ?? range.getBoundingClientRect();
        const last = rects[rects.length - 1] ?? first;
        const coarse = matchMedia("(pointer: coarse)").matches;
        // 触屏放在选区下方，避开系统的复制菜单
        const below = coarse || first.top < 90;
        // 触屏多留一点，让出选区末尾的拖动手柄
        const top = below ? last.bottom + (coarse ? 20 : 10) : first.top - 48;
        setSelection({
          text,
          below,
          // 选区超出屏幕时也留在可见范围内：不压顶栏，也不压底部的音乐和目录按钮
          top: Math.min(Math.max(top, 72), innerHeight - 128),
          left: (below ? last.left + last.right : first.left + first.right) / 2,
        });
      }, 160);
    };
    const hide = () => setSelection(null);
    document.addEventListener("selectionchange", check);
    addEventListener("scroll", hide, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", check);
      removeEventListener("scroll", hide);
    };
  }, []);

  async function copyQuote(text: string) {
    const quote = `「${text}」\n—— ${source.author}《${source.title}》\n${source.url}`;
    try {
      await navigator.clipboard.writeText(quote);
      toast.success("已复制引用", { description: "带上了出处和链接" });
    } catch {
      toast.error("复制失败，请手动复制");
    }
    setSelection(null);
  }

  const width = 220;
  return (
    <>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {selection && (
              <motion.div
                ref={bar}
                role="toolbar"
                aria-label="引用选中的文字"
                initial={{ opacity: 0, y: selection.below ? -4 : 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: EASE }}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  top: selection.top,
                  left: Math.min(Math.max(8, selection.left - width / 2), innerWidth - width - 8),
                  width,
                }}
                className="fixed z-40 flex items-center justify-center gap-0.5 rounded-full border border-border/80 bg-popover/95 p-1 text-xs shadow-float backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={() => void copyQuote(selection.text)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <QuoteIcon className="size-3.5" />
                  复制引用
                </button>
                <span aria-hidden className="h-4 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    setCard(selection.text);
                    setSelection(null);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ImageIcon className="size-3.5" />
                  金句卡片
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      <ShareImageDialog
        open={card !== null}
        onOpenChange={(open) => !open && setCard(null)}
        title="金句卡片"
        description="带着出处和二维码，发给朋友或存起来。"
        filename={`金句-${source.title}.png`}
        render={() => quoteCard(card ?? "", source)}
      />
    </>
  );
}
