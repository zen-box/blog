// 忘记密码时使用：删除管理员账号与登录状态，文章等内容不受影响。
// 之后打开 /admin 会重新出现“创建管理员”页面。
//   本地：npm run reset-admin
//   Docker：docker compose exec blog node reset-admin.mjs
import path from "node:path";

import Database from "better-sqlite3";

const file = path.join(path.resolve(process.env.DATA_DIR || "data"), "blog.db");
const db = new Database(file);
db.transaction(() => {
  for (const table of ["session", "account", "verification", "user"]) {
    db.prepare(`DELETE FROM "${table}"`).run();
  }
})();
db.close();
console.log(`已重置管理员账号（${file}），请访问 /admin 重新创建。`);
