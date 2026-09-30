import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // 生成可独立运行的产物，用于 Docker 部署
  output: "standalone",
  // 文件追踪识别不到的运行时依赖：
  // - better-sqlite3 在运行时拼接路径加载二进制
  // - sharp 的原生模块依赖同目录及 @img/sharp-libvips-* 中的动态库
  // - 数据库迁移文件
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/better-sqlite3/prebuilds/linux*.node",
      "./node_modules/@img/**/*",
      "./drizzle/**/*",
    ],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
