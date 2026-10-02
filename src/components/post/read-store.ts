"use client";

import { useMemo, useSyncExternalStore } from "react";

/** 读过的文章（读到大半就算），保存在本机，用来显示系列的阅读进度 */
const KEY = "blog-read-v1";

const subscribe = (callback: () => void) => {
  addEventListener("storage", callback);
  addEventListener("blog:read", callback);
  return () => {
    removeEventListener("storage", callback);
    removeEventListener("blog:read", callback);
  };
};
const snapshot = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

function parse(raw: string | null): number[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
}

export function useReadPosts() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => new Set(parse(raw)), [raw]);
}

export function markRead(id: number) {
  const list = parse(snapshot());
  if (list.includes(id)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, id].slice(-500)));
    dispatchEvent(new Event("blog:read"));
  } catch {}
}
