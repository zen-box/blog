import { randomBytes } from "node:crypto";

import { z } from "zod";

import { AiError } from "@/server/ai";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import { saveUpload } from "@/server/media";
import { decodeWav, designVoice, encodeWav, previewVoice } from "@/server/tts";
import {
  addCustomVoice,
  getTtsConfig,
  publicTtsConfig,
  removeCustomVoice,
  saveTtsConfig,
} from "@/server/tts-config";

export const runtime = "nodejs";

const PREVIEW_TEXT = "你好，欢迎来到我的博客。这是一段试听，听听这个声音合不合适。";

const operation = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("config"),
      config: z.record(z.string(), z.unknown()).optional(),
      apiKey: z.string().optional(),
      clearKey: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("preview"),
      voice: z.string().min(1).max(40),
      text: z.string().trim().max(200).optional(),
      style: z.string().max(500).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("design"),
      description: z.string().trim().min(4).max(500),
      text: z.string().trim().min(4).max(200),
    })
    .strict(),
  z
    .object({
      op: z.literal("saveDesign"),
      name: z.string().trim().min(1).max(20),
      description: z.string().trim().max(500),
      audio: z.string().max(3_000_000),
    })
    .strict(),
  z.object({ op: z.literal("deleteVoice"), id: z.string().regex(/^[a-z0-9]{6,24}$/) }).strict(),
]);

const wavBase64 = (pcm: Int16Array) => encodeWav(pcm).toString("base64");

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    return adminJson(publicTtsConfig());
  } catch (error) {
    return aiHttpError(error);
  }
}

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = operation.parse(await readAdminJson(request));
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]);
    switch (input.op) {
      case "config": {
        const { op: _op, ...patch } = input;
        void _op;
        return adminJson(saveTtsConfig(patch));
      }
      case "preview": {
        const style = input.style ?? getTtsConfig().narrator.style;
        const pcm = await previewVoice(input.voice, input.text || PREVIEW_TEXT, style, signal);
        return adminJson({ audio: wavBase64(pcm) });
      }
      case "design":
        return adminJson({
          audio: wavBase64(await designVoice(input.description, input.text, signal)),
        });
      case "saveDesign": {
        // 先解码一遍，确认是有效的 WAV，再存进媒体库
        const pcm = decodeWav(Buffer.from(input.audio, "base64"));
        if (pcm.length < 24000) throw new AiError("样音太短，请重新生成", 400);
        const saved = await saveUpload(encodeWav(pcm), `音色：${input.name}.wav`, "audio/wav", {
          raw: true,
        });
        return adminJson(
          addCustomVoice({
            id: randomBytes(6).toString("hex"),
            name: input.name,
            sample: saved.url,
            source: "design",
            note: input.description,
          }),
        );
      }
      case "deleteVoice":
        return adminJson(removeCustomVoice(input.id));
    }
  } catch (error) {
    return aiHttpError(error);
  }
}
