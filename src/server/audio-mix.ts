import "server-only";

import { SAMPLE_RATE } from "./tts";

/** 一段合成好的语音，以及它前面要留多长的停顿（秒） */
export type MixPiece = { pcm: Int16Array; gapBefore: number };

const SILENCE = 0.012 * 32768;

/** 去掉首尾静音（各留 40 毫秒），音量拉到大致相同，两端做极短的淡入淡出防止爆音 */
function prepare(pcm: Int16Array): Float32Array {
  let start = 0,
    end = pcm.length;
  while (start < end && Math.abs(pcm[start]) < SILENCE) start++;
  while (end > start && Math.abs(pcm[end - 1]) < SILENCE) end--;
  const pad = Math.round(0.04 * SAMPLE_RATE);
  start = Math.max(0, start - pad);
  end = Math.min(pcm.length, end + pad);

  // 只按有声的部分计算响度
  let sum = 0,
    count = 0;
  for (let i = start; i < end; i++) {
    const v = pcm[i] / 32768;
    if (Math.abs(v) > 0.02) {
      sum += v * v;
      count++;
    }
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  const gain = rms ? Math.min(3, Math.max(0.4, 0.14 / rms)) : 1;

  const out = new Float32Array(end - start);
  const fade = Math.min(Math.round(0.008 * SAMPLE_RATE), Math.floor(out.length / 2));
  for (let i = 0; i < out.length; i++) {
    let v = (pcm[start + i] / 32768) * gain;
    // 软限幅：超过 0.9 的部分平滑压缩，不硬削波
    if (v > 0.9) v = 0.9 + (1 - Math.exp(-(v - 0.9) * 10)) * 0.09;
    else if (v < -0.9) v = -0.9 - (1 - Math.exp((v + 0.9) * 10)) * 0.09;
    if (i < fade) v *= i / fade;
    else if (i >= out.length - fade) v *= (out.length - 1 - i) / fade;
    out[i] = v;
  }
  return out;
}

/** 按顺序拼接，返回每段在成品里的起止时间 */
export function assemble(pieces: MixPiece[]) {
  const prepared = pieces.map((piece) => prepare(piece.pcm));
  const gaps = pieces.map((piece) => Math.round(piece.gapBefore * SAMPLE_RATE));
  const tail = Math.round(0.8 * SAMPLE_RATE);
  const length = prepared.reduce((n, s, i) => n + gaps[i] + s.length, 0) + tail;
  const samples = new Float32Array(length);
  const times: { start: number; end: number }[] = [];
  let at = 0;
  prepared.forEach((s, i) => {
    at += gaps[i];
    samples.set(s, at);
    times.push({ start: at / SAMPLE_RATE, end: (at + s.length) / SAMPLE_RATE });
    at += s.length;
  });
  return { samples, times, duration: samples.length / SAMPLE_RATE };
}

/** 纯 JS 编码成 MP3（单声道 48 kbps，足够人声）；分小批编码，期间让出事件循环，不阻塞网站 */
export async function encodeMp3(samples: Float32Array, signal?: AbortSignal, kbps = 48) {
  // 动态 import 才会走包的 ESM 入口（它的 require 入口只挂全局变量，拿不到导出）
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, kbps);
  const block = 1152 * 16;
  const pcm = new Int16Array(block);
  const chunks: Uint8Array[] = [];
  for (let i = 0, n = 0; i < samples.length; i += block, n++) {
    const size = Math.min(block, samples.length - i);
    for (let j = 0; j < size; j++)
      pcm[j] = Math.max(-32768, Math.min(32767, Math.round(samples[i + j] * 32767)));
    const out = encoder.encodeBuffer(pcm.subarray(0, size));
    if (out.length) chunks.push(Uint8Array.from(out));
    if (n % 2 === 1) {
      await new Promise((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
    }
  }
  chunks.push(Uint8Array.from(encoder.flush()));
  return Buffer.concat(chunks);
}
