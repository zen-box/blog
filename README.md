# 拾光手记

一个注重排版与动效的个人博客系统：Next.js 16 + SQLite，自带完整后台，一个容器即可部署。

- **前台**：页面转场（封面与标题共享元素变形）、明暗模式圆形扩散切换、平滑滚动、阅读进度、悬浮目录、图片灯箱、全文搜索（⌘K / Ctrl K）、评论、点赞、归档时间线、分类标签、说说、友链、RSS、站点地图
- **Markdown**：GFM、Shiki 代码高亮（标题 / 行号 / 高亮行 / diff / 聚焦 / 代码组）、KaTeX 公式、Mermaid 图表、提示框、折叠、标签页、脚注、图注与多图、B 站 / YouTube / 网易云嵌入、键盘按键、黑幕、徽章、注音等
- **后台**：仪表盘与访问统计、所见即所得的分栏编辑器（实时预览、粘贴 / 拖入图片上传、草稿自动保存、本地备份）、定时发布、评论审核与回复、说说、友链申请、媒体库、站点设置（Logo 与网站图标、主题色、导航、社交、SMTP 邮件通知、备案信息）
- **存储**：图片上传后自动转 WebP 并生成缩略图与模糊占位；可存本地，也可存到任意 S3 兼容存储（Garage、MinIO、Cloudflare R2、阿里云 OSS、腾讯云 COS、AWS S3），支持一键迁移
- **部署**：SQLite 单文件数据库，数据全部在 `data/` 目录，一个容器即可运行

## 技术栈

| 层     | 选型                                                 |
| ------ | ---------------------------------------------------- |
| 框架   | Next.js 16.3（App Router）、React 19.3、TypeScript 6 |
| 样式   | Tailwind CSS 4、shadcn/ui（Base UI）                 |
| 动效   | React `<ViewTransition>`、Motion 13、Lenis           |
| 数据   | SQLite（better-sqlite3）+ Drizzle ORM                |
| 认证   | Better Auth                                          |
| 内容   | unified（remark / rehype）、Shiki 4、KaTeX、Mermaid  |
| 编辑器 | CodeMirror 6                                         |
| 图片   | sharp、ThumbHash                                     |

## 本地开发

需要 Node.js 24。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>，后台在 <http://localhost:3000/admin>。首次进入后台会要求创建管理员账号（只能创建一个），同时会放入一篇《Markdown 语法指南》草稿，打开它就能在编辑器里对照所有语法的实时效果。

想先看看效果，可以生成示例内容（仅在数据库为空时生效）：

```bash
npm run seed:demo
```

## 部署

### 方式一：Docker Compose + Caddy（推荐）

Caddy 会自动申请和续期 HTTPS 证书。

1. 服务器安装 Docker，把域名解析到服务器
2. 上传项目代码，复制配置文件并填写域名：

   ```bash
   cp .env.example .env
   ```

3. 构建并启动：

   ```bash
   docker compose up -d --build
   ```

4. 打开 `https://你的域名/admin` 创建管理员

国内服务器构建较慢时，在 `.env` 中取消注释 `NPM_REGISTRY=https://registry.npmmirror.com`；拉取镜像慢可以给 Docker 配置镜像加速。

更新版本：拉取新代码后再次执行 `docker compose up -d --build`，数据库结构会在启动时自动迁移。

### 方式二：已有 Nginx / 宝塔 / 1Panel

删除 `docker-compose.yml` 中的 `caddy` 服务，并给 `blog` 服务加上 `ports: ["127.0.0.1:3000:3000"]`，然后在 Nginx 中反向代理：

```nginx
server {
    listen 443 ssl;
    server_name blog.example.com;
    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 30m;   # 默认 1m，图片上传会失败

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`.env` 中的 `SITE_DOMAIN` 仍需填写，它决定了站点地址 `SITE_URL`。

### 方式三：不用 Docker

```bash
npm ci
npm run build
SITE_URL=https://blog.example.com npm start
```

建议用 PM2 或 systemd 守护进程。数据保存在项目的 `data/` 目录。

> `SITE_URL` 必须与浏览器访问的地址完全一致（包括 `https` 与是否带 `www`），否则登录会因来源校验失败。

## 数据与备份

所有数据都在 `data/` 目录（Docker 部署时挂载在宿主机的 `./data`）：

| 路径                | 内容                       |
| ------------------- | -------------------------- |
| `data/blog.db`      | 数据库：文章、评论、设置等 |
| `data/uploads/`     | 上传的图片与附件           |
| `data/.auth-secret` | 自动生成的登录密钥         |

- **备份**：后台「设置 → 高级」可以直接下载数据库；完整备份就是把整个 `data/` 目录打包
- **迁移**：把 `data/` 复制到新服务器，启动即可
- **忘记密码**：执行下面的命令删除管理员账号（文章等内容不受影响），再打开 `/admin` 重新创建

  ```bash
  docker compose exec blog node reset-admin.mjs   # Docker
  npm run reset-admin                              # 非 Docker
  ```

## 对象存储（S3 / Garage）

在后台「设置 → 存储」中切换为「S3 兼容存储」并填写配置，点「测试」会实际写入、读取并删除一个测试文件，出错时会提示原因。之后新上传的文件都存到 S3；已有的本地文件可以用同一页的「迁移本地文件」一键搬过去。

- **文章不用改**：文章里的图片地址始终是 `/uploads/...`，每个文件记录自己存放在哪里。切换存储、更换 CDN 域名后，文章会自动重新渲染
- **公开访问地址**：填了 CDN 或自定义域名时，图片直接从那里加载，不占用服务器带宽；留空时由博客服务器从 S3 读取后转发，存储桶可以保持私有
- **上传经由博客服务器**：图片需要先在服务器上转码压缩，所以不需要给存储桶配置 CORS

以 Garage 为例（与博客在同一个 Docker 网络中）：

| 配置项       | 填写                                                        |
| ------------ | ----------------------------------------------------------- |
| Endpoint     | `http://garage:3900`（S3 API 端口）                         |
| Region       | `garage`（与 `garage.toml` 中的 `s3_region` 一致）          |
| 路径风格     | 开启                                                        |
| 公开访问地址 | 开启 website 模式并绑定域名后填该域名；不想公开存储桶就留空 |

```bash
garage bucket create blog
garage key create blog-key
garage bucket allow --read --write blog --key blog-key
garage bucket website --allow blog   # 可选：需要公开访问地址时
```

> Garage 不支持 ACL 和存储桶策略，所以不能靠「设为公开读」来直链访问，只能通过 website 模式或由博客转发。

## 环境变量

| 变量                   | 说明                                                                             |
| ---------------------- | -------------------------------------------------------------------------------- |
| `SITE_URL`             | 站点地址，例如 `https://blog.example.com`（Compose 中由 `SITE_DOMAIN` 自动生成） |
| `DATA_DIR`             | 数据目录，默认项目下的 `data/`，容器内为 `/data`                                 |
| `BETTER_AUTH_SECRET`   | 可选，登录密钥；不填会自动生成并保存                                             |
| `NEXT_PUBLIC_TIMEZONE` | 可选，显示时间所用的时区，默认 `Asia/Shanghai`，需在构建时设置                   |

## Markdown 速查

完整示例见后台的《Markdown 语法指南》草稿。

| 效果                     | 写法                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 高亮                     | `==文字==`                                                                                                    |
| 代码块标题、行号、高亮行 | ` ```ts title="a.ts" showLineNumbers {2,4-5} `                                                                |
| diff / 高亮 / 聚焦某一行 | 行尾注释 `// [!code ++]`、`// [!code --]`、`// [!code highlight]`、`// [!code focus]`                         |
| 代码组                   | `:::code-group` 内放多个代码块，语言后写 `[标签名]`                                                           |
| 提示框                   | `> [!TIP]`，或 `:::tip[标题]` … `:::`（note / info / tip / success / important / warning / caution / danger） |
| 折叠                     | `:::details[点击展开]` … `:::`                                                                                |
| 标签页                   | `::::tabs` 内放多个 `:::tab[名称]`                                                                            |
| 公式                     | `$E=mc^2$`、`$$ … $$`                                                                                         |
| 图表                     | ` ```mermaid `                                                                                                |
| 摘要分隔                 | `<!-- more -->` 之前的内容作为列表摘要                                                                        |
| 嵌入                     | `::bilibili[BV号]`、`::youtube[视频ID]`、`::netease[歌曲ID]`、`::video{src="…"}`                              |
| 行内扩展                 | `:kbd[Ctrl]`、`:spoiler[黑幕]`、`:badge[新]{type=tip}`、`:ruby[汉字]{rt="pīn yīn"}`、`H:sub[2]O`、`x:sup[2]`  |

图片的 `"标题"` 会显示为图注，连续的多张图片会自动排成网格，点击可放大。

## 目录结构

```
src/
├── app/
│   ├── (site)/          前台页面
│   ├── admin/           后台页面与 Server Actions
│   ├── api/             接口：认证、评论、搜索、上传、统计等
│   ├── feed.xml/        RSS
│   └── uploads/         上传文件访问
├── components/
│   ├── site/            前台布局与通用组件
│   ├── post/            文章正文、评论、目录、灯箱
│   ├── admin/           后台组件与编辑器
│   └── ui/              shadcn/ui 组件
├── db/                  数据表定义与连接
├── lib/                 Markdown 渲染管线、认证、设置、工具函数
├── server/              数据查询与业务逻辑
└── styles/              正文排版与页面转场样式
drizzle/                 数据库迁移
```

## 常用命令

| 命令                                 | 说明                                   |
| ------------------------------------ | -------------------------------------- |
| `npm run dev`                        | 开发模式                               |
| `npm run build` / `npm start`        | 构建 / 运行生产版本                    |
| `npm run lint` / `npm run typecheck` | 代码检查 / 类型检查                    |
| `npm run format`                     | 格式化代码                             |
| `npm run db:generate`                | 修改 `src/db/schema.ts` 后生成迁移文件 |
| `npm run seed:demo`                  | 生成示例内容                           |
| `npm run reset-admin`                | 重置管理员账号                         |
