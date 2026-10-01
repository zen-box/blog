import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";

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
  }, "AI 服务地址须为不含认证、查询参数或片段的 HTTP(S) 地址")
  .transform((raw) => raw.replace(/\/+$/, ""));

export const aiConfigSchema = z
  .object({
    protocol: z.enum(["openai", "anthropic"]).default("openai"),
    baseUrl: baseUrl.default("https://api.xiaomimimo.com/v1"),
    model: z.string().trim().min(1).max(200).default("mimo-v2.6-pro"),
    fastModel: z.string().trim().min(1).max(200).default("mimo-v2.6-flash"),
    useProxy: z.boolean().default(false),
    timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  })
  .strict();
const keySchema = z
  .string()
  .trim()
  .max(8192)
  .refine((key) => !/[\r\n\x00-\x1f\x7f]/.test(key));
const storedSchema = aiConfigSchema.extend({ apiKey: keySchema.default("") });
// partial() 会在 Zod 4 中执行内部默认值；更新配置必须移除默认值，保留未提交字段。
export const aiConfigPatchSchema = z
  .object({
    protocol: aiConfigSchema.shape.protocol.removeDefault().optional(),
    baseUrl: aiConfigSchema.shape.baseUrl.removeDefault().optional(),
    model: aiConfigSchema.shape.model.removeDefault().optional(),
    fastModel: aiConfigSchema.shape.fastModel.removeDefault().optional(),
    useProxy: aiConfigSchema.shape.useProxy.removeDefault().optional(),
    timeoutMs: aiConfigSchema.shape.timeoutMs.removeDefault().optional(),
    apiKey: keySchema.optional(),
    clearKey: z.boolean().optional(),
  })
  .strict();
export type AiConfig = z.output<typeof aiConfigSchema>;
export type AiStoredConfig = z.output<typeof storedSchema>;

export function getAiConfig(): AiStoredConfig {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "ai")).get();
  return storedSchema.parse(row?.value ?? {});
}

export function publicAiConfig() {
  const { apiKey, ...config } = getAiConfig();
  return { config, hasKey: Boolean(apiKey) };
}

export function saveAiConfig(raw: unknown) {
  const patch = aiConfigPatchSchema.parse(raw);
  const { clearKey, apiKey, ...fields } = patch;
  const current = getAiConfig();
  const next = storedSchema.parse({
    ...current,
    ...fields,
    apiKey: clearKey ? "" : apiKey || current.apiKey,
  });
  db.insert(schema.settings)
    .values({ key: "ai", value: next })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: next, updatedAt: new Date() },
    })
    .run();
  return publicAiConfig();
}

/** 在出站前增加调用及未知计数，即使失败、中断或进程退出也保留尝试记录。 */
export function beginAiUsage(): string {
  const day = new Date().toISOString().slice(0, 10);
  const table = schema.aiUsage;
  db.insert(table)
    .values({ day, calls: 1, unknownUsage: 1 })
    .onConflictDoUpdate({
      target: table.day,
      set: { calls: sql`${table.calls} + 1`, unknownUsage: sql`${table.unknownUsage} + 1` },
    })
    .run();
  return day;
}

export function completeAiUsage(day: string, input?: number, output?: number) {
  const valid = (value: number | undefined) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!valid(input) && !valid(output)) return;
  const table = schema.aiUsage;
  db.update(table)
    .set({
      inputTokens: sql`${table.inputTokens} + ${valid(input) ? input! : 0}`,
      outputTokens: sql`${table.outputTokens} + ${valid(output) ? output! : 0}`,
      unknownUsage: sql`${table.unknownUsage} - ${valid(input) && valid(output) ? 1 : 0}`,
    })
    .where(eq(table.day, day))
    .run();
}

export function getAiUsage() {
  return {
    days: db.select().from(schema.aiUsage).orderBy(desc(schema.aiUsage.day)).limit(30).all(),
  };
}
