import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";
import {
  deleteSeries,
  listSeriesAdmin,
  listSeriesCandidates,
  saveSeries,
  SeriesError,
  seriesOperationSchema,
} from "@/server/series";

export const runtime = "nodejs";

const state = () => ({ series: listSeriesAdmin(), candidates: listSeriesCandidates() });

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  return adminJson(state());
}

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    const input = seriesOperationSchema.parse(await readAdminJson(request));
    if (input.op === "delete") {
      deleteSeries(input.id);
      return adminJson(state());
    }
    const id = saveSeries(input);
    return adminJson({ ...state(), id });
  } catch (error) {
    if (error instanceof SeriesError) return adminJson({ error: error.message }, 400);
    return aiHttpError(error);
  }
}
