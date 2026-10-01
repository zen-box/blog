"use client";
import { safeMediaUrl, type PlayerTrack } from "@/lib/music";
/** 同时兼容旧缓存中的原生 audio；移除 src 后由共享播放器接管。 */
export function setupArticleAudio(root: HTMLElement) {
  for (const audio of root.querySelectorAll<HTMLAudioElement>("audio")) {
    const src =
      audio.getAttribute("src") || audio.querySelector("source")?.getAttribute("src") || "";
    if (!safeMediaUrl(src)) {
      audio.remove();
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "not-prose inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm text-foreground transition-colors hover:bg-muted";
    button.dataset.audioSrc = src;
    button.dataset.audioTitle = audio.getAttribute("title") || "文章音频";
    button.textContent = "▶ 播放音频";
    button.setAttribute("aria-label", "播放文章音频");
    audio.pause();
    audio.removeAttribute("src");
    audio.replaceWith(button);
  }
  const click = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-audio-src]",
    );
    if (!button || !root.contains(button)) return;
    const audioUrl = button.dataset.audioSrc!;
    if (!safeMediaUrl(audioUrl)) return;
    const track: PlayerTrack = {
      id: `article:${audioUrl}`,
      title: button.dataset.audioTitle || "文章音频",
      audioUrl,
      artist: "",
      album: "",
      coverUrl: "",
      lyrics: "",
      sourceUrl: location.href,
      license: "",
      licenseUrl: "",
      duration: 0,
      enabled: true,
      sortOrder: 0,
    };
    window.dispatchEvent(new CustomEvent("blog:play-audio", { detail: track }));
  };
  const state = (event: Event) => {
    const detail = (event as CustomEvent<{ audioUrl?: string; playing: boolean }>).detail;
    for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-audio-src]")) {
      const playing = detail.audioUrl === button.dataset.audioSrc && detail.playing;
      button.textContent = playing ? "Ⅱ 暂停音频" : "▶ 播放音频";
      button.setAttribute("aria-label", playing ? "暂停文章音频" : "播放文章音频");
      button.setAttribute("aria-pressed", String(playing));
    }
  };
  root.addEventListener("click", click);
  window.addEventListener("blog:audio-state", state);
  return () => {
    root.removeEventListener("click", click);
    window.removeEventListener("blog:audio-state", state);
  };
}
