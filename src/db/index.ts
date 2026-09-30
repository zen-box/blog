import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

// 运行时数据目录，不参与构建时的文件追踪
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "data");
export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "uploads");
const DB_FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, "blog.db");
const MIGRATIONS_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.MIGRATIONS_DIR ?? "drizzle",
);

type Holder = { db?: DB; sqlite?: Database.Database };
const holder = globalThis as typeof globalThis & { __blogDb?: Holder };
holder.__blogDb ??= {};

function open(): DB {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  holder.__blogDb!.sqlite = sqlite;
  return db;
}

/** 懒加载连接：构建阶段 import 本模块不会触碰数据库 */
export function getDb(): DB {
  return (holder.__blogDb!.db ??= open());
}

export function getSqlite(): Database.Database {
  getDb();
  return holder.__blogDb!.sqlite!;
}

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
