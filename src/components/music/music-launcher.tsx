"use client";
import dynamic from "next/dynamic";
import { Music2Icon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  safeMediaUrl,
  readPlayback,
  type MusicConfig,
  type MusicTrack,
  type PlayerTrack,
} from "@/lib/music";
export type AudioRequest = { track: PlayerTrack; nonce: number };
const Player = dynamic(() => import("./music-player"), {
  ssr: false,
  loading: () => (
    <span
      role="status"
      className="fixed bottom-6 left-5 z-40 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-float"
    >
      正在打开播放器…
    </span>
  ),
});
const subscribeStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};
const getStorage = () => {
  try {
    return localStorage.getItem("blog-music-playback-v1");
  } catch {
    return null;
  }
};
export function MusicLauncher({ config, tracks }: { config: MusicConfig; tracks: MusicTrack[] }) {
  const [loaded, setLoaded] = useState(false),
    [request, setRequest] = useState<AudioRequest | null>(null);
  const raw = useSyncExternalStore(subscribeStorage, getStorage, () => null);
  const saved = readPlayback(raw);
  useEffect(() => {
    const play = (event: Event) => {
      const track = (event as CustomEvent<PlayerTrack>).detail;
      if (!track || !safeMediaUrl(track.audioUrl)) return;
      setRequest({ track, nonce: Date.now() });
      setLoaded(true);
    };
    window.addEventListener("blog:play-audio", play);
    return () => window.removeEventListener("blog:play-audio", play);
  }, []);
  if (loaded) return <Player config={config} tracks={tracks} saved={saved} request={request} />;
  if (!config.enabled || !tracks.length) return null;
  return (
    <button
      type="button"
      aria-label="打开音乐播放器"
      onClick={() => setLoaded(true)}
      className={`fixed bottom-6 left-5 z-40 max-w-[13rem] items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm text-foreground shadow-float backdrop-blur transition-colors hover:bg-muted ${config.showOnMobile ? "inline-flex" : "hidden sm:inline-flex"}`}
    >
      <Music2Icon className="size-4 text-brand" />
      <span>
        {saved && tracks.some((track) => track.id === saved.trackId) ? "继续播放" : "轻音乐"}
      </span>
    </button>
  );
}
