// 构建后把静态资源复制进 standalone 目录，使 .next/standalone 可以独立运行
import fs from "node:fs";

const out = ".next/standalone";
if (!fs.existsSync(out)) process.exit(0);

fs.cpSync(".next/static", `${out}/.next/static`, { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", `${out}/public`, { recursive: true });
fs.cpSync("scripts/reset-admin.mjs", `${out}/reset-admin.mjs`);
console.log("standalone 产物已就绪：node .next/standalone/server.js");
