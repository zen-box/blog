import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { musicTracks } from "@/db/music-schema";
import { safeMediaUrl, type MusicConfig, type MusicTrack } from "@/lib/music";
import { MAX_UPLOAD_BYTES, saveUpload } from "./media";
import { resolveUploadUrl } from "./storage";

export const musicConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    defaultVolume: z.number().min(0).max(1).default(0.2),
    showOnMobile: z.boolean().default(true),
  })
  .strict();
const mediaUrl = z.string().trim().max(2000).refine(safeMediaUrl, "请输入有效的音频或图片地址");
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => !value || safeMediaUrl(value), "请输入有效的链接")
  .default("");
export const musicTrackSchema = z
  .object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().max(200).default(""),
    album: z.string().trim().max(200).default(""),
    audioUrl: mediaUrl,
    coverUrl: optionalUrl,
    lyrics: z.string().max(100000).default(""),
    sourceUrl: optionalUrl,
    license: z.string().trim().max(200).default(""),
    licenseUrl: optionalUrl,
    duration: z.number().finite().min(0).max(86400).default(0),
    enabled: z.boolean().default(true),
    sortOrder: z.number().int().min(-100000).max(100000).default(0),
  })
  .strict();
export class MusicError extends Error {}
export function getMusicConfig(): MusicConfig {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "music")).get();
  const result = musicConfigSchema.safeParse(row?.value ?? {});
  return result.success ? result.data : musicConfigSchema.parse({});
}
export function saveMusicConfig(raw: unknown) {
  const value = musicConfigSchema.parse(raw);
  db.insert(schema.settings)
    .values({ key: "music", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })
    .run();
  return value;
}
export function listMusic(publicOnly = false): MusicTrack[] {
  const rows = db
    .select()
    .from(musicTracks)
    .where(publicOnly ? eq(musicTracks.enabled, true) : undefined)
    .orderBy(asc(musicTracks.sortOrder), asc(musicTracks.id))
    .all();
  return rows.map(
    ({
      id,
      title,
      artist,
      album,
      audioUrl,
      coverUrl,
      lyrics,
      sourceUrl,
      license,
      licenseUrl,
      duration,
      enabled,
      sortOrder,
    }) => ({
      id,
      title,
      artist,
      album,
      lyrics,
      sourceUrl,
      license,
      licenseUrl,
      duration,
      enabled,
      sortOrder,
      audioUrl: publicOnly ? resolveUploadUrl(audioUrl) : audioUrl,
      coverUrl: publicOnly ? resolveUploadUrl(coverUrl) : coverUrl,
    }),
  );
}
export function getPublicMusic() {
  const config = getMusicConfig();
  return { config, tracks: config.enabled ? listMusic(true) : [] };
}
export function saveMusicTrack(raw: unknown) {
  const { id, ...values } = musicTrackSchema.parse(raw);
  if (id) {
    if (!db.select({ id: musicTracks.id }).from(musicTracks).where(eq(musicTracks.id, id)).get())
      throw new MusicError("曲目不存在");
    db.update(musicTracks)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(musicTracks.id, id))
      .run();
    return id;
  }
  return db.insert(musicTracks).values(values).returning({ id: musicTracks.id }).get().id;
}
export function deleteMusicTrack(id: number) {
  db.delete(musicTracks).where(eq(musicTracks.id, id)).run();
}
export function reorderMusic(ids: number[]) {
  const all = listMusic();
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== all.length ||
    ids.some((id) => !all.some((track) => track.id === id))
  )
    throw new MusicError("播放列表已变化，请刷新后重新排序");
  db.transaction((tx) =>
    ids.forEach((id, sortOrder) =>
      tx
        .update(musicTracks)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(musicTracks.id, id))
        .run(),
    ),
  );
}
export async function uploadMusic(file: File) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES)
    throw new MusicError("音频文件大小须为 1 字节至 30MB");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (!["mp3", "m4a", "ogg"].includes(ext ?? ""))
    throw new MusicError("请选择 mp3、m4a 或 ogg 音频");
  const mime = ext === "m4a" ? "audio/mp4" : ext === "ogg" ? "audio/ogg" : "audio/mpeg";
  const buffer = Buffer.from(await file.arrayBuffer());
  const { parseBuffer } = await import("music-metadata");
  let metadata;
  try {
    metadata = await parseBuffer(
      buffer,
      { mimeType: mime, size: buffer.length },
      { duration: true },
    );
  } catch {
    throw new MusicError("无法读取音频，请选择有效的 mp3、m4a 或 ogg 文件");
  }
  if (!metadata.format.container) throw new MusicError("无法识别音频格式");
  const saved = await saveUpload(buffer, file.name, mime, { raw: true });
  const picture = metadata.common.picture?.find(
    (image) =>
      ["image/jpeg", "image/png", "image/webp"].includes(image.format) &&
      image.data.byteLength <= 5 * 1024 * 1024,
  );
  let coverUrl = "";
  if (picture)
    coverUrl = (await saveUpload(Buffer.from(picture.data), "音乐封面", picture.format)).url;
  const lyrics =
    metadata.common.lyrics
      ?.map((lyric) => lyric.text ?? "")
      .filter(Boolean)
      .join("\n") ?? "";
  return {
    title: metadata.common.title || file.name.replace(/\.[^.]+$/, ""),
    artist: metadata.common.artist || "",
    album: metadata.common.album || "",
    audioUrl: saved.url,
    coverUrl,
    lyrics,
    duration: Math.min(86400, Math.max(0, metadata.format.duration || 0)),
  };
}
