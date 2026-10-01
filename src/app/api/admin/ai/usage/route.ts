import { getAiUsage } from "@/server/ai-config";
import { adminJson, aiHttpError, guardAiAdmin } from "@/server/ai-http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    return adminJson(getAiUsage());
  } catch (error) {
    return aiHttpError(error);
  }
}
