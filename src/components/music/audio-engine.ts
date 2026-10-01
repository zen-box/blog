"use client";
import {
  nextTrackIndex,
  type MusicConfig,
  type MusicTrack,
  type PlayerTrack,
  type PlayMode,
  type SavedPlayback,
} from "@/lib/music";

export type AudioSnapshot = {
  track: PlayerTrack | null;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  mode: PlayMode;
  /** 倍速（只用于朗读、播客等人声，音乐始终原速） */
  rate: number;
  error: string;
};
/** 全局播放状态，文章页的收听条靠它同步进度 */
export type AudioStateDetail = {
  id: string | number | null;
  audioUrl?: string;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  rate: number;
};
/** 文章页发给播放器的控制指令，只对当前正在放的音频生效 */
export type AudioControlDetail = {
  url: string;
  action: "toggle" | "seek" | "skip" | "rate";
  value?: number;
};
const STORAGE = "blog-music-playback-v1";
const RATE_KEY = "blog-audio-rate-v1";
export const PROGRESS_KEY = "blog-audio-progress-v1";
/** 朗读、播客、文章里的音频（id 是字符串）；音乐曲目的 id 是数字 */
const spoken = (track: PlayerTrack | null | undefined) => !!track && typeof track.id === "string";

type Progress = Record<string, { position: number; at: number }>;
export function readProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function savedRate() {
  try {
    const rate = Number(localStorage.getItem(RATE_KEY));
    return rate >= 0.5 && rate <= 3 ? rate : 1;
  } catch {
    return 1;
  }
}
export class AudioEngine {
  readonly audio: HTMLAudioElement;
  private snapshot: AudioSnapshot;
  private listeners = new Set<() => void>();
  private tracks: MusicTrack[];
  private operation = 0;
  private fadeId = 0;
  private pendingSeek = 0;
  private lastPersist = 0;
  private saved: SavedPlayback | null;
  constructor(config: MusicConfig, tracks: MusicTrack[], saved: SavedPlayback | null) {
    this.tracks = tracks;
    this.saved = saved;
    const track = tracks.find((item) => item.id === saved?.trackId) ?? tracks[0] ?? null;
    this.snapshot = {
      track,
      playing: false,
      loading: false,
      position: saved && track?.id === saved.trackId ? saved.position : 0,
      duration: track?.duration ?? 0,
      volume: saved?.volume ?? config.defaultVolume,
      mode: saved?.mode ?? "list",
      rate: 1,
      error: "",
    };
    this.audio = document.createElement("audio");
    this.audio.dataset.globalAudio = "";
    this.audio.preload = "none";
    this.audio.hidden = true;
    this.audio.volume = this.snapshot.volume;
    document.body.append(this.audio);
    this.audio.addEventListener("timeupdate", () => {
      this.update({ position: this.audio.currentTime });
      if (Date.now() - this.lastPersist > 1000) this.persist();
    });
    this.audio.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(this.audio.duration)
        ? this.audio.duration
        : (this.snapshot.track?.duration ?? 0);
      if (this.pendingSeek) {
        this.audio.currentTime = Math.min(this.pendingSeek, Math.max(0, duration - 0.05));
        this.pendingSeek = 0;
      }
      this.update({ duration, position: this.audio.currentTime });
      this.positionState();
    });
    this.audio.addEventListener("play", () => this.update({ playing: true, error: "" }));
    this.audio.addEventListener("pause", () => {
      this.update({ playing: false });
      this.persist();
    });
    this.audio.addEventListener("waiting", () => this.update({ loading: true }));
    this.audio.addEventListener("playing", () => this.update({ playing: true, loading: false }));
    this.audio.addEventListener("error", () =>
      this.update({
        playing: false,
        loading: false,
        error: "暂时无法播放这段音频，请重试或换一首",
      }),
    );
    this.audio.addEventListener("ended", () => {
      if (typeof this.snapshot.track?.id === "number") void this.next(1, true);
      else {
        // 听完了：下次从头开始
        this.forget(this.snapshot.track?.audioUrl);
        this.update({ playing: false, loading: false, position: 0 });
      }
    });
    window.addEventListener("blog:audio-control", (event) => {
      const detail = (event as CustomEvent<AudioControlDetail>).detail;
      if (!detail || detail.url !== this.snapshot.track?.audioUrl) return;
      if (detail.action === "toggle") this.toggle();
      else if (detail.action === "seek") this.seek(detail.value ?? 0);
      else if (detail.action === "skip") this.seek(this.snapshot.position + (detail.value ?? 0));
      else if (detail.action === "rate") this.setRate(detail.value ?? 1);
    });
    window.addEventListener("pagehide", () => this.persist());
    this.setupMediaSession();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<AudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
    const { track, playing, loading, position, duration, rate } = this.snapshot;
    window.dispatchEvent(
      new CustomEvent<AudioStateDetail>("blog:audio-state", {
        detail: {
          id: track?.id ?? null,
          audioUrl: track?.audioUrl,
          playing,
          loading,
          position,
          duration,
          rate,
        },
      }),
    );
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = this.snapshot.playing ? "playing" : "paused";
  }
  configure(tracks: MusicTrack[], config: MusicConfig) {
    this.tracks = tracks;
    this.setupMediaSession();
    if (
      typeof this.snapshot.track?.id === "number" &&
      (!tracks.some((track) => track.id === this.snapshot.track!.id) || !config.enabled)
    ) {
      this.pause(false);
      this.audio.removeAttribute("src");
      this.audio.load();
      this.update({ track: tracks[0] ?? null, position: 0, duration: tracks[0]?.duration ?? 0 });
    }
  }
  private async fade(target: number, token: number) {
    const fadeId = ++this.fadeId,
      from = this.audio.volume,
      started = performance.now();
    return new Promise<void>((resolve) => {
      const step = (time: number) => {
        if (fadeId !== this.fadeId || token !== this.operation) {
          resolve();
          return;
        }
        const progress = Math.min(1, (time - started) / 260);
        this.audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  async play(track = this.snapshot.track, position?: number) {
    if (!track) return;
    const token = ++this.operation;
    const changed = this.audio.getAttribute("src") !== track.audioUrl;
    if (changed && !this.audio.paused) {
      await this.fade(0, token);
      if (token !== this.operation) return;
      this.audio.pause();
    }
    for (const media of document.querySelectorAll<HTMLMediaElement>("audio,video"))
      if (media !== this.audio && !media.muted) media.pause();
    const same = this.snapshot.track?.id === track.id;
    // 朗读、播客从上次听到的地方继续（快听完的从头开始）
    const resume = spoken(track) ? (readProgress()[track.audioUrl]?.position ?? 0) : 0;
    const startAt = position ?? (same ? this.snapshot.position : resume);
    const rate = spoken(track) ? savedRate() : 1;
    this.update({ track, loading: true, error: "", position: startAt, rate });
    this.audio.loop = typeof track.id === "number" && this.snapshot.mode === "single";
    if (changed) {
      this.pendingSeek = startAt;
      this.audio.src = track.audioUrl;
    } else if (this.audio.readyState >= 1 && startAt >= 0)
      this.audio.currentTime = Math.min(startAt, Math.max(0, this.audio.duration - 0.05));
    // 换 src 会把倍速重置为 defaultPlaybackRate
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
    this.audio.volume = 0;
    this.setMetadata(track);
    try {
      await this.audio.play();
      if (token !== this.operation) return;
      this.update({ loading: false });
      await this.fade(this.snapshot.volume, token);
      this.persist();
    } catch {
      if (token === this.operation)
        this.update({
          playing: false,
          loading: false,
          error: "未能开始播放，请再次点击播放或换一首",
        });
    }
  }
  pause(fade = true) {
    const token = ++this.operation;
    const finish = () => {
      if (token !== this.operation) return;
      this.audio.pause();
      this.audio.volume = this.snapshot.volume;
      this.update({ playing: false, loading: false });
      this.persist();
    };
    if (fade && !this.audio.paused) void this.fade(0, token).then(finish);
    else finish();
  }
  toggle() {
    if (this.snapshot.playing || this.snapshot.loading) this.pause();
    else void this.play();
  }
  async next(direction = 1, ended = false) {
    if (!this.tracks.length) {
      this.pause(false);
      return;
    }
    const current = this.tracks.findIndex((track) => track.id === this.snapshot.track?.id);
    const mode = ended
      ? this.snapshot.mode
      : this.snapshot.mode === "single"
        ? "list"
        : this.snapshot.mode;
    const index = current < 0 ? 0 : nextTrackIndex(this.tracks.length, current, mode, direction);
    await this.play(this.tracks[index], 0);
  }
  setVolume(volume: number) {
    ++this.fadeId;
    volume = Math.max(0, Math.min(1, volume));
    this.audio.volume = volume;
    this.update({ volume });
    this.persist();
  }
  setRate(rate: number) {
    if (!spoken(this.snapshot.track)) return;
    rate = Math.max(0.5, Math.min(3, rate));
    this.audio.defaultPlaybackRate = rate;
    this.audio.playbackRate = rate;
    this.update({ rate });
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {}
    this.positionState();
  }
  private forget(url?: string) {
    if (!url) return;
    const progress = readProgress();
    if (!(url in progress)) return;
    delete progress[url];
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {}
  }
  setMode(mode: PlayMode) {
    this.audio.loop = mode === "single" && typeof this.snapshot.track?.id === "number";
    this.update({ mode });
    this.persist();
  }
  seek(position: number) {
    position = Math.max(0, Math.min(position, this.snapshot.duration));
    if (this.audio.readyState < 1) {
      this.pendingSeek = position;
      this.update({ position });
      this.persist();
      return;
    }
    this.audio.currentTime = position;
    this.update({ position: this.audio.currentTime });
    this.positionState();
    this.persist();
  }
  suspend() {
    this.pause(false);
    if ("mediaSession" in navigator) {
      for (const action of [
        "play",
        "pause",
        "stop",
        "previoustrack",
        "nexttrack",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as MediaSessionAction[]) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
      navigator.mediaSession.metadata = null;
    }
  }
  private persist() {
    const state = this.snapshot;
    // 朗读、播客按地址记住听到哪里；只留最近 30 条
    if (spoken(state.track) && state.track!.audioUrl) {
      const url = state.track!.audioUrl;
      const progress = readProgress();
      if (state.position > 5 && (!state.duration || state.position < state.duration - 5))
        progress[url] = { position: Math.floor(state.position), at: Date.now() };
      else delete progress[url];
      const recent = Object.entries(progress)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, 30);
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(recent)));
      } catch {}
    }
    if (typeof state.track?.id === "number")
      this.saved = {
        trackId: state.track.id,
        position: state.position,
        volume: state.volume,
        mode: state.mode,
      };
    else if (this.saved) this.saved = { ...this.saved, volume: state.volume, mode: state.mode };
    if (this.saved) {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(this.saved));
      } catch {}
    }
    this.lastPersist = Date.now();
    this.positionState();
  }
  private positionState() {
    if (
      "mediaSession" in navigator &&
      navigator.mediaSession.setPositionState &&
      this.snapshot.duration > 0
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: this.snapshot.duration,
          playbackRate: this.audio.playbackRate,
          position: Math.min(this.snapshot.position, this.snapshot.duration),
        });
      } catch {}
    }
  }
  private setMetadata(track: PlayerTrack) {
    if ("mediaSession" in navigator && "MediaMetadata" in window)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.coverUrl ? [{ src: track.coverUrl }] : [],
      });
  }
  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => void this.play(),
      pause: () => this.pause(),
      stop: () => {
        this.pause();
        this.seek(0);
      },
      previoustrack: () => void this.next(-1),
      nexttrack: () => void this.next(1),
      seekbackward: (detail) => this.seek(this.snapshot.position - (detail.seekOffset ?? 10)),
      seekforward: (detail) => this.seek(this.snapshot.position + (detail.seekOffset ?? 10)),
      seekto: (detail) => {
        if (detail.seekTime !== undefined) this.seek(detail.seekTime);
      },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler!);
      } catch {}
    }
  }
}
let singleton: AudioEngine | null = null;
export function getAudioEngine(
  config: MusicConfig,
  tracks: MusicTrack[],
  saved: SavedPlayback | null,
) {
  return (singleton ??= new AudioEngine(config, tracks, saved));
}
