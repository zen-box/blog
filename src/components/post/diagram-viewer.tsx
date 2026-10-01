"use client";

import { MinusIcon, PlusIcon, ScanIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 自己处理缩放和拖动的图形（思维导图）：查看器只提供外框、工具栏和键盘操作 */
export type ViewerControls = {
  zoom: (factor: number) => void;
  fit: () => void;
  destroy: () => void;
};

export type ViewerRequest = {
  /** 打开时从这里放大、关闭时缩回这里 */
  origin: Element;
  /** 关闭后把焦点还给它 */
  trigger?: HTMLElement | null;
} & (
  | { /** 文中渲染好的图形，复制一份放大查看 */ svg: SVGSVGElement; mount?: undefined }
  | {
      /** 在查看器里重新渲染一份可交互的图形 */ mount: (el: HTMLElement) => ViewerControls;
      svg?: undefined;
    }
);

const EASE = [0.16, 1, 0.3, 1] as const;
const MIN_SCALE = 0.5;
const MAX_SCALE = 10;

/** 图表全屏查看：滚轮 / 双指缩放、拖动平移、双击放大或复位 */
export function useDiagramViewer() {
  const [req, setReq] = useState<ViewerRequest | null>(null);
  const open = useCallback((r: ViewerRequest) => {
    setReq(r);
  }, []);
  const close = useCallback(() => setReq(null), []);

  const element =
    typeof document === "undefined"
      ? null
      : createPortal(
          <AnimatePresence>
            {req &&
              (req.mount ? (
                <MountedViewer key="diagram-viewer" req={req} onClose={close} />
              ) : (
                <SvgViewer
                  key="diagram-viewer"
                  svg={req.svg}
                  origin={req.origin}
                  trigger={req.trigger}
                  onClose={close}
                />
              ))}
          </AnimatePresence>,
          document.body,
        );

  return { open, element };
}

/** 复制一份可以独立显示的 SVG（Mermaid 自带 viewBox） */
function standalone(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  let width = vb?.width ?? 0;
  let height = vb?.height ?? 0;
  if (!width || !height) {
    const r = svg.getBoundingClientRect();
    width = r.width || 800;
    height = r.height || 600;
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  clone.removeAttribute("style");
  clone.setAttribute("width", "100%");
  clone.setAttribute("height", "100%");
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.removeAttribute("aria-hidden");
  return { node: clone, width, height };
}

type Rect = { left: number; top: number; width: number; height: number };

const padding = () => (window.innerWidth < 640 ? { x: 16, y: 72 } : { x: 72, y: 88 });

function fitRect(width: number, height: number): Rect & { scale: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = padding();
  const scale = Math.min((vw - pad.x * 2) / width, (vh - pad.y * 2) / height, 3);
  const w = width * scale;
  const h = height * scale;
  return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h, scale };
}

function fullRect(): Rect {
  const pad = padding();
  return {
    left: pad.x,
    top: pad.y,
    width: window.innerWidth - pad.x * 2,
    height: window.innerHeight - pad.y * 2,
  };
}

/** 从原图位置到目标位置的变换（FLIP） */
function flipFrom(origin: Element, to: Rect) {
  const r = origin.getBoundingClientRect();
  if (!r.width || !r.height) return { opacity: 0, scale: 0.96 };
  return {
    x: r.left + r.width / 2 - (to.left + to.width / 2),
    y: r.top + r.height / 2 - (to.top + to.height / 2),
    scale: Math.min(r.width / to.width, r.height / to.height),
  };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** 两种查看器共用：暂停平滑滚动、隐藏原图、键盘操作、Tab 只在查看器内循环 */
function useViewerEffects(
  dialog: React.RefObject<HTMLDivElement | null>,
  origin: Element,
  keys: {
    onClose: () => void;
    zoom: (factor: number) => void;
    fit: () => void;
    pan?: (dx: number, dy: number) => void;
    trigger?: HTMLElement | null;
  },
) {
  // 放大期间隐藏原图避免重影。用透明度而不是 visibility：
  // 复制出来的 SVG 会引用原图里同 id 的箭头等定义，visibility 会被它们继承
  useEffect(() => {
    const el = origin as HTMLElement | SVGElement;
    el.style.setProperty("opacity", "0");
    return () => {
      el.style.removeProperty("opacity");
    };
  }, [origin]);

  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });

  useEffect(() => {
    window.__lenis?.stop();
    const page = document.documentElement;
    const previousOverflow = page.style.overflow;
    page.style.overflow = "hidden";
    const background = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.contains(dialog.current),
    );
    const previousInert = background.map((el) => el.inert);
    background.forEach((el) => {
      el.inert = true;
    });
    const onKey = (e: KeyboardEvent) => {
      const k = latest.current;
      switch (e.key) {
        case "Escape":
          k.onClose();
          break;
        case "+":
        case "=":
          k.zoom(1.25);
          break;
        case "-":
        case "_":
          k.zoom(0.8);
          break;
        case "0":
          k.fit();
          break;
        case "ArrowLeft":
          k.pan?.(48, 0);
          break;
        case "ArrowRight":
          k.pan?.(-48, 0);
          break;
        case "ArrowUp":
          k.pan?.(0, 48);
          break;
        case "ArrowDown":
          k.pan?.(0, -48);
          break;
        case "Tab": {
          const items = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), a[href], [tabindex='-1']",
            ) ?? [],
          );
          if (!items.length) return;
          const i = items.indexOf(document.activeElement as HTMLElement);
          const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
          items[next].focus({ preventScroll: true });
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      page.style.overflow = previousOverflow;
      background.forEach((el, index) => {
        el.inert = previousInert[index];
      });
      window.__lenis?.start();
      window.removeEventListener("keydown", onKey);
      // 在退出动画完成、背景解除 inert 后恢复焦点。
      const target = latest.current.trigger;
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [dialog]);
}

/** 背景、底部工具栏、关闭按钮 */
function ViewerChrome({
  dialog,
  percent,
  onZoom,
  onFit,
  onClose,
  children,
}: {
  dialog: React.RefObject<HTMLDivElement | null>;
  percent?: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const toolButton =
    "grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <motion.div
      ref={dialog}
      className="diagram-viewer fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="查看图表"
      exit={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-background/92 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      />

      {children}

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
      >
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border/80 bg-card/90 p-1 shadow-float backdrop-blur-md">
          <button
            type="button"
            aria-label="缩小"
            className={toolButton}
            onClick={() => onZoom(0.8)}
          >
            <MinusIcon className="size-4" />
          </button>
          {percent != null && (
            <span className="w-12 text-center font-mono text-xs text-muted-foreground tabular-nums">
              {percent}%
            </span>
          )}
          <button
            type="button"
            aria-label="放大"
            className={toolButton}
            onClick={() => onZoom(1.25)}
          >
            <PlusIcon className="size-4" />
          </button>
          <button type="button" aria-label="适应屏幕" className={toolButton} onClick={onFit}>
            <ScanIcon className="size-4" />
          </button>
        </div>
      </motion.div>

      <motion.button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-border/80 bg-card/90 text-muted-foreground shadow-soft backdrop-blur-md transition-colors hover:text-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <XIcon className="size-4" />
      </motion.button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 静态 SVG（Mermaid）：复制一份，查看器负责缩放与平移                          */
/* ------------------------------------------------------------------ */

function SvgViewer({
  svg,
  origin,
  onClose,
  trigger,
}: {
  svg: SVGSVGElement;
  origin: Element;
  onClose: () => void;
  trigger?: HTMLElement | null;
}) {
  const prepared = useMemo(() => standalone(svg), [svg]);
  const [fit, setFit] = useState(() => fitRect(prepared.width, prepared.height));
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 0, y: 0, s: 1 });
  const [percent, setPercent] = useState(Math.round(fit.scale * 100));

  const apply = useCallback(
    (next: { x: number; y: number; s: number }) => {
      view.current = next;
      if (canvas.current) {
        canvas.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.s})`;
      }
      setPercent(Math.round(fit.scale * next.s * 100));
    },
    [fit.scale],
  );

  /** 以屏幕上的某一点为中心缩放 */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const { x, y, s } = view.current;
      const next = clamp(s * factor, MIN_SCALE, MAX_SCALE);
      const lx = clientX - fit.left;
      const ly = clientY - fit.top;
      const k = next / s;
      apply({ x: lx - (lx - x) * k, y: ly - (ly - y) * k, s: next });
    },
    [apply, fit.left, fit.top],
  );
  const zoomCenter = useCallback(
    (factor: number) => zoomAt(window.innerWidth / 2, window.innerHeight / 2, factor),
    [zoomAt],
  );
  const reset = useCallback(() => apply({ x: 0, y: 0, s: 1 }), [apply]);

  useViewerEffects(dialog, origin, {
    onClose,
    trigger,
    zoom: zoomCenter,
    fit: reset,
    pan: (dx, dy) => {
      const { x, y, s } = view.current;
      apply({ x: x + dx, y: y + dy, s });
    },
  });

  useLayoutEffect(() => {
    canvas.current?.replaceChildren(prepared.node);
  }, [prepared]);

  useEffect(() => {
    stage.current?.focus({ preventScroll: true });
    const onResize = () => {
      setFit(fitRect(prepared.width, prepared.height));
      apply({ x: 0, y: 0, s: 1 });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [apply, prepared.width, prepared.height]);

  // 滚轮缩放：需要 passive: false 才能阻止页面滚动
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX, e.clientY, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // 拖动平移、双指缩放；在空白处轻点关闭
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    /** 按下时是否在图形上（捕获指针后 pointerup 的 target 不再可靠） */
    onCanvas: boolean;
    pinch?: { dist: number; s: number; x: number; y: number; cx: number; cy: number };
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    stage.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        onCanvas: !!canvas.current?.contains(e.target as Node),
      };
    } else if (pts.length === 2 && gesture.current) {
      const [a, b] = pts;
      gesture.current.moved = true;
      gesture.current.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        ...view.current,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.pinch) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const s = clamp((g.pinch.s * dist) / g.pinch.dist, MIN_SCALE, MAX_SCALE);
      const k = s / g.pinch.s;
      const lx = g.pinch.cx - fit.left;
      const ly = g.pinch.cy - fit.top;
      apply({
        x: lx - (lx - g.pinch.x) * k + (cx - g.pinch.cx),
        y: ly - (ly - g.pinch.y) * k + (cy - g.pinch.cy),
        s,
      });
      return;
    }
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 4) g.moved = true;
    if (g.moved) {
      const { x, y, s } = view.current;
      apply({ x: x + e.clientX - prev.x, y: y + e.clientY - prev.y, s });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      gesture.current = null;
      // 轻点图形以外的空白处关闭
      if (g && !g.moved && !g.onCanvas) onClose();
    } else if (g) {
      g.pinch = undefined;
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (Math.abs(view.current.s - 1) < 0.05) zoomAt(e.clientX, e.clientY, 2.5);
    else reset();
  };

  const from = useMemo(() => flipFrom(origin, fit), [origin, fit]);

  return (
    <ViewerChrome
      dialog={dialog}
      percent={percent}
      onZoom={zoomCenter}
      onFit={reset}
      onClose={onClose}
    >
      <div
        ref={stage}
        tabIndex={-1}
        className="absolute inset-0 cursor-grab touch-none outline-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <motion.div
          className="absolute"
          style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
          initial={from}
          animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          exit={{ ...from, transition: { duration: 0.4, ease: EASE } }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div ref={canvas} className="size-full origin-top-left" />
        </motion.div>
      </div>
    </ViewerChrome>
  );
}

/* ------------------------------------------------------------------ */
/* 可交互的图形（思维导图）：在查看器里重新渲染，缩放和拖动交给它自己               */
/* ------------------------------------------------------------------ */

function MountedViewer({
  req,
  onClose,
}: {
  req: Extract<ViewerRequest, { mount: unknown }>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ViewerControls | null>(null);
  const [rect, setRect] = useState(fullRect);

  useViewerEffects(dialog, req.origin, {
    onClose,
    trigger: req.trigger,
    zoom: (f) => controls.current?.zoom(f),
    fit: () => controls.current?.fit(),
  });

  useLayoutEffect(() => {
    if (!host.current) return;
    controls.current = req.mount(host.current);
    return () => {
      controls.current?.destroy();
      controls.current = null;
    };
  }, [req]);

  useEffect(() => {
    host.current?.focus({ preventScroll: true });
    const onResize = () => setRect(fullRect());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <ViewerChrome
      dialog={dialog}
      onZoom={(f) => controls.current?.zoom(f)}
      onFit={() => controls.current?.fit()}
      onClose={onClose}
    >
      {/* 轻点图形以外的空白处关闭 */}
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      <motion.div
        ref={host}
        tabIndex={-1}
        className="absolute touch-none outline-none"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        // 思维导图按容器的实际大小居中缩放，不能用带缩放的展开动画，只做淡入
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16, transition: { duration: 0.25, ease: EASE } }}
        transition={{ duration: 0.45, ease: EASE }}
      />
    </ViewerChrome>
  );
}
