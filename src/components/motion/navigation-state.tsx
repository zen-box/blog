"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

let navigated = false;
const listeners = new Set<() => void>();

function markNavigated() {
  if (navigated) return;
  navigated = true;
  listeners.forEach((listener) => listener());
}

/**
 * 站内导航时由 <ViewTransition> 负责转场；只有首次加载页面时
 * 才播放逐个入场动画，避免两套动画叠加（也避免共享元素变形后闪烁）。
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  // 点站内链接、前进后退时立刻记下：新页面挂载时就已经知道是站内导航，
  // 第一次导航也不会再播一遍入场动画（只靠 pathname 变化要等新页面挂载之后）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname !== location.pathname) markNavigated();
    };
    document.addEventListener("click", onClick, true);
    addEventListener("popstate", markNavigated);
    return () => {
      document.removeEventListener("click", onClick, true);
      removeEventListener("popstate", markNavigated);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    markNavigated();
  }, [pathname]);
  return null;
}

/** 组件挂载时是否已经发生过站内导航 */
export function useArrivedByNavigation(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => navigated,
    () => false,
  );
}
