import { z } from "zod";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import { cancelJob, jobCounts, listJobs, publicJob } from "@/server/background-jobs";
import { retryReaderJob } from "@/server/reader-ai";

export const runtime = "nodejs";
const operation = z.object({ op: z.enum(["retry", "cancel"]), jobId: z.string().uuid() }).strict();
export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    const postId = params.has("postId")
      ? z.coerce.number().int().positive().parse(params.get("postId"))
      : undefined;
    const limit = params.has("limit")
      ? z.coerce.number().int().min(1).max(100).parse(params.get("limit"))
      : 50;
    return adminJson({ jobs: listJobs(postId, limit).map(publicJob), counts: jobCounts() });
  } catch (error) {
    return aiHttpError(error);
  }
}
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = operation.parse(await readAdminJson(request));
    return adminJson({
      job: publicJob(input.op === "retry" ? retryReaderJob(input.jobId) : cancelJob(input.jobId)),
    });
  } catch (error) {
    return aiHttpError(error);
  }
}
