"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const KEY = "theme";
const MEDIA = "(prefers-color-scheme: dark)";

const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('${MEDIA}').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

/**
 * 在 <head> 中同步执行，首帧绘制前就设置好明暗。
 * 只在服务端输出：注水时 React 会跳过 <head> 里多出的标签；
 * 浏览器端渲染（例如 404 页）时不再生成一个不会执行的 <script>。
 */
export function ThemeScript() {
  if (typeof window !== "undefined") return null;
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}

const listeners = new Set<() => void>();

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribeStored(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const systemTheme = (): Resolved => (matchMedia(MEDIA).matches ? "dark" : "light");

function subscribeSystem(cb: () => void) {
  const m = matchMedia(MEDIA);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

function apply(resolved: Resolved) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeStored, readStored, () => "system" as Theme);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => undefined);
  const resolvedTheme: Resolved | undefined = theme === "system" ? system : theme;

  /** 同步修改 DOM，方便在 View Transition 回调中使用 */
  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* 隐私模式等情况下无法写入 */
    }
    apply(next === "system" ? systemTheme() : next);
    listeners.forEach((l) => l());
  }, []);

  return { theme, resolvedTheme, setTheme };
}

/** 跟随系统时，系统切换明暗后同步页面；多个标签页之间也保持一致 */
export function ThemeSync() {
  const { resolvedTheme } = useTheme();
  useLayoutEffect(() => {
    if (resolvedTheme) apply(resolvedTheme);
  }, [resolvedTheme]);
  return null;
}
