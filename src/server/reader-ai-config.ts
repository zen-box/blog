import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ReaderAiConfig } from "@/lib/reader-ai";

export const readerAiConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    autoSummary: z.boolean().default(false),
    showSummary: z.boolean().default(true),
    showBenchmark: z.boolean().default(true),
  })
  .strict();
export const readerAiConfigPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    autoSummary: z.boolean().optional(),
    showSummary: z.boolean().optional(),
    showBenchmark: z.boolean().optional(),
  })
  .strict();

export function getReaderAiConfig(): ReaderAiConfig {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "reader-ai")).get();
  return readerAiConfigSchema.parse(row?.value ?? {});
}
export function saveReaderAiConfig(raw: unknown): ReaderAiConfig {
  const config = readerAiConfigSchema.parse({
    ...getReaderAiConfig(),
    ...readerAiConfigPatchSchema.parse(raw),
  });
  db.insert(schema.settings)
    .values({ key: "reader-ai", value: config })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: config, updatedAt: new Date() },
    })
    .run();
  return config;
}
