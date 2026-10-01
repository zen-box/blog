import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/db/schema.ts", "./src/db/reader-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: `${process.env.DATA_DIR ?? "data"}/blog.db`,
  },
});
