import "server-only";

import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { MARKDOWN_GUIDE } from "@/content/markdown-guide";
import { db, schema } from "@/db";
import { beginAiUsage, completeAiUsage, getAiConfig, type AiStoredConfig } from "./ai-config";
import { readSse, SecretFilter, ThinkFilter } from "./ai-stream";
import { administratorAiPost, trustedBackgroundAiPost, isPrivateAddress } from "./outbound";

export const aiRunSchema = z
  .object({
    task: z.enum(["rewrite", "format", "proofread", "polish", "metadata", "podcast"]),
    title: z.string().max(200),
    content: z.string().max(500000),
    instruction: z.string().max(10000).optional(),
    context: z.string().max(50000).optional(),
  })
  .strict();
export type AiRunInput = z.output<typeof aiRunSchema>;
export type AiEvent =
  { type: "delta"; text: string } | { type: "done" } | { type: "error"; error: string };

export class AiError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}
export function describeAiError(error: unknown, signal?: AbortSignal): AiError {
  if (signal?.aborted)
    return signal.reason?.name === "TimeoutError"
      ? new AiError("AI 请求超时，请稍后重试或调整超时时间", 504)
      : new AiError("AI 请求已中断", 499);
  if (error instanceof AiError) return error;
  return new AiError("AI 服务连接失败，请检查服务地址、网络或代理设置");
}

const actions: Record<AiRunInput["task"], string> = {
  rewrite:
    "按用户要求改写所选文字，保持原意与作者语气，只输出所选文字的替代文本，不输出上下文。保持事实可靠，不凭空添加事实。",
  format: "只整理 Markdown 排版，不改写文字和事实。保留自定义 Markdown 语法。",
  proofread: "只纠正错别字、标点和明显语法错误，尽可能保持原文。",
  polish: "润色表达与段落衔接，保留原意和事实，不添加未经提供的信息。",
  podcast:
    "把文章改写成两位主播的中文对话播客稿，instruction 里给出两位主播的名字和大致长度。要求：口语化、自然，有来有回，像两个朋友在聊这篇文章；忠于原文，不编造事实和数据；代码、命令和测评数字用口语概括要点；开头一两句问候并点出主题，结尾简短总结。每行一句台词，格式为「名字：台词」，不要输出标题、旁白或其他内容。可以在台词里少量加入语气标签，例如（轻笑）（停顿）（惊讶）。",
  metadata:
    "为文章生成元数据。只返回 JSON 对象 {excerpt,seoDescription,slug,tags:string[],categoryId:number|null}。摘要最多500字、SEO描述最多300字、slug最多120字（小写英文数字短横线）。分类仅选择给定分类的id或null，标签最多20项，每项最多40字。不要用代码围栏。",
};
function promptFor(input: AiRunInput) {
  let system = `${actions[input.task]}\n保持 __BLOG_AI_KEEP_<id>__ 占位符完全不变，不得增删或改动任何占位符。不要输出思考过程、解释、前言或代码围栏。${input.task === "metadata" || input.task === "podcast" ? "" : "只输出完整 Markdown 正文。"}`;
  if (input.task === "format") system += `\n本站 Markdown 语法指南：\n${MARKDOWN_GUIDE}`;
  if (input.task === "metadata") {
    const categories = db
      .select({ id: schema.categories.id, name: schema.categories.name })
      .from(schema.categories)
      .all();
    const tags = db
      .select({ name: schema.tags.name })
      .from(schema.tags)
      .all()
      .map((row) => row.name);
    system += `\n站点分类：${JSON.stringify(categories)}\n已有标签：${JSON.stringify(tags)}`;
  }
  return {
    system,
    user: JSON.stringify({
      title: input.title,
      content: input.content,
      instruction: input.instruction ?? "",
      context: input.context ?? "",
    }),
  };
}

function requestFor(
  config: AiStoredConfig,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): { url: string; headers: Record<string, string>; body: string } {
  const root = config.baseUrl.replace(/\/+$/, "");
  if (config.protocol === "anthropic")
    return {
      url: `${root}/messages`,
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages: [{ role: "user", content: user }],
        max_tokens: maxTokens,
        stream: true,
      }),
    };
  return {
    url: `${root}/chat/completions`,
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  };
}
function statusError(status: number): AiError {
  if (status === 401 || status === 403)
    return new AiError("AI 密钥无效或没有访问该模型的权限", status);
  if (status === 402) return new AiError("AI 账户余额不足，请检查账户额度", 402);
  if (status === 429) return new AiError("AI 请求过于频繁或额度已用尽，请稍后重试", 429);
  if (status >= 300 && status < 400) return new AiError("AI 服务发生重定向，请填写最终服务地址");
  return new AiError("AI 服务暂时无法处理请求，请检查模型配置或稍后重试");
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function token(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** 两种协议只提取可见文本，usage 分帧合并，所有错误均采用固定中文文案。 */
async function* providerText(
  config: AiStoredConfig,
  request: ReturnType<typeof requestFor>,
  headers: Headers | null,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const day = beginAiUsage();
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finished = false;
  let outputSize = 0;
  try {
    if (signal.aborted) throw signal.reason;
    const options = {
      useProxy: config.useProxy,
      headers: request.headers,
      body: request.body,
      signal,
    };
    const response = headers
      ? await administratorAiPost(request.url, { ...options, administratorHeaders: headers })
      : await trustedBackgroundAiPost(request.url, options);
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw statusError(response.status);
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
      await response.body.cancel().catch(() => {});
      throw new AiError("AI 服务未返回有效的流式响应，请检查协议配置");
    }
    for await (const event of readSse(response.body)) {
      if (event.trim() === "[DONE]") {
        finished = true;
        break;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(event);
      } catch {
        throw new AiError("AI 返回的数据格式不正确，请稍后重试");
      }
      const data = object(parsed);
      if (data.error || data.type === "error")
        throw new AiError("AI 服务在生成过程中返回错误，请稍后重试");
      let text = "";
      if (config.protocol === "openai") {
        const usage = object(data.usage);
        inputTokens = token(usage.prompt_tokens) ?? inputTokens;
        outputTokens = token(usage.completion_tokens) ?? outputTokens;
        const choice = object(Array.isArray(data.choices) ? data.choices[0] : undefined);
        const delta = object(choice.delta);
        if (typeof delta.content === "string") text = delta.content;
        if (choice.finish_reason === "length" || choice.finish_reason === "content_filter") {
          throw new AiError("AI 输出未完成或被服务拦截，请缩短内容后重试");
        }
        if (choice.finish_reason) finished = true;
      } else {
        const usage = object(
          data.type === "message_start" ? object(data.message).usage : data.usage,
        );
        inputTokens = token(usage.input_tokens) ?? inputTokens;
        outputTokens = token(usage.output_tokens) ?? outputTokens;
        const delta = object(data.delta);
        if (
          data.type === "content_block_delta" &&
          delta.type === "text_delta" &&
          typeof delta.text === "string"
        )
          text = delta.text;
        if (data.type === "message_delta" && delta.stop_reason === "max_tokens") {
          throw new AiError("AI 输出超过模型长度限制，请缩短内容后重试");
        }
        if (data.type === "message_stop") {
          finished = true;
          break;
        }
      }
      outputSize += text.length;
      if (outputSize > 4 * 1024 * 1024) throw new AiError("AI 输出过长，请缩短内容后重试");
      if (text) yield text;
    }
    if (signal.aborted) throw signal.reason;
    if (!finished) throw new AiError("AI 响应意外结束，请重试");
  } finally {
    completeAiUsage(day, inputTokens, outputTokens);
  }
}

const metadataSchema = z
  .object({
    excerpt: z.string().max(500),
    seoDescription: z.string().max(300),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    categoryId: z.number().int().positive().nullable(),
  })
  .strict();
function validateMetadata(text: string): string {
  try {
    const value = metadataSchema.parse(JSON.parse(text.trim()));
    if (
      value.categoryId !== null &&
      !db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(eq(schema.categories.id, value.categoryId))
        .get()
    )
      throw new Error("Invalid category");
    return JSON.stringify({ ...value, tags: [...new Set(value.tags)] });
  } catch {
    throw new AiError("AI 返回的元数据格式不正确，请重试");
  }
}

function requireAiKey(config: AiStoredConfig) {
  const host = new URL(config.baseUrl).hostname.replace(/^\[|\]$/g, "");
  const local =
    host === "localhost" ||
    Boolean(isIP(host) && isPrivateAddress(host)) ||
    /\.(local|lan|internal)$/.test(host) ||
    (!host.includes(".") && !host.includes(":"));
  if (!config.apiKey && !local) throw new AiError("请先配置 AI 密钥", 400);
}

export function createAiRunStream(input: AiRunInput, request: Request): ReadableStream<Uint8Array> {
  const config = getAiConfig();
  requireAiKey(config);
  const prompts = promptFor(input);
  const upstream = requestFor(
    config,
    input.task === "rewrite" || input.task === "metadata" ? config.fastModel : config.model,
    prompts.system,
    prompts.user,
    16384,
  );
  const abort = new AbortController();
  const signal = AbortSignal.any([
    request.signal,
    abort.signal,
    AbortSignal.timeout(config.timeoutMs),
  ]);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream({
    async start(controller) {
      const send = (event: AiEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const think = new ThinkFilter();
      const secret = new SecretFilter(config.apiKey);
      let metadata = "";
      let visible = false;
      const emit = (text: string) => {
        if (!text) return;
        visible = true;
        if (input.task === "metadata") metadata += text;
        else send({ type: "delta", text });
      };
      try {
        for await (const text of providerText(config, upstream, request.headers, signal)) {
          emit(secret.push(think.push(text)));
        }
        emit(secret.push(think.push("", true), true));
        if (!visible) throw new AiError("AI 未返回正文，请检查模型或重试");
        if (input.task === "metadata") send({ type: "delta", text: validateMetadata(metadata) });
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", error: describeAiError(error, signal).message });
      } finally {
        abort.abort();
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });
}

export async function testAi(request: Request) {
  const config = getAiConfig();
  requireAiKey(config);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)]);
  const upstream = requestFor(
    config,
    config.fastModel,
    "只回复 OK，不要输出思考或解释。",
    "连接测试",
    64,
  );
  let text = "";
  const think = new ThinkFilter();
  try {
    for await (const delta of providerText(config, upstream, request.headers, signal))
      text += think.push(delta);
    text += think.push("", true);
    if (!text.trim()) throw new AiError("AI 连接成功但未返回正文，请检查模型");
    return { ok: true as const };
  } catch (error) {
    throw describeAiError(error, signal);
  }
}

/** Trusted persistent worker call. Uses the main model, the same filters and usage accounting. */
export async function generateBackgroundAiText(
  system: string,
  user: string,
  jobSignal?: AbortSignal,
) {
  const config = getAiConfig();
  requireAiKey(config);
  const signal = AbortSignal.any([
    ...(jobSignal ? [jobSignal] : []),
    AbortSignal.timeout(config.timeoutMs),
  ]);
  const think = new ThinkFilter();
  const secret = new SecretFilter(config.apiKey);
  let text = "";
  try {
    for await (const delta of providerText(
      config,
      requestFor(config, config.model, system, user, 1024),
      null,
      signal,
    ))
      text += secret.push(think.push(delta));
    text += secret.push(think.push("", true), true);
    if (!text.trim()) throw new AiError("AI 未返回正文，请检查模型或重试");
    return text.trim();
  } catch (error) {
    throw describeAiError(error, signal);
  }
}
