import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { DATA_DIR } from "@/db";

import { AiError } from "./ai";
import { trustedBackgroundAiPost } from "./outbound";
import { readUpload } from "./storage";
import { type TtsConfig, getTtsConfig, ttsKey } from "./tts-config";

/** MiMo 输出 24 kHz 单声道；所有音频统一成这个采样率 */
export const SAMPLE_RATE = 24000;
/** 按内容缓存每一段的合成结果：文章小改时只重新合成改动的段落 */
const CACHE_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "tts-cache");

export type VoiceSpec = { model: string; voice?: string; key: string };

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** 内置音色直接用名字；自定义音色读出样音，用声音克隆模型合成 */
export async function resolveVoice(ref: string, config: TtsConfig = getTtsConfig()) {
  if (!ref.startsWith("custom:")) return { model: config.model, voice: ref, key: `builtin:${ref}` };
  const custom = config.voices.find((voice) => `custom:${voice.id}` === ref);
  if (!custom) throw new AiError("找不到所选的自定义音色，请重新选择", 400);
  const sample = await readUpload(decodeURIComponent(custom.sample.slice("/uploads/".length)));
  if (sample.length > 7 * 1024 * 1024) throw new AiError("样音文件过大，请换一段更短的录音", 400);
  const mime = custom.sample.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
  return {
    model: config.cloneModel,
    voice: `data:${mime};base64,${sample.toString("base64")}`,
    key: `clone:${sha256(sample).slice(0, 24)}`,
  } satisfies VoiceSpec;
}

/** 是否开启在请求合成时检查；试听和设计音色只需要密钥 */
function requireKey() {
  const { key } = ttsKey();
  if (!key)
    throw new AiError("请先配置语音服务的密钥（和 AI 助手同为 MiMo 时会沿用它的密钥）", 400);
  return key;
}

function statusError(status: number) {
  if (status === 401 || status === 403) return new AiError("语音服务密钥无效或没有权限", status);
  if (status === 402) return new AiError("语音服务余额不足", 402);
  if (status === 429) return new AiError("语音合成请求过于频繁，请稍后重试", 429);
  if (status === 413) return new AiError("这段文字或样音太长，语音服务拒绝处理", 413);
  return new AiError("语音服务暂时无法处理请求，请稍后重试");
}

/* ------------------------------------------------------------------ */
/* WAV                                                                    */
/* ------------------------------------------------------------------ */

/** 解析 WAV，转成 24 kHz 单声道 16 位 PCM */
export function decodeWav(buffer: Buffer): Int16Array {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE")
    throw new AiError("语音服务返回的音频格式无法识别");
  let offset = 12;
  let format = 1,
    channels = 1,
    rate = SAMPLE_RATE,
    bits = 16;
  let data: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    let size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      rate = buffer.readUInt32LE(start + 4);
      bits = buffer.readUInt16LE(start + 14);
      if (format === 0xfffe && size >= 26) format = buffer.readUInt16LE(start + 24);
    } else if (id === "data") {
      // 流式生成的 WAV 头里长度可能是 0 或 0xFFFFFFFF
      if (!size || start + size > buffer.length) size = buffer.length - start;
      data = buffer.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data || !channels) throw new AiError("语音服务返回的音频没有内容");
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = (i * channels + c) * bytes;
      if (format === 3 && bits === 32) sum += data.readFloatLE(at);
      else if (bits === 16) sum += data.readInt16LE(at) / 32768;
      else if (bits === 24) sum += data.readIntLE(at, 3) / 8388608;
      else if (bits === 32) sum += data.readInt32LE(at) / 2147483648;
      else if (bits === 8) sum += (data.readUInt8(at) - 128) / 128;
      else throw new AiError("语音服务返回了不支持的音频格式");
    }
    mono[i] = sum / channels;
  }
  // 采样率不同时线性重采样
  const length = rate === SAMPLE_RATE ? frames : Math.round((frames * SAMPLE_RATE) / rate);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const pos = rate === SAMPLE_RATE ? i : (i * rate) / SAMPLE_RATE;
    const a = Math.floor(pos);
    const t = pos - a;
    const value = (mono[a] ?? 0) * (1 - t) + (mono[a + 1] ?? mono[a] ?? 0) * t;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }
  return out;
}

/** 24 kHz 单声道 PCM 包成 WAV（音色设计的样音存成 WAV） */
export function encodeWav(pcm: Int16Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.byteLength, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}

/* ------------------------------------------------------------------ */
/* 请求                                                                   */
/* ------------------------------------------------------------------ */

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * 调一次 MiMo 语音合成（OpenAI 兼容的 /chat/completions）：
 * 要念的文字放在 assistant 消息里，风格说明放在 user 消息里。
 * 限流和服务端错误会退避重试两次。
 */
async function request(
  config: TtsConfig,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Buffer> {
  const key = requireKey();
  for (let attempt = 0; ; attempt++) {
    const response = await trustedBackgroundAiPost(`${config.baseUrl}/chat/completions`, {
      useProxy: config.useProxy,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
    }).catch((error) => {
      if (signal.aborted) throw signal.reason;
      throw new AiError(
        (error as Error)?.name === "TimeoutError"
          ? "语音合成超时，请稍后重试"
          : "连不上语音服务，请检查服务地址、网络或代理设置",
      );
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.body?.cancel().catch(() => {});
      const wait = Number(response.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
      await sleep(Math.min(wait, 20_000), signal);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw statusError(response.status);
    }
    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { audio?: { data?: string } } }[];
    } | null;
    const audio = data?.choices?.[0]?.message?.audio?.data;
    if (!audio) throw new AiError("语音服务没有返回音频，请检查模型设置");
    return Buffer.from(audio, "base64");
  }
}

/** 合成一段文字；同样的音色、风格和文字直接用缓存 */
export async function synthesize(
  spec: VoiceSpec,
  text: string,
  style: string,
  signal: AbortSignal,
  config: TtsConfig = getTtsConfig(),
): Promise<Int16Array> {
  const key = sha256(JSON.stringify([spec.model, spec.key, style, text]));
  const file = path.join(/*turbopackIgnore: true*/ CACHE_DIR, key.slice(0, 2), `${key}.pcm`);
  try {
    const cached = await fs.readFile(file);
    if (cached.length >= 2) {
      // 记录最近使用时间，清理缓存时保留常用的段落
      void fs.utimes(file, new Date(), new Date()).catch(() => {});
      // 复制一份：Buffer 的偏移不一定按 2 字节对齐
      const pcm = new Int16Array(Math.floor(cached.length / 2));
      new Uint8Array(pcm.buffer).set(cached.subarray(0, pcm.length * 2));
      return pcm;
    }
  } catch {
    /* 没有缓存 */
  }
  const messages = [
    // 声音克隆也需要一条 user 消息（可以为空）
    ...(style || spec.model === config.cloneModel ? [{ role: "user", content: style }] : []),
    { role: "assistant", content: text },
  ];
  const wav = await request(
    config,
    {
      model: spec.model,
      messages,
      audio: { format: "wav", ...(spec.voice ? { voice: spec.voice } : {}) },
    },
    signal,
  );
  const pcm = decodeWav(wav);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return pcm;
}

/** 用一句话描述生成音色，返回样音（不缓存） */
export async function designVoice(description: string, text: string, signal: AbortSignal) {
  const config = getTtsConfig();
  const wav = await request(
    config,
    {
      model: config.designModel,
      messages: [
        { role: "user", content: description },
        { role: "assistant", content: text },
      ],
      audio: { format: "wav" },
    },
    signal,
  );
  return decodeWav(wav);
}

/** 试听：用当前设置合成一句话 */
export async function previewVoice(ref: string, text: string, style: string, signal: AbortSignal) {
  const config = getTtsConfig();
  return synthesize(await resolveVoice(ref, config), text, style, signal, config);
}

/** 清理两个月没用过的缓存段落 */
export async function pruneTtsCache(maxAgeMs = 60 * 86_400_000) {
  const cutoff = Date.now() - maxAgeMs;
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(CACHE_DIR);
  } catch {
    return;
  }
  for (const dir of dirs) {
    const full = path.join(/*turbopackIgnore: true*/ CACHE_DIR, dir);
    for (const name of await fs.readdir(full).catch(() => [] as string[])) {
      const file = path.join(/*turbopackIgnore: true*/ full, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.rm(file, { force: true });
    }
  }
}
