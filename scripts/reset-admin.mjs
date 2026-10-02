// 忘记密码、或者丢了两步验证的手机时使用。文章等内容不受影响。
//
// 重置管理员：删除管理员账号与登录状态，之后打开 /admin 会重新出现“创建管理员”页面
//   本地：pnpm reset-admin
//   Docker：docker compose exec blog node reset-admin.mjs
//
// 只关闭两步验证（保留账号和密码）：加上 --2fa
//   本地：pnpm reset-admin --2fa
//   Docker：docker compose exec blog node reset-admin.mjs --2fa
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const dataDir = path.resolve(process.env.DATA_DIR || "data");
const file = path.join(dataDir, "blog.db");
const db = new Database(file, { fileMustExist: true });
const hasTwoFactor = !!db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'two_factor'")
  .get();

if (process.argv.includes("--2fa")) {
  if (hasTwoFactor) {
    db.transaction(() => {
      db.prepare('DELETE FROM "two_factor"').run();
      db.prepare('UPDATE "user" SET "two_factor_enabled" = 0').run();
    })();
  }
  db.close();
  console.log(
    "已关闭两步验证，现在用邮箱和密码就能登录。登录后建议在「设置 → 账号与安全」里重新开启。",
  );
} else {
  db.transaction(() => {
    const tables = [
      "session",
      "account",
      "verification",
      ...(hasTwoFactor ? ["two_factor"] : []),
      "user",
    ];
    for (const table of tables) db.prepare(`DELETE FROM "${table}"`).run();
  })();
  db.close();
  console.log(`已重置管理员账号（${file}）。`);
  console.log(`打开 /admin 重新创建管理员，需要填写设置令牌：${writeSetupToken()}`);
}

/** 生成新的设置令牌，格式与博客服务端一致（去掉容易看错的 0/O、1/I/L） */
function writeSetupToken() {
  if (process.env.ADMIN_SETUP_TOKEN) return "环境变量 ADMIN_SETUP_TOKEN 的值";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chars = Array.from({ length: 16 }, () => alphabet[crypto.randomInt(alphabet.length)]);
  const token = [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
  const tokenFile = path.join(dataDir, ".setup-token");
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  // docker compose exec 默认以 root 运行：把文件交还给数据目录的所有者，博客进程才能读到
  try {
    const { uid, gid } = fs.statSync(dataDir);
    fs.chownSync(tokenFile, uid, gid);
  } catch {
    // Windows 等不支持 chown 的系统忽略
  }
  return token;
}
