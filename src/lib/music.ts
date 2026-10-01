export type PlayMode = "list" | "single" | "shuffle";
export type MusicConfig = { enabled: boolean; defaultVolume: number; showOnMobile: boolean };
export type MusicTrack = {
  id: number;
  title: string;
  artist: string;
  album: string;
  audioUrl: string;
  coverUrl: string;
  lyrics: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  duration: number;
  enabled: boolean;
  sortOrder: number;
};
export type PlayerTrack = Omit<MusicTrack, "id"> & { id: number | string };
export type SavedPlayback = { trackId: number; position: number; volume: number; mode: PlayMode };
export type LyricLine = { time: number; text: string };

export function safeMediaUrl(raw: string): boolean {
  if (/^\/uploads\/[^?#]+$/.test(raw) && !raw.includes("\\") && !raw.split("/").includes(".."))
    return true;
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function parseLrc(source: string): LyricLine[] {
  const offset = Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const out: LyricLine[] = [];
  for (const line of source.split(/\r?\n/)) {
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const match of line.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
      const time = Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? 0}`) + offset;
      if (Number(match[2]) < 60) out.push({ time: Math.max(0, time), text });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
export function lyricAt(lines: LyricLine[], position: number): number {
  let from = 0,
    to = lines.length - 1,
    result = -1;
  while (from <= to) {
    const at = Math.floor((from + to) / 2);
    if (lines[at].time <= position) {
      result = at;
      from = at + 1;
    } else to = at - 1;
  }
  return result;
}
export function nextTrackIndex(
  length: number,
  current: number,
  mode: PlayMode,
  direction = 1,
  random = Math.random(),
): number {
  if (!length) return -1;
  if (mode === "single") return Math.max(0, current);
  if (mode === "shuffle" && length > 1) {
    const choice = Math.min(length - 2, Math.floor(Math.max(0, random) * (length - 1)));
    return choice >= current ? choice + 1 : choice;
  }
  return (current + direction + length) % length;
}
export function readPlayback(raw: string | null): SavedPlayback | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      !value ||
      !Number.isSafeInteger(value.trackId) ||
      value.trackId <= 0 ||
      !Number.isFinite(value.position) ||
      value.position < 0 ||
      !Number.isFinite(value.volume) ||
      value.volume < 0 ||
      value.volume > 1 ||
      !["list", "single", "shuffle"].includes(value.mode)
    )
      return null;
    return {
      trackId: value.trackId,
      position: value.position,
      volume: value.volume,
      mode: value.mode,
    };
  } catch {
    return null;
  }
}
export function audioTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
