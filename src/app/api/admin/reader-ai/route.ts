import { z } from "zod";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import { getReaderAiConfig, saveReaderAiConfig } from "@/server/reader-ai-config";
import { publicJob } from "@/server/background-jobs";
import {
  enqueueSummary,
  extractReaderBenchmark,
  getReaderAiAdminState,
  readerAiOperationSchema,
  saveReaderBenchmark,
  saveReaderSummary,
} from "@/server/reader-ai";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    const raw = new URL(request.url).searchParams.get("postId");
    return adminJson(
      raw === null
        ? { config: getReaderAiConfig() }
        : getReaderAiAdminState(z.coerce.number().int().positive().parse(raw)),
    );
  } catch (error) {
    return aiHttpError(error);
  }
}
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = readerAiOperationSchema.parse(await readAdminJson(request));
    switch (input.op) {
      case "settings":
        return adminJson({ config: saveReaderAiConfig(input.config) });
      case "generate":
        return adminJson(
          { job: publicJob(enqueueSummary(input.postId, input.contentHash, input.force ?? true)) },
          202,
        );
      case "saveSummary":
        return adminJson(saveReaderSummary(input.postId, input.contentHash, input.text));
      case "extractBenchmark":
        return adminJson(extractReaderBenchmark(input.postId));
      case "saveBenchmark":
        return adminJson(
          saveReaderBenchmark(input.postId, input.contentHash, input.conclusion, input.itemKeys),
        );
    }
  } catch (error) {
    return aiHttpError(error);
  }
}
