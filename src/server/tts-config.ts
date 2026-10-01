import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";

import { AiError } from "./ai";
import { getAiConfig } from "./ai-config";

/** 内置音色（MiMo v2.5 TTS） */
export const BUILTIN_VOICES = [
  { id: "冰糖", name: "冰糖", note: "中文 · 女声" },
  { id: "茉莉", name: "茉莉", note: "中文 · 女声" },
  { id: "苏打", name: "苏打", note: "中文 · 男声" },
  { id: "白桦", name: "白桦", note: "中文 · 男声" },
  { id: "Mia", name: "Mia", note: "英文 · 女声" },
  { id: "Chloe", name: "Chloe", note: "英文 · 女声" },
  { id: "Milo", name: "Milo", note: "英文 · 男声" },
  { id: "Dean", name: "Dean", note: "英文 · 男声" },
] as const;

const baseUrl = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((raw) => {
    try {
      const url = new URL(raw);
      return (
        /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      );
    } catch {
      return false;
    }
  }, "语音服务地址须为不含认证、查询参数或片段的 HTTP(S) 地址")
  .transform((raw) => raw.replace(/\/+$/, ""));

/** 内置音色写音色名；自定义音色写 custom:<id> */
const voiceRef = z.string().trim().min(1).max(40);

export const customVoiceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]{6,24}$/),
    name: z.string().trim().min(1).max(20),
    /** 样音文件（媒体库地址），合成时作为声音克隆的样本 */
    sample: z.string().regex(/^\/uploads\/[^?#\\]+\.(?:wav|mp3)$/),
    source: z.enum(["design", "upload"]),
    /** 音色设计时的描述 */
    note: z.string().max(500).default(""),
  })
  .strict();
export type CustomVoice = z.output<typeof customVoiceSchema>;

const hostSchema = z.object({ name: z.string().trim().min(1).max(8), voice: voiceRef }).strict();

export const ttsConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    baseUrl: baseUrl.default("https://api.xiaomimimo.com/v1"),
    model: z.string().trim().min(1).max(100).default("mimo-v2.5-tts"),
    designModel: z.string().trim().min(1).max(100).default("mimo-v2.5-tts-voicedesign"),
    cloneModel: z.string().trim().min(1).max(100).default("mimo-v2.5-tts-voiceclone"),
    useProxy: z.boolean().default(false),
    narrator: z
      .object({
        voice: voiceRef.default("冰糖"),
        style: z
          .string()
          .max(500)
          .default("用自然、温和、清晰的语气朗读一篇博客文章，语速适中，像在给朋友讲述。"),
      })
      .strict()
      .default({
        voice: "冰糖",
        style: "用自然、温和、清晰的语气朗读一篇博客文章，语速适中，像在给朋友讲述。",
      }),
    hosts: z
      .array(hostSchema)
      .length(2)
      .default([
        { name: "小北", voice: "苏打" },
        { name: "茉莉", voice: "茉莉" },
      ]),
    podcastStyle: z
      .string()
      .max(500)
      .default("两位主播在轻松地聊一篇博客文章，语气自然、口语化，有来有回。"),
    /** 文章更新后自动重新合成已有的朗读（只合成改动过的段落） */
    autoRefresh: z.boolean().default(true),
    voices: z.array(customVoiceSchema).max(20).default([]),
  })
  .strict();
export type TtsConfig = z.output<typeof ttsConfigSchema>;

const keySchema = z
  .string()
  .trim()
  .max(8192)
  .refine((key) => !/[\r\n\x00-\x1f\x7f]/.test(key));
const storedSchema = ttsConfigSchema.extend({ apiKey: keySchema.default("") });
type StoredTtsConfig = z.output<typeof storedSchema>;

// Zod 4 的 partial() 仍会填入默认值：补丁里逐项去掉默认值，没提交的字段保持原样
const shape = ttsConfigSchema.shape;
export const ttsConfigPatchSchema = z
  .object({
    config: z
      .object({
        enabled: shape.enabled.removeDefault().optional(),
        baseUrl: shape.baseUrl.removeDefault().optional(),
        model: shape.model.removeDefault().optional(),
        designModel: shape.designModel.removeDefault().optional(),
        cloneModel: shape.cloneModel.removeDefault().optional(),
        useProxy: shape.useProxy.removeDefault().optional(),
        narrator: shape.narrator.removeDefault().optional(),
        hosts: shape.hosts.removeDefault().optional(),
        podcastStyle: shape.podcastStyle.removeDefault().optional(),
        autoRefresh: shape.autoRefresh.removeDefault().optional(),
      })
      .strict()
      .optional(),
    apiKey: keySchema.optional(),
    clearKey: z.boolean().optional(),
  })
  .strict();

function stored(): StoredTtsConfig {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "tts")).get();
  const parsed = storedSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : storedSchema.parse({});
}

function write(next: StoredTtsConfig) {
  const value = storedSchema.parse(next);
  db.insert(schema.settings)
    .values({ key: "tts", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })
    .run();
}

export function getTtsConfig(): TtsConfig {
  const { apiKey, ...config } = stored();
  void apiKey;
  return config;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

/** 语音服务的密钥：自己的优先；和 AI 助手是同一个服务商时沿用 AI 的密钥 */
export function ttsKey(): { key: string; source: "own" | "ai" | "none" } {
  const own = stored();
  if (own.apiKey) return { key: own.apiKey, source: "own" };
  const ai = getAiConfig();
  if (ai.apiKey && hostOf(ai.baseUrl) === hostOf(own.baseUrl))
    return { key: ai.apiKey, source: "ai" };
  return { key: "", source: "none" };
}

export function publicTtsConfig() {
  return { config: getTtsConfig(), keySource: ttsKey().source, builtin: BUILTIN_VOICES };
}

/** 音色引用是否有效：内置音色名，或已有的自定义音色 */
export function validVoice(ref: string, voices: CustomVoice[]) {
  return ref.startsWith("custom:")
    ? voices.some((voice) => `custom:${voice.id}` === ref)
    : BUILTIN_VOICES.some((voice) => voice.id === ref);
}

export function saveTtsConfig(raw: unknown) {
  const patch = ttsConfigPatchSchema.parse(raw);
  const current = stored();
  const next = { ...current, ...patch.config };
  if (
    ![next.narrator.voice, ...next.hosts.map((host) => host.voice)].every((ref) =>
      validVoice(ref, next.voices),
    )
  )
    throw new AiError("所选音色不存在，请重新选择", 400);
  write({ ...next, apiKey: patch.clearKey ? "" : patch.apiKey || current.apiKey });
  return publicTtsConfig();
}

export function addCustomVoice(voice: CustomVoice) {
  const current = stored();
  if (current.voices.length >= 20) throw new AiError("自定义音色最多 20 个", 400);
  write({ ...current, voices: [...current.voices, customVoiceSchema.parse(voice)] });
  return publicTtsConfig();
}

/** 删除自定义音色；正在使用它的角色改回默认音色 */
export function removeCustomVoice(id: string) {
  const current = stored();
  const ref = `custom:${id}`;
  write({
    ...current,
    voices: current.voices.filter((voice) => voice.id !== id),
    narrator:
      current.narrator.voice === ref ? { ...current.narrator, voice: "冰糖" } : current.narrator,
    hosts: current.hosts.map((host, i) =>
      host.voice === ref ? { ...host, voice: i === 0 ? "苏打" : "茉莉" } : host,
    ),
  });
  return publicTtsConfig();
}
