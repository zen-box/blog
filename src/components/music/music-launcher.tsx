"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  safeMediaUrl,
  readPlayback,
  type MusicConfig,
  type MusicTrack,
  type PlayerTrack,
} from "@/lib/music";

import { MusicCapsule } from "./music-capsule";
/** position 有值时从这里开始播放（例如「从这一段听」），否则同一首再点一次就暂停 */
export type AudioRequest = { track: PlayerTrack; nonce: number; position?: number };
const Player = dynamic(() => import("./music-player"), {
  ssr: false,
  loading: () => <MusicCapsule title="轻音乐" subtitle="正在打开…" aria-busy="true" disabled />,
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
      const detail = (event as CustomEvent<PlayerTrack & { position?: number }>).detail;
      if (!detail || !safeMediaUrl(detail.audioUrl)) return;
      const { position, ...track } = detail;
      setRequest({ track, nonce: Date.now(), position });
      setLoaded(true);
    };
    window.addEventListener("blog:play-audio", play);
    return () => window.removeEventListener("blog:play-audio", play);
  }, []);
  if (loaded) return <Player config={config} tracks={tracks} saved={saved} request={request} />;
  if (!config.enabled || !tracks.length) return null;
  const last = saved ? tracks.find((track) => track.id === saved.trackId) : undefined;
  return (
    <MusicCapsule
      aria-label="打开音乐播放器"
      onClick={() => setLoaded(true)}
      title={last ? last.title : "轻音乐"}
      subtitle={last ? "继续播放" : "陪你读一会儿"}
      cover={last?.coverUrl || undefined}
      progress={last && last.duration ? (saved?.position ?? 0) / last.duration : 0}
      className={config.showOnMobile ? undefined : "max-sm:hidden"}
    />
  );
}
