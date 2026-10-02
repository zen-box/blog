import { pngResponse, siteOgImage } from "@/server/og-image";

export const dynamic = "force-dynamic";

export async function GET() {
  return pngResponse(await siteOgImage());
}
