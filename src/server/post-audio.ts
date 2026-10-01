import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, getSqlite, schema } from "@/db";
import { postAudio } from "@/db/audio-schema";
import type { ReaderJobView } from "@/lib/reader-ai";
import {
  type AudioKind,
  type AudioSegment,
  type PodcastLine,
  type PublicPostAudio,
  type TimelineEntry,
  narrationSegments,
  parsePodcastScript,
  podcastSegments,
} from "@/lib/post-audio";

import { AiError } from "./ai";
import { assemble, encodeMp3 } from "./audio-mix";
import {
  type BackgroundJob,
  cancelQueuedJobs,
  getJob,
  insertJob,
  listJobs,
  publicJob,
  retryJob,
} from "./background-jobs";
import { deleteMedia, saveUpload } from "./media";
import { readerContentHash } from "./reader-ai";
import { resolveUploadUrl } from "./storage";
import { pruneTtsCache, resolveVoice, synthesize } from "./tts";
import { BUILTIN_VOICES, getTtsConfig, ttsKey } from "./tts-config";

const kindSchema = z.enum(["narration", "podcast"]);
const postIdSchema = z.number().int().positive();
export const audioOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("synthesize"), postId: postIdSchema, kind: kindSchema }).strict(),
  z
    .object({ op: z.literal("savePodcast"), postId: postIdSchema, script: z.string().max(60000) })
    .strict(),
  z.object({ op: z.literal("remove"), postId: postIdSchema, kind: kindSchema }).strict(),
]);

const AUDIO_TYPES = new Set<string>(["narration", "podcast"]);
export const isAudioJob = (type: string) => AUDIO_TYPES.has(type);

function requirePost(postId: number) {
  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post || post.type !== "post") throw new AiError("文章不存在或不是普通文章", 404);
  return post;
}
const rowOf = (postId: number, kind: AudioKind) =>
  db
    .select()
    .from(postAudio)
    .where(and(eq(postAudio.postId, postId), eq(postAudio.kind, kind)))
    .get();
function ensureRow(postId: number, kind: AudioKind) {
  db.insert(postAudio).values({ postId, kind }).onConflictDoNothing().run();
  return rowOf(postId, kind)!;
}
const whereRow = (postId: number, kind: AudioKind) =>
  and(eq(postAudio.postId, postId), eq(postAudio.kind, kind));

function requireReady() {
  if (!getTtsConfig().enabled) throw new AiError("文章朗读未开启，请先在「AI 助手」里开启", 400);
  if (!ttsKey().key) throw new AiError("请先在「AI 助手」里配置语音服务的密钥", 400);
}

/* ------------------------------------------------------------------ */
/* 后台                                                                   */
/* ------------------------------------------------------------------ */

export type AudioAdminView = {
  audioUrl: string | null;
  duration: number;
  updatedAt: number | null;
  /** 正文在合成之后改过 */
  stale: boolean;
  progress: number;
  total: number;
};
export type AudioAdminState = {
  postId: number;
  contentHash: string;
  enabled: boolean;
  ready: boolean;
  narratorVoice: string;
  hosts: string[];
  narration: AudioAdminView;
  podcast: AudioAdminView & { lines: PodcastLine[]; script: string };
  jobs: ReaderJobView[];
};

const voiceName = (ref: string) => {
  if (!ref.startsWith("custom:")) return BUILTIN_VOICES.find((v) => v.id === ref)?.name ?? ref;
  return getTtsConfig().voices.find((v) => `custom:${v.id}` === ref)?.name ?? "自定义音色";
};

function view(row: typeof postAudio.$inferSelect | undefined, hash: string): AudioAdminView {
  return {
    audioUrl: row?.audioUrl ?? null,
    duration: row?.duration ?? 0,
    updatedAt: row?.updatedAt ?? null,
    stale: Boolean(row?.audioUrl && row.contentHash !== hash),
    progress: row?.progress ?? 0,
    total: row?.total ?? 0,
  };
}

export function getAudioAdminState(postId: number): AudioAdminState {
  const post = requirePost(postId);
  const hash = readerContentHash(post.content);
  const config = getTtsConfig();
  const hosts = config.hosts.map((host) => host.name);
  const podcast = rowOf(postId, "podcast");
  const lines = podcast?.lines ?? [];
  return {
    postId,
    contentHash: hash,
    enabled: config.enabled,
    ready: config.enabled && Boolean(ttsKey().key),
    narratorVoice: voiceName(config.narrator.voice),
    hosts,
    narration: view(rowOf(postId, "narration"), hash),
    podcast: {
      ...view(podcast, hash),
      lines,
      script: lines.map((line) => `${hosts[line.speaker] ?? hosts[0]}：${line.text}`).join("\n"),
    },
    jobs: listJobs(postId, 30)
      .filter((job) => isAudioJob(job.type))
      .map(publicJob),
  };
}

/** 给 AI 写播客稿用的正文：只要能念的文字 */
export async function audioProse(postId: number) {
  const post = requirePost(postId);
  const { renderMarkdown } = await import("@/lib/markdown");
  const { speech } = await renderMarkdown(post.content);
  return {
    title: post.title,
    prose: speech
      .filter((block) => block.kind !== "note")
      .map((block) => (block.kind === "heading" ? `\n## ${block.text}` : block.text))
      .join("\n")
      .trim(),
  };
}

export function savePodcastScript(postId: number, script: string) {
  requirePost(postId);
  const hosts = getTtsConfig().hosts.map((host) => host.name);
  const lines = parsePodcastScript(script, hosts);
  if (lines.length > 400) throw new AiError("播客稿太长，最多 400 句", 400);
  if (lines.some((line) => line.text.length > 1000))
    throw new AiError("有一句台词超过 1000 字，请拆开", 400);
  ensureRow(postId, "podcast");
  db.update(postAudio)
    .set({ lines, linesUpdatedAt: Date.now() })
    .where(whereRow(postId, "podcast"))
    .run();
  return getAudioAdminState(postId);
}

/** 请求合成（管理员操作或文章更新后自动刷新）；同类的旧任务作废 */
export function enqueueAudio(
  postId: number,
  kind: AudioKind,
  authorization: "admin" | "auto" = "admin",
) {
  requireReady();
  return getSqlite()
    .transaction(() => {
      const post = requirePost(postId);
      const current = ensureRow(postId, kind);
      if (kind === "podcast" && !current.lines?.length)
        throw new AiError("先写好并保存播客稿", 400);
      const revision = current.revision + 1;
      db.update(postAudio)
        .set({ revision, progress: 0, total: 0 })
        .where(whereRow(postId, kind))
        .run();
      cancelQueuedJobs(postId, kind);
      return insertJob({
        type: kind,
        postId,
        contentHash: readerContentHash(post.content),
        revision,
        authorization,
      });
    })
    .immediate();
}

/** 文章发布或更新后：已有朗读时自动重新合成（只有改动过的段落会真正调用语音服务） */
export function enqueueAutoNarration(post: {
  id: number;
  type: string;
  status: string;
  content: string;
}) {
  const config = getTtsConfig();
  if (!config.enabled || !config.autoRefresh || post.type !== "post" || post.status !== "published")
    return null;
  if (!ttsKey().key) return null;
  const current = rowOf(post.id, "narration");
  if (!current?.audioUrl || current.contentHash === readerContentHash(post.content)) return null;
  return enqueueAudio(post.id, "narration", "auto");
}

export function retryAudioJob(id: string) {
  requireReady();
  return getSqlite()
    .transaction(() => {
      const job = getJob(id);
      if (!job || !isAudioJob(job.type)) throw new AiError("任务不存在", 404);
      const kind = job.type as AudioKind;
      const post = requirePost(job.postId);
      const current = ensureRow(post.id, kind);
      const revision = current.revision + 1;
      db.update(postAudio)
        .set({ revision, progress: 0, total: 0 })
        .where(whereRow(post.id, kind))
        .run();
      cancelQueuedJobs(post.id, kind);
      return retryJob(id, readerContentHash(post.content), revision);
    })
    .immediate();
}

export async function removeAudio(postId: number, kind: AudioKind) {
  requirePost(postId);
  const current = rowOf(postId, kind);
  if (!current) return getAudioAdminState(postId);
  db.update(postAudio)
    .set({
      revision: current.revision + 1,
      audioUrl: null,
      mediaId: null,
      duration: 0,
      timeline: null,
      contentHash: null,
      progress: 0,
      total: 0,
      updatedAt: Date.now(),
    })
    .where(whereRow(postId, kind))
    .run();
  cancelQueuedJobs(postId, kind);
  if (current.mediaId) await deleteMedia(current.mediaId).catch(() => {});
  return getAudioAdminState(postId);
}

/* ------------------------------------------------------------------ */
/* 合成任务                                                               */
/* ------------------------------------------------------------------ */

/** 段与段之间的停顿（秒） */
function gapBefore(segment: AudioSegment, previous?: AudioSegment) {
  if (!previous) return 0.3;
  if (segment.cont) return 0.18;
  if (previous.kind === "title") return 0.9;
  if (segment.kind === "heading") return 0.8;
  if (previous.kind === "heading") return 0.5;
  if (segment.line !== undefined) return segment.voice === previous.voice ? 0.25 : 0.35;
  return 0.45;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** 合成整篇音频。返回提交函数，由任务队列在持有租约时写入 */
export async function executeAudioJob(job: BackgroundJob, signal: AbortSignal) {
  const kind = kindSchema.parse(job.type);
  const valid = () => {
    const post = db.select().from(schema.posts).where(eq(schema.posts.id, job.postId)).get();
    const current = rowOf(job.postId, kind);
    return Boolean(
      post &&
      post.type === "post" &&
      current &&
      current.revision === job.payload.revision &&
      getTtsConfig().enabled &&
      (kind === "podcast" || readerContentHash(post.content) === job.contentHash),
    );
  };
  if (!valid()) return () => false;
  const post = requirePost(job.postId);
  const current = rowOf(job.postId, kind)!;
  const config = getTtsConfig();

  let segments: AudioSegment[];
  if (kind === "narration") {
    const { renderMarkdown } = await import("@/lib/markdown");
    segments = narrationSegments(post.title, (await renderMarkdown(post.content)).speech);
  } else segments = podcastSegments(current.lines ?? []);
  if (!segments.length) throw new AiError("没有可以朗读的内容", 400);

  const refs = kind === "narration" ? [config.narrator.voice] : config.hosts.map((h) => h.voice);
  const voices = await Promise.all(refs.map((ref) => resolveVoice(ref, config)));
  const style = kind === "narration" ? config.narrator.style : config.podcastStyle;

  const setProgress = (progress: number) =>
    db
      .update(postAudio)
      .set({ progress, total: segments.length })
      .where(and(whereRow(job.postId, kind), eq(postAudio.revision, job.payload.revision)))
      .run();
  setProgress(0);

  // 2~3 路并发；每段先查缓存，失败的请求在 synthesize 里退避重试
  const pcms = new Array<Int16Array>(segments.length);
  let next = 0,
    done = 0,
    outdated = false;
  const worker = async () => {
    while (next < segments.length && !outdated) {
      const i = next++;
      signal.throwIfAborted();
      if (!valid()) {
        outdated = true;
        return;
      }
      const segment = segments[i];
      pcms[i] = await synthesize(
        voices[segment.voice] ?? voices[0],
        segment.text,
        style,
        signal,
        config,
      );
      setProgress(++done);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (outdated) return () => false;

  const { samples, times, duration } = assemble(
    segments.map((segment, i) => ({
      pcm: pcms[i],
      gapBefore: gapBefore(segment, segments[i - 1]),
    })),
  );
  let saved: Awaited<ReturnType<typeof saveUpload>>;
  try {
    const mp3 = await encodeMp3(samples, signal);
    if (!valid()) return () => false;
    saved = await saveUpload(
      mp3,
      `${kind === "narration" ? "朗读" : "播客"}：${post.title}.mp3`,
      "audio/mpeg",
      { raw: true },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AiError(`音频编码或保存失败：${(error as Error).message || "请检查存储设置"}`);
  }
  const timeline: TimelineEntry[] = segments.map((segment, i) => ({
    start: round(times[i].start),
    end: round(times[i].end),
    kind: segment.kind,
    text: segment.text,
    ...(segment.say !== undefined ? { say: segment.say } : {}),
    ...(segment.line !== undefined ? { line: segment.line, voice: segment.voice } : {}),
  }));
  const hosts = kind === "podcast" ? config.hosts.map((host) => host.name) : [];
  void pruneTtsCache().catch(() => {});

  return () => {
    if (signal.aborted || !valid()) {
      setTimeout(() => void deleteMedia(saved.id).catch(() => {}), 0);
      return false;
    }
    const previous = rowOf(job.postId, kind)?.mediaId;
    db.update(postAudio)
      .set({
        audioUrl: saved.url,
        mediaId: saved.id,
        duration: round(duration),
        timeline,
        contentHash: job.contentHash,
        hosts,
        progress: segments.length,
        total: segments.length,
        updatedAt: Date.now(),
      })
      .where(whereRow(job.postId, kind))
      .run();
    if (previous && previous !== saved.id)
      setTimeout(() => void deleteMedia(previous).catch(() => {}), 0);
    return true;
  };
}

/* ------------------------------------------------------------------ */
/* 前台                                                                   */
/* ------------------------------------------------------------------ */

/** 文章页的音频：朗读要和当前正文一致（段落高亮才对得上）；播客稿是作者审过的，正文小改不影响 */
export function getPublicPostAudio(postId: number, content: string): PublicPostAudio[] {
  const hash = readerContentHash(content);
  return db
    .select()
    .from(postAudio)
    .where(eq(postAudio.postId, postId))
    .all()
    .filter(
      (row) =>
        row.audioUrl &&
        row.timeline?.length &&
        (row.kind === "podcast" || row.contentHash === hash),
    )
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "narration" ? -1 : 1))
    .map((row) => ({
      kind: row.kind,
      url: resolveUploadUrl(row.audioUrl!),
      duration: row.duration,
      timeline: row.timeline!,
      hosts: row.hosts ?? [],
      updatedAt: row.updatedAt ?? 0,
    }));
}

/** 播客订阅源：每篇文章取播客，没有播客时取朗读 */
export function listPodcastEpisodes() {
  const rows = db
    .select({
      audio: postAudio,
      post: {
        id: schema.posts.id,
        title: schema.posts.title,
        slug: schema.posts.slug,
        content: schema.posts.content,
        excerpt: schema.posts.excerpt,
        summary: schema.posts.summary,
        seoDescription: schema.posts.seoDescription,
        cover: schema.posts.cover,
        status: schema.posts.status,
        publishedAt: schema.posts.publishedAt,
      },
      size: schema.media.size,
    })
    .from(postAudio)
    .innerJoin(schema.posts, eq(schema.posts.id, postAudio.postId))
    .leftJoin(schema.media, eq(schema.media.id, postAudio.mediaId))
    .all();
  const now = Date.now();
  const byPost = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const { audio, post } = row;
    if (
      post.status !== "published" ||
      !post.publishedAt ||
      post.publishedAt.getTime() > now ||
      !audio.audioUrl ||
      (audio.kind === "narration" && audio.contentHash !== readerContentHash(post.content))
    )
      continue;
    const existing = byPost.get(post.id);
    if (!existing || audio.kind === "podcast") byPost.set(post.id, row);
  }
  return [...byPost.values()]
    .sort((a, b) => b.post.publishedAt!.getTime() - a.post.publishedAt!.getTime())
    .map(({ audio, post, size }) => ({
      kind: audio.kind,
      url: audio.audioUrl!,
      size: size ?? 0,
      duration: audio.duration,
      updatedAt: audio.updatedAt ?? 0,
      post,
    }));
}
