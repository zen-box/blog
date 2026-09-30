import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getSqlite } from "@/db";
import { getAuth } from "@/lib/auth";
import { formatDateISO } from "@/lib/format";

/** 下载数据库备份（在线备份，不影响正常读写） */
export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const file = path.join(os.tmpdir(), `blog-backup-${Date.now()}.db`);
  await getSqlite().backup(file);
  const data = await fs.promises.readFile(file);
  await fs.promises.rm(file, { force: true });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="blog-${formatDateISO(new Date())}.db"`,
      "Cache-Control": "no-store",
    },
  });
}
