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
  error: string;
};
const STORAGE = "blog-music-playback-v1";
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
      else this.update({ playing: false, loading: false });
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
    window.dispatchEvent(
      new CustomEvent("blog:audio-state", {
        detail: { audioUrl: this.snapshot.track?.audioUrl, playing: this.snapshot.playing },
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
    const startAt = position ?? (this.snapshot.track?.id === track.id ? this.snapshot.position : 0);
    this.update({ track, loading: true, error: "", position: startAt });
    this.audio.loop = typeof track.id === "number" && this.snapshot.mode === "single";
    if (changed) {
      this.pendingSeek = startAt;
      this.audio.src = track.audioUrl;
    } else if (this.audio.readyState >= 1 && startAt >= 0)
      this.audio.currentTime = Math.min(startAt, Math.max(0, this.audio.duration - 0.05));
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
