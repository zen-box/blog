import { publicAiConfig, saveAiConfig } from "@/server/ai-config";
import { adminJson, aiHttpError, guardAiAdmin, readAdminJson } from "@/server/ai-http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await guardAiAdmin(request);
  if (denied) return denied;
  try {
    return adminJson(publicAiConfig());
  } catch (error) {
    return aiHttpError(error);
  }
}

export async function POST(request: Request) {
  const denied = await guardAiAdmin(request, true);
  if (denied) return denied;
  try {
    return adminJson(saveAiConfig(await readAdminJson(request)));
  } catch (error) {
    return aiHttpError(error);
  }
}
