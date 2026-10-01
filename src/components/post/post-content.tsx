"use client";

import { useEffect, useRef } from "react";

import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";

import { useDiagramViewer } from "./diagram-viewer";
import { setupDiagrams } from "./diagrams";
import { useImageZoom } from "./image-zoom";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 HTTPS 环境下的兜底
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function setupCodeBlocks(root: HTMLElement) {
  const cleanups: (() => void)[] = [];
  for (const figure of root.querySelectorAll<HTMLElement>(".code-block")) {
    const button = figure.querySelector<HTMLButtonElement>(".code-copy");
    const code = figure.querySelector("pre code");
    if (button && code) {
      let timer: ReturnType<typeof setTimeout>;
      const label = button.querySelector(".code-copy-text");
      const onClick = async () => {
        const text = Array.from(code.querySelectorAll(".line"))
          .map((l) => l.textContent ?? "")
          .join("\n");
        if (await copyText(text || code.textContent || "")) {
          button.dataset.copied = "";
          if (label) label.textContent = "已复制";
          clearTimeout(timer);
          timer = setTimeout(() => {
            delete button.dataset.copied;
            if (label) label.textContent = "复制";
          }, 1800);
        }
      };
      button.addEventListener("click", onClick);
      cleanups.push(() => button.removeEventListener("click", onClick));
    }

    // 长代码折叠
    const pre = figure.querySelector<HTMLElement>("pre");
    const lines = figure.querySelectorAll(".line").length;
    const wantCollapse = figure.hasAttribute("data-collapse") || lines > 40;
    if (pre && wantCollapse && !figure.querySelector(".code-expand")) {
      figure.dataset.collapsed = "";
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "code-expand";
      expand.textContent = `展开全部 ${lines} 行`;
      expand.addEventListener("click", () => {
        const from = pre.getBoundingClientRect().height;
        delete figure.dataset.collapsed;
        const to = pre.scrollHeight;
        pre.animate([{ maxHeight: `${from}px` }, { maxHeight: `${to}px` }], {
          duration: 500,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
        expand.remove();
      });
      figure.appendChild(expand);
    }
  }
  return () => cleanups.forEach((c) => c());
}

/** 可横向滚动的元素：标记两端是否还有没显示的内容，CSS 据此渐隐边缘 */
function trackOverflow(el: HTMLElement) {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    const sides = [el.scrollLeft > 2 && "start", el.scrollLeft < max - 2 && "end"];
    const value = sides.filter(Boolean).join(" ");
    if (value) el.dataset.overflow = value;
    else delete el.dataset.overflow;
  };
  const observer = new ResizeObserver(update);
  observer.observe(el);
  el.addEventListener("scroll", update, { passive: true });
  update();
  return () => {
    observer.disconnect();
    el.removeEventListener("scroll", update);
  };
}

let tabsSeq = 0;
const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

function setupTabs(root: HTMLElement) {
  const cleanups: (() => void)[] = [];
  for (const tabs of root.querySelectorAll<HTMLElement>("[data-tabs]")) {
    const list = tabs.querySelector<HTMLElement>(":scope > .md-tabs-list");
    const buttons = Array.from(list?.querySelectorAll<HTMLButtonElement>(".md-tab") ?? []);
    const panels = Array.from(tabs.querySelectorAll<HTMLElement>(":scope > .md-tab-panel"));
    if (!list || !buttons.length) continue;

    const id = `md-tabs-${++tabsSeq}`;
    buttons.forEach((btn, i) => {
      const panel = panels[i];
      btn.id = `${id}-tab-${i}`;
      if (!panel) return;
      panel.id = `${id}-panel-${i}`;
      btn.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", btn.id);
    });

    let indicator = list.querySelector<HTMLElement>(".md-tab-indicator");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "md-tab-indicator";
      list.appendChild(indicator);
    }
    const bar = indicator;
    const current = () =>
      Math.max(
        0,
        buttons.findIndex((b) => b.getAttribute("aria-selected") === "true"),
      );
    const place = () => {
      const btn = buttons[current()];
      bar.style.width = `${btn.offsetWidth - 16}px`;
      bar.style.transform = `translateX(${btn.offsetLeft + 8}px)`;
    };
    const reveal = (btn: HTMLElement, smooth: boolean) => {
      const left = btn.offsetLeft - 24;
      const right = btn.offsetLeft + btn.offsetWidth + 24;
      const behavior = smooth ? "smooth" : "auto";
      if (left < list.scrollLeft) list.scrollTo({ left, behavior });
      else if (right > list.scrollLeft + list.clientWidth)
        list.scrollTo({ left: right - list.clientWidth, behavior });
    };

    let resize: Animation | undefined;
    const select = (i: number, focus = false) => {
      const btn = buttons[i];
      if (focus) btn.focus({ preventScroll: true });
      if (i === current()) return;
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const from = tabs.offsetHeight;
      resize?.cancel();
      buttons.forEach((b, j) => {
        b.setAttribute("aria-selected", String(i === j));
        b.tabIndex = i === j ? 0 : -1;
      });
      panels.forEach((p, j) => (p.hidden = i !== j));
      const panel = panels[i];
      if (panel && !calm) {
        panel.dataset.entering = "";
        setTimeout(() => delete panel.dataset.entering, 460);
        // 高度从旧面板平滑过渡到新面板
        const to = tabs.offsetHeight;
        if (Math.abs(to - from) > 1) {
          resize = tabs.animate([{ height: `${from}px` }, { height: `${to}px` }], {
            duration: 450,
            easing: EASE_OUT_EXPO,
          });
        }
      }
      place();
      reveal(btn, !calm);
    };

    buttons.forEach((btn, i) => {
      btn.tabIndex = i === current() ? 0 : -1;
      btn.onclick = () => select(i);
    });
    list.onkeydown = (e) => {
      const i = current();
      const next =
        e.key === "ArrowRight"
          ? (i + 1) % buttons.length
          : e.key === "ArrowLeft"
            ? (i - 1 + buttons.length) % buttons.length
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : -1;
      if (next < 0) return;
      e.preventDefault();
      select(next, true);
    };
    // 标签太多放不下时横向滚动；尺寸或字体变化后重新定位指示条
    const observer = new ResizeObserver(place);
    observer.observe(list);
    place();
    void document.fonts?.ready.then(place);
    cleanups.push(() => observer.disconnect(), trackOverflow(list));
  }
  return () => cleanups.forEach((c) => c());
}

function setupTerminals(root: HTMLElement) {
  const cleanups: (() => void)[] = [];
  for (const screen of root.querySelectorAll<HTMLElement>(".term-screen")) {
    cleanups.push(trackOverflow(screen));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>(".term-copy")) {
    const screen = button.parentElement?.querySelector(".term-screen");
    if (!screen) continue;
    let timer: ReturnType<typeof setTimeout>;
    const onClick = async () => {
      if (!(await copyText(screen.textContent ?? ""))) return;
      button.dataset.copied = "";
      button.textContent = "已复制";
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete button.dataset.copied;
        button.textContent = "复制";
      }, 1800);
    };
    button.addEventListener("click", onClick);
    cleanups.push(() => {
      button.removeEventListener("click", onClick);
      clearTimeout(timer);
    });
  }
  return () => cleanups.forEach((c) => c());
}

function setupMisc(root: HTMLElement) {
  for (const s of root.querySelectorAll<HTMLElement>(".md-spoiler")) {
    s.onclick = () => s.toggleAttribute("data-revealed");
  }
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-placeholder]")) {
    const done = () => {
      img.dataset.loaded = "";
      img.style.backgroundImage = "";
    };
    if (img.complete && img.naturalWidth) done();
    else img.addEventListener("load", done, { once: true });
  }
}

/** 文章正文：服务端预渲染的 HTML + 浏览器端的交互增强 */
export function PostContent({
  html,
  className,
  preview = false,
}: {
  html: string;
  className?: string;
  /** 后台编辑器的实时预览 */
  preview?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const zoom = useImageZoom();
  const openZoom = zoom.open;
  const viewer = useDiagramViewer();
  const openViewer = viewer.open;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanupCode = setupCodeBlocks(root);
    const cleanupTabs = setupTabs(root);
    const cleanupTerminals = setupTerminals(root);
    setupMisc(root);

    const images = () => Array.from(root.querySelectorAll<HTMLImageElement>("img.zoomable"));
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLImageElement && target.classList.contains("zoomable")) {
        const list = images();
        openZoom(list, Math.max(0, list.indexOf(target)));
      }
    };
    root.addEventListener("click", onClick);
    return () => {
      cleanupCode();
      cleanupTabs();
      cleanupTerminals();
      root.removeEventListener("click", onClick);
    };
  }, [html, openZoom]);

  // 图表的配色跟随明暗主题，切换后重新渲染
  useEffect(() => {
    if (!ref.current || !resolvedTheme) return;
    return setupDiagrams(ref.current, { preview, onZoom: openViewer });
  }, [html, resolvedTheme, preview, openViewer]);

  return (
    <>
      <div
        ref={ref}
        className={cn("prose-blog", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {zoom.element}
      {viewer.element}
    </>
  );
}
