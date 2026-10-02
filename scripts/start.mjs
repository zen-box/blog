// 不使用 Docker 时的启动入口：pnpm start
// standalone 的 server.js 启动时会切换工作目录，这里先把数据目录固定为项目下的 data/，
// 否则数据库会落在 .next/standalone 里，下次构建时被清空。
import path from "node:path";

process.env.DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
await import("../.next/standalone/server.js");
