# 拾光手记

一个注重排版与动效的个人博客系统：Next.js 16 + SQLite，自带完整后台，一个容器即可部署。

- **前台**：页面转场（封面与标题共享元素变形）、明暗模式圆形扩散切换、平滑滚动、阅读进度、悬浮目录、图片灯箱、全文搜索（⌘K / Ctrl K）、评论、点赞、归档时间线、分类标签、说说、友链、RSS、站点地图
- **Markdown**：GFM、Shiki 代码高亮（标题 / 行号 / 高亮行 / diff / 聚焦 / 代码组）、KaTeX 公式、Mermaid 图表、数据图表（CSV 生成柱状 / 折线 / 饼图 / 雷达，也支持完整的 ECharts 配置）、思维导图、提示框、折叠、标签页、脚注、图注与多图、B 站 / YouTube / 网易云嵌入、键盘按键、黑幕、徽章、注音等
- **后台**：仪表盘与访问统计、所见即所得的分栏编辑器（实时预览、粘贴 / 拖入图片上传、草稿自动保存、本地备份）、定时发布、评论审核与回复、说说、友链申请、媒体库、站点设置（Logo 与网站图标、主题色、导航、社交、SMTP 邮件通知、备案信息）、账号安全（两步验证、登录设备管理、新登录邮件提醒）
- **存储**：图片上传后自动转 WebP 并生成缩略图与模糊占位；可存本地，也可存到任意 S3 兼容存储（Garage、MinIO、Cloudflare R2、阿里云 OSS、腾讯云 COS、AWS S3），支持一键迁移
- **部署**：SQLite 单文件数据库，数据全部在 `data/` 目录，一个容器即可运行；提供 amd64 / arm64 预构建镜像

## 技术栈

| 层     | 选型                                                                  |
| ------ | --------------------------------------------------------------------- |
| 框架   | Next.js 16.3（App Router）、React 19.3、TypeScript 6                  |
| 样式   | Tailwind CSS 4、shadcn/ui（Base UI）                                  |
| 动效   | React `<ViewTransition>`、Motion 13、Lenis                            |
| 数据   | SQLite（better-sqlite3）+ Drizzle ORM                                 |
| 认证   | Better Auth                                                           |
| 内容   | unified（remark / rehype）、Shiki 4、KaTeX、Mermaid、ECharts、markmap |
| 编辑器 | CodeMirror 6                                                          |
| 图片   | sharp、ThumbHash                                                      |

## 本地开发

需要 Node.js 24。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>，后台在 <http://localhost:3000/admin>。首次进入后台会要求创建管理员账号（只能创建一个），需要填写终端里打印的设置令牌；创建后会放入一篇《Markdown 语法指南》草稿，打开它就能在编辑器里对照所有语法的实时效果。

想先看看效果，可以生成示例内容（仅在数据库为空时生效）：

```bash
npm run seed:demo
```

## 部署

### 方式一：Docker Compose + Caddy（推荐）

Caddy 会自动申请和续期 HTTPS 证书。博客镜像由 GitHub Actions 预先构建好（`ghcr.io/zen-box/blog`，支持 amd64 / arm64），服务器直接拉取，不需要在服务器上安装依赖和编译。

1. 服务器安装 Docker，把域名解析到服务器
2. 获取部署文件，复制配置文件并填写域名：

   ```bash
   git clone https://github.com/zen-box/blog.git && cd blog
   cp .env.example .env
   ```

3. 启动：

   ```bash
   docker compose up -d
   ```

4. 打开 `https://你的域名/admin` 创建管理员。页面会要求填写设置令牌，它打印在日志里：

   ```bash
   docker compose logs blog | grep 设置令牌
   ```

更新版本（数据库结构会在启动时自动迁移）：

```bash
docker compose pull && docker compose up -d
```

默认使用最新正式版；想固定在某个版本，在 `.env` 中设置 `BLOG_VERSION=0.1.0`。

**从源码构建**：改过代码，或者服务器访问 ghcr.io 较慢时，可以在服务器上构建镜像，更新时先 `git pull` 再执行同样的命令：

```bash
docker compose up -d --build
```

国内服务器构建较慢时，在 `.env` 中取消注释 `NPM_REGISTRY=https://registry.npmmirror.com`。

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

### 发布新版本

推送 `v` 开头的版本标签，GitHub Actions 会自动构建 amd64 / arm64 镜像并推送到 `ghcr.io/zen-box/blog`（工作流见 `.github/workflows/docker.yml`，进度在仓库的 Actions 页面查看）：

```bash
git tag v0.1.0
git push origin v0.1.0
```

| 推送的标签      | 生成的镜像标签                          |
| --------------- | --------------------------------------- |
| `v0.1.0`        | `0.1.0`、`0.1`、`latest`                |
| `v0.2.0-beta.1` | `0.2.0-beta.1`（预发布，不更新 latest） |

也可以在 Actions 页面手动运行「Docker 镜像」：选择标签时与推送标签相同，可以用来重新构建失败的版本；选择分支时生成与分支同名的镜像标签（如 `main`），适合发布前试用。

第一次发布后，到 GitHub 个人主页的 **Packages → blog → Package settings** 确认可见性（Danger Zone → Change visibility）为 **Public**；保持私有的话，服务器需要先用 `docker login ghcr.io` 登录才能拉取。

## 数据与备份

所有数据都在 `data/` 目录（Docker 部署时挂载在宿主机的 `./data`）：

| 路径                | 内容                       |
| ------------------- | -------------------------- |
| `data/blog.db`      | 数据库：文章、评论、设置等 |
| `data/uploads/`     | 上传的图片与附件           |
| `data/.auth-secret` | 自动生成的登录密钥         |
| `data/.setup-token` | 创建管理员前的设置令牌     |

- **备份**：后台「设置 → 高级」可以直接下载数据库；完整备份就是把整个 `data/` 目录打包
- **迁移**：把 `data/` 复制到新服务器，启动即可
- **忘记密码**：执行下面的命令删除管理员账号（文章等内容不受影响），它会打印新的设置令牌，再打开 `/admin` 重新创建

  ```bash
  docker compose exec blog node reset-admin.mjs   # Docker
  npm run reset-admin                              # 非 Docker
  ```

- **丢了两步验证的手机，备用码也用完了**：加上 `--2fa` 只关闭两步验证，账号和密码不变

  ```bash
  docker compose exec blog node reset-admin.mjs --2fa   # Docker
  npm run reset-admin -- --2fa                           # 非 Docker
  ```

## 账号安全

- **设置令牌**：全新部署时，创建管理员需要填写设置令牌，防止别人抢在你之前打开 `/admin` 注册。令牌打印在服务器日志里，也保存在 `data/.setup-token`，管理员创建后自动作废；也可以用环境变量 `ADMIN_SETUP_TOKEN` 自己指定
- **两步验证**：在「设置 → 账号与安全」开启，用任意 TOTP 应用（Google Authenticator、Microsoft Authenticator、1Password、Bitwarden 等）扫码。开启时会给出 10 个备用码，手机不在身边时可以代替动态码，每个只能用一次；登录时可以选择 30 天内信任当前设备
- **登录设备**：「设置 → 登录设备」列出所有有效的登录（浏览器、系统、IP、时间），可以单独退出，也可以一键退出其他设备；修改密码后其他设备自动退出
- **登录提醒**：配置好 SMTP 后，每次登录成功都会发邮件提醒，可以在「账号与安全」里关闭
- **防暴力破解**：同一 IP 每分钟最多尝试登录 5 次；动态码每 10 秒最多 3 次、每轮登录最多试 5 次，连续失败 10 次后账号锁定 15 分钟

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

| 变量                   | 说明                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `SITE_URL`             | 站点地址，例如 `https://blog.example.com`（Compose 中由 `SITE_DOMAIN` 自动生成）     |
| `DATA_DIR`             | 数据目录，默认项目下的 `data/`，容器内为 `/data`                                     |
| `BETTER_AUTH_SECRET`   | 可选，登录密钥；不填会自动生成并保存                                                 |
| `ADMIN_SETUP_TOKEN`    | 可选，创建管理员时的设置令牌；不填会自动生成并打印在日志里                           |
| `BLOG_VERSION`         | 可选，仅 Compose 部署：使用的镜像版本，默认 `latest`                                 |
| `NEXT_PUBLIC_TIMEZONE` | 可选，显示时间所用的时区，默认 `Asia/Shanghai`，需在构建时设置（预构建镜像为默认值） |

## Markdown 速查

完整示例见后台的《Markdown 语法指南》草稿。

| 效果                     | 写法                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 高亮                     | `==文字==`                                                                                                                          |
| 代码块标题、行号、高亮行 | ` ```ts title="a.ts" showLineNumbers {2,4-5} `                                                                                      |
| diff / 高亮 / 聚焦某一行 | 行尾注释 `// [!code ++]`、`// [!code --]`、`// [!code highlight]`、`// [!code focus]`                                               |
| 代码组                   | `:::code-group` 内放多个代码块，语言后写 `[标签名]`                                                                                 |
| 提示框                   | `> [!TIP]`，或 `:::tip[标题]` … `:::`（note / info / tip / success / important / warning / caution / danger）                       |
| 折叠                     | `:::details[点击展开]` … `:::`                                                                                                      |
| 标签页                   | `::::tabs` 内放多个 `:::tab[名称]`                                                                                                  |
| 公式                     | `$E=mc^2$`、`$$ … $$`                                                                                                               |
| 图表                     | ` ```mermaid `；数据图表 ` ```chart bar title="标题" unit=ms `（内容为 CSV，第一列是分类）；` ```echarts `；思维导图 ` ```markmap ` |
| 摘要分隔                 | `<!-- more -->` 之前的内容作为列表摘要                                                                                              |
| 嵌入                     | `::bilibili[BV号]`、`::youtube[视频ID]`、`::netease[歌曲ID]`、`::video{src="…"}`                                                    |
| 行内扩展                 | `:kbd[Ctrl]`、`:spoiler[黑幕]`、`:badge[新]{type=tip}`、`:ruby[汉字]{rt="pīn yīn"}`、`H:sub[2]O`、`x:sup[2]`                        |

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
.github/workflows/       推送版本标签后自动构建 Docker 镜像
```

## 常用命令

| 命令                                 | 说明                                        |
| ------------------------------------ | ------------------------------------------- |
| `npm run dev`                        | 开发模式                                    |
| `npm run build` / `npm start`        | 构建 / 运行生产版本                         |
| `npm run lint` / `npm run typecheck` | 代码检查 / 类型检查                         |
| `npm run format`                     | 格式化代码                                  |
| `npm run db:generate`                | 修改 `src/db/schema.ts` 后生成迁移文件      |
| `npm run seed:demo`                  | 生成示例内容                                |
| `npm run reset-admin`                | 重置管理员账号（`-- --2fa` 只关闭两步验证） |
