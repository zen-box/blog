import { clientIp, rateLimit } from "@/server/request";
import { searchPosts } from "@/server/search";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 100) ?? "";
  if (!rateLimit(`search:${clientIp(request.headers)}`, 60, 60_000)) {
    return Response.json({ hits: [] }, { status: 429 });
  }
  return Response.json({ hits: searchPosts(q) });
}
