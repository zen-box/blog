"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

let navigated = false;
const listeners = new Set<() => void>();

/**
 * 站内导航时由 <ViewTransition> 负责转场；只有首次加载页面时
 * 才播放逐个入场动画，避免两套动画叠加（也避免共享元素变形后闪烁）。
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    navigated = true;
    listeners.forEach((listener) => listener());
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
