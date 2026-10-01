import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import { cancelJob, getJob, jobCounts, listJobs, publicJob } from "@/server/background-jobs";
import { isAudioJob, retryAudioJob } from "@/server/post-audio";
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
    const jobs = listJobs(postId, limit).map(publicJob);
    // 任务列表显示文章标题，而不是编号
    const ids = [...new Set(jobs.map((job) => job.postId))];
    const titles = ids.length
      ? Object.fromEntries(
          db
            .select({ id: schema.posts.id, title: schema.posts.title })
            .from(schema.posts)
            .where(inArray(schema.posts.id, ids))
            .all()
            .map((post) => [post.id, post.title]),
        )
      : {};
    return adminJson({ jobs, counts: jobCounts(), titles });
  } catch (error) {
    return aiHttpError(error);
  }
}
export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = operation.parse(await readAdminJson(request));
    if (input.op === "cancel") return adminJson({ job: publicJob(cancelJob(input.jobId)) });
    const job = getJob(input.jobId);
    return adminJson({
      job: publicJob(
        job && isAudioJob(job.type) ? retryAudioJob(input.jobId) : retryReaderJob(input.jobId),
      ),
    });
  } catch (error) {
    return aiHttpError(error);
  }
}
