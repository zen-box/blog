"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const START = "blog:navigation-start";
const COMMIT = "blog:navigation-commit";

/** router.push 之类的程序跳转前调用，让进度线照常出现 */
export function signalNavigation() {
  window.dispatchEvent(new Event(START));
}

/**
 * Next 在跳转落地时写入浏览器历史（只改查询参数时 pathname 不变，也会写）。
 * 包一层发出「已落地」信号；整个页面只包一次，也不还原，免得拆掉 Next 自己的包装。
 */
function watchHistory() {
  const w = window as Window & { __blogHistoryWatched?: boolean };
  if (w.__blogHistoryWatched) return;
  w.__blogHistoryWatched = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      original.apply(this, args);
      window.dispatchEvent(new Event(COMMIT));
    };
  }
}

/** 点击的是不是站内另一页的链接（新窗口、下载、锚点、组合键都不算） */
function isPageLink(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const link = (e.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return false;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
  const url = new URL(link.href, location.href);
  return (
    url.origin === location.origin &&
    (url.pathname !== location.pathname || url.search !== location.search)
  );
}

/** 站内跳转时顶部的细进度线：跳转很快就不出现，慢了才淡入，落地后走满再收起 */
export function NavProgress() {
  const pathname = usePathname();
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const settle = useRef<() => void>(() => {});

  useEffect(() => {
    const el = track.current;
    const fill = bar.current;
    if (!el || !fill) return;
    watchHistory();
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let running = false;
    let anims: Animation[] = [];
    let guard: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      for (const a of anims) a.cancel();
      anims = [];
    };

    const start = () => {
      clear();
      running = true;
      clearTimeout(guard);
      // 跳转没有落地（被取消、点到同一页）时，最多等 12 秒自己收起
      guard = setTimeout(finish, 12_000);
      anims = [
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          delay: 120,
          easing: "ease-out",
          fill: "forwards",
        }),
        fill.animate(
          still.matches
            ? [{ transform: "translateX(-40%)" }, { transform: "translateX(-40%)" }]
            : [{ transform: "translateX(-100%)" }, { transform: "translateX(-6%)" }],
          {
            duration: 9000,
            delay: 120,
            easing: "cubic-bezier(0.08, 0.7, 0.12, 1)",
            fill: "forwards",
          },
        ),
      ];
    };

    function finish() {
      if (!running) return;
      running = false;
      clearTimeout(guard);
      const shown = Number(getComputedStyle(el!).opacity) > 0.02;
      const from = getComputedStyle(fill!).transform;
      clear();
      // 还没来得及淡入就落地了：什么都不画
      if (!shown) return;
      const fade = el!.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 280,
        delay: 160,
        easing: "ease",
        fill: "both",
      });
      anims = [
        fill!.animate([{ transform: from }, { transform: "translateX(0)" }], {
          duration: 240,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        }),
        fade,
      ];
      fade.onfinish = () => {
        if (!running) clear();
      };
    }

    // 落地信号可能在 React 提交过程中同步发出，挪到下一帧再处理
    settle.current = () => requestAnimationFrame(finish);
    const onClick = (e: MouseEvent) => {
      if (isPageLink(e)) start();
    };
    const onCommit = () => settle.current();
    document.addEventListener("click", onClick, true);
    window.addEventListener(START, start);
    window.addEventListener(COMMIT, onCommit);
    return () => {
      clearTimeout(guard);
      clear();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START, start);
      window.removeEventListener(COMMIT, onCommit);
    };
  }, []);

  useEffect(() => {
    settle.current();
  }, [pathname]);

  return (
    <div ref={track} aria-hidden className="nav-progress">
      <div ref={bar} className="nav-progress-bar" />
    </div>
  );
}
