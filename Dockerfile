# syntax=docker/dockerfile:1

# ---------- 基础：Node.js + pnpm ----------
FROM node:24-bookworm-slim AS base
WORKDIR /app
# 国内服务器可以用镜像源加速：docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json ./
# pnpm 的版本以 package.json 的 packageManager 字段为准
RUN npm config set registry "$NPM_REGISTRY" \
    && npm install -g "$(node -p "require('./package.json').packageManager.split('+')[0]")" --no-audit --no-fund \
    && pnpm config set registry "$NPM_REGISTRY"

# ---------- 依赖 ----------
# better-sqlite3、sharp 都用自带的预编译文件，不需要编译工具
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 构建 ----------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---------- 运行 ----------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

RUN groupadd --system --gid 1001 blog \
    && useradd --system --uid 1001 --gid blog --no-create-home blog \
    && mkdir -p /data && chown blog:blog /data

# standalone 产物已包含依赖、静态资源、数据库迁移与 reset-admin.mjs
COPY --from=builder /app/.next/standalone ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
