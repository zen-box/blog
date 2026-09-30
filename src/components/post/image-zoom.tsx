"use client";

import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ZoomState = {
  images: HTMLImageElement[];
  index: number;
  /** 是否切换过图片：切换后的图片直接淡入，而不是从原位置放大 */
  switched: boolean;
};

const EASE = [0.16, 1, 0.3, 1] as const;

function fitRect(img: HTMLImageElement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = vw < 640 ? 16 : 64;
  const nw = img.naturalWidth || img.width || 1;
  const nh = img.naturalHeight || img.height || 1;
  const scale = Math.min((vw - pad * 2) / nw, (vh - pad * 2) / nh, 1.5);
  const width = nw * scale;
  const height = nh * scale;
  return { width, height, left: (vw - width) / 2, top: (vh - height) / 2 };
}

/** 从原图位置到目标位置的变换（FLIP） */
function flipFrom(el: HTMLImageElement, to: ReturnType<typeof fitRect>) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - (to.left + to.width / 2),
    y: r.top + r.height / 2 - (to.top + to.height / 2),
    scale: r.width / to.width,
  };
}

/** 图片灯箱：从文中位置平滑放大，支持左右切换 */
export function useImageZoom() {
  const [state, setState] = useState<ZoomState | null>(null);

  const open = useCallback((images: HTMLImageElement[], index: number) => {
    setState({ images, index, switched: false });
  }, []);

  const go = useCallback((delta: number) => {
    setState((s) =>
      s
        ? { ...s, switched: true, index: (s.index + delta + s.images.length) % s.images.length }
        : s,
    );
  }, []);

  const close = useCallback(() => setState(null), []);

  const element =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {state && <ZoomOverlay key="zoom" state={state} onGo={go} onClose={close} />}
          </AnimatePresence>,
          document.body,
        );

  return { open, element };
}

function ZoomOverlay({
  state,
  onGo,
  onClose,
}: {
  state: ZoomState;
  onGo: (delta: number) => void;
  onClose: () => void;
}) {
  const img = state.images[state.index];
  const multi = state.images.length > 1;
  const rect = fitRect(img);

  // 放大期间隐藏原图，避免重影
  useEffect(() => {
    img.style.setProperty("visibility", "hidden");
    return () => {
      img.style.removeProperty("visibility");
    };
  }, [img]);

  useEffect(() => {
    window.__lenis?.stop();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (multi && e.key === "ArrowRight") onGo(1);
      else if (multi && e.key === "ArrowLeft") onGo(-1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.__lenis?.start();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onClose);
    };
  }, [multi, onClose, onGo]);

  const src = img.dataset.full || img.currentSrc || img.src;

  return (
    <motion.div
      className="fixed inset-0 z-[80]"
      exit={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.button
        type="button"
        aria-label="关闭图片"
        onClick={onClose}
        className="absolute inset-0 size-full cursor-zoom-out bg-background/90 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
      />

      <motion.img
        key={src}
        src={src}
        alt={img.alt}
        onClick={onClose}
        className="absolute cursor-zoom-out rounded-xl object-contain shadow-float"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        initial={state.switched ? { opacity: 0, scale: 0.96 } : flipFrom(img, rect)}
        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        exit={{ ...flipFrom(img, rect), transition: { duration: 0.5, ease: EASE } }}
        transition={{ duration: state.switched ? 0.35 : 0.6, ease: EASE }}
      />

      {img.alt && (
        <motion.p
          className="pointer-events-none absolute inset-x-0 bottom-6 px-6 text-center text-sm text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.45, delay: 0.2, ease: EASE }}
        >
          {img.alt}
        </motion.p>
      )}

      <motion.div
        className="absolute top-4 right-4 flex gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        {multi && (
          <span className="grid h-10 place-items-center rounded-full bg-card/85 px-3.5 font-mono text-xs text-muted-foreground">
            {state.index + 1} / {state.images.length}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="grid size-10 place-items-center rounded-full bg-card/85 text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </motion.div>

      {multi && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          <button
            type="button"
            aria-label="上一张"
            onClick={() => onGo(-1)}
            className="absolute top-1/2 left-4 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={() => onGo(1)}
            className="absolute top-1/2 right-4 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
