import "server-only";

import fs from "node:fs";
import path from "node:path";

import { clientIp, rateLimit } from "@/server/request";
import { trackScriptDownload } from "@/server/stats";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!rateLimit(`server-init:${clientIp(request.headers)}`, 20, 10 * 60_000)) {
    return new Response("Too many requests\n", {
      status: 429,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "600" },
    });
  }

  try {
    const script = fs.readFileSync(path.join(process.cwd(), "scripts", "server-init.sh"), "utf8");
    trackScriptDownload();
    return new Response(script, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'inline; filename="server-init.sh"',
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("server-init.sh is unavailable\n", { status: 503 });
  }
}
