/**
 * 示例内容（可选）：npm run seed:demo
 * 生成几篇带封面的文章、分类、标签、关于页、说说与友链，方便本地预览效果。
 */
import { count, eq } from "drizzle-orm";
import sharp from "sharp";

import { MARKDOWN_GUIDE } from "../src/content/markdown-guide";
import { db, schema } from "../src/db";
import { renderMarkdown } from "../src/lib/markdown";
import { saveUpload } from "../src/server/media";
import { savePost } from "../src/server/post-service";

const C = {
  paper: "#E9E3D7",
  paper2: "#F1ECE2",
  surface: "#FFFDF9",
  brand: "#2F5C8F",
  brandSoft: "#C9D6E6",
  ochre: "#C9A15F",
  line: "#D6CCBA",
  ink: "#1F1D1A",
  green: "#3E7355",
};

const covers: Record<string, string> = {
  transitions: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="${C.paper}"/>
    <circle cx="1150" cy="430" r="230" fill="${C.ochre}"/>
    <rect x="300" y="260" width="620" height="440" rx="44" fill="${C.surface}"/>
    <rect x="370" y="340" width="280" height="36" rx="18" fill="${C.brand}"/>
    <rect x="370" y="420" width="460" height="24" rx="12" fill="${C.line}"/>
    <rect x="370" y="475" width="390" height="24" rx="12" fill="${C.line}"/>
    <rect x="370" y="530" width="420" height="24" rx="12" fill="${C.line}"/>
    <rect x="780" y="520" width="500" height="300" rx="44" fill="${C.brand}"/>
    <rect x="850" y="600" width="220" height="28" rx="14" fill="${C.brandSoft}"/>
    <rect x="850" y="660" width="330" height="20" rx="10" fill="${C.brandSoft}" opacity=".6"/>
  </svg>`,
  sqlite: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="${C.paper2}"/>
    <circle cx="340" cy="300" r="60" fill="${C.ochre}"/>
    <circle cx="1270" cy="700" r="110" fill="${C.brandSoft}"/>
    <ellipse cx="800" cy="700" rx="320" ry="80" fill="${C.brand}"/>
    <rect x="480" y="600" width="640" height="100" fill="${C.brand}"/>
    <ellipse cx="800" cy="600" rx="320" ry="80" fill="${C.surface}"/>
    <ellipse cx="800" cy="545" rx="320" ry="80" fill="${C.ochre}"/>
    <rect x="480" y="445" width="640" height="100" fill="${C.ochre}"/>
    <ellipse cx="800" cy="445" rx="320" ry="80" fill="${C.surface}"/>
    <ellipse cx="800" cy="390" rx="320" ry="80" fill="${C.brand}"/>
    <rect x="480" y="290" width="640" height="100" fill="${C.brand}"/>
    <ellipse cx="800" cy="290" rx="320" ry="80" fill="${C.surface}"/>
  </svg>`,
  kyoto: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="${C.paper}"/>
    <circle cx="1130" cy="330" r="120" fill="${C.ochre}"/>
    <path d="M0 620 L340 360 L600 540 L900 300 L1240 580 L1600 420 V1000 H0Z" fill="${C.brandSoft}"/>
    <path d="M0 740 L310 540 L560 680 L860 500 L1190 720 L1600 560 V1000 H0Z" fill="${C.brand}"/>
    <path d="M0 850 C380 760 800 930 1600 800 V1000 H0Z" fill="${C.surface}"/>
    <path d="M0 910 C420 850 900 990 1600 890" stroke="${C.line}" stroke-width="10" fill="none"/>
  </svg>`,
  guide: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="${C.paper2}"/>
    <circle cx="800" cy="500" r="300" fill="none" stroke="${C.ink}" stroke-width="46" stroke-linecap="round" stroke-dasharray="1700 300" transform="rotate(-70 800 500)" opacity=".86"/>
    <rect x="1150" y="180" width="120" height="120" rx="18" fill="#B8432F"/>
    <text x="1210" y="262" font-size="72" text-anchor="middle" fill="#fff" font-family="serif">文</text>
  </svg>`,
};

async function cover(name: string) {
  const png = await sharp(Buffer.from(covers[name])).png().toBuffer();
  const saved = await saveUpload(png, `${name}.png`, "image/png");
  return saved.url;
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000);

async function main() {
  const existing =
    db.select({ n: count() }).from(schema.posts).where(eq(schema.posts.type, "post")).get()?.n ?? 0;
  if (existing > 0) {
    console.log("已存在文章，跳过示例数据。");
    return;
  }

  const [fe, be, life, guide] = db
    .insert(schema.categories)
    .values([
      { name: "前端", slug: "frontend", description: "界面、交互与动效", sortOrder: 1 },
      { name: "后端", slug: "backend", description: "服务、数据与部署", sortOrder: 2 },
      { name: "生活", slug: "life", description: "旅行、阅读与日常", sortOrder: 3 },
      { name: "写作", slug: "writing", description: "关于写作这件事", sortOrder: 4 },
    ])
    .returning()
    .all();

  await savePost({
    title: "Markdown 语法指南",
    slug: "markdown-guide",
    content: MARKDOWN_GUIDE,
    status: "published",
    publishedAt: daysAgo(1),
    categoryId: guide.id,
    tags: ["Markdown", "写作"],
    pinned: true,
    cover: await cover("guide"),
  });

  await savePost({
    title: "用 View Transitions 做一次丝滑的页面转场",
    slug: "view-transitions",
    content: `好的转场不是为了炫技，而是让人始终知道“从哪里来、到了哪里”。当封面从列表里平滑地放大成头图，大脑会自动把两个页面联系起来，切换就不再突兀。

<!-- more -->

## 为什么需要转场

页面之间的硬切会打断注意力。用户点开一篇文章，眼前的一切瞬间被替换，需要重新扫视才能确认“我点对了吗”。

共享元素转场解决的正是这个问题：**同一个东西在两个页面之间移动**，而不是消失再出现。

## 三个原则

1. 时长控制在 \`400–600ms\`，太短看不清，太长显得拖沓
2. 进入用快启缓停的曲线，例如 \`cubic-bezier(0.16, 1, 0.3, 1)\`
3. 只动 \`transform\` 和 \`opacity\`，让每一帧都稳稳落在 60fps

## 在 React 里使用

React 19.3 起，\`<ViewTransition>\` 已经是稳定 API：

\`\`\`tsx title="post-card.tsx"
import { ViewTransition } from "react"

export function Cover({ id, src }: { id: number; src: string }) {
  return (
    <ViewTransition name={\`post-cover-\${id}\`} share="morph">
      <img src={src} alt="" />
    </ViewTransition>
  )
}
\`\`\`

> [!TIP]
> 给共享元素加上 \`default="none"\`，可以避免它在无关的转场里也做交叉淡化。

## 尊重用户的选择

有些人对动效敏感。记得在系统开启“减弱动态效果”时关掉位移动画：

\`\`\`css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) {
    animation-duration: 0s !important;
  }
}
\`\`\`

动效应该像一位好的服务生：你几乎察觉不到，但一切都恰到好处。`,
    status: "published",
    publishedAt: daysAgo(11),
    categoryId: fe.id,
    tags: ["动效", "React", "CSS"],
    cover: await cover("transitions"),
  });

  await savePost({
    title: "为什么我的博客选择了 SQLite",
    slug: "why-sqlite",
    content: `个人博客是典型的读多写少：一天也许只写一篇，却要被读上千次。SQLite 开启 WAL 模式后，读几乎不用排队，完全够用。

## 零运维

不需要单独安装数据库服务，也不需要调参。整个数据库就是一个文件：

\`\`\`bash
data/
├── blog.db
└── uploads/
\`\`\`

## 备份，就是复制一个文件

数据库和上传的图片都放在 \`data/\` 目录里，打包就是整站备份，换服务器也只是一次 \`scp\`。

\`\`\`sql
PRAGMA journal_mode = WAL;
VACUUM INTO 'backup/blog.db';
\`\`\`

## 什么时候该换

如果将来需要多台服务器同时写入，再迁移到 PostgreSQL 也不迟。在那之前，小而美的系统，值得一个小而美的数据库。`,
    status: "published",
    publishedAt: daysAgo(30),
    categoryId: be.id,
    tags: ["数据库", "架构"],
    cover: await cover("sqlite"),
  });

  await savePost({
    title: "秋日京都｜在鸭川边走了一整个下午",
    slug: "kyoto-kamogawa",
    content: `没有计划的旅行，反而记住了最多的细节：傍晚的鸭川边，有人在练萨克斯，有人坐在石阶上吃便利店的饭团。

## 关于“慢”

我们总在赶路，却很少真正到达。那天下午我没有打开地图，只是沿着河一直往北走，走到天色变成淡淡的藤紫。

> 旅行的意义，是在陌生的地方，重新遇见熟悉的自己。

## 河面上的光

回来翻照片才发现，拍得最多的，是河面上一闪一闪的光。`,
    status: "published",
    publishedAt: daysAgo(79),
    categoryId: life.id,
    tags: ["旅行", "随笔"],
    cover: await cover("kyoto"),
  });

  for (const [i, content] of [
    "今天把博客的页面转场调顺了，封面从列表飞进文章页的那一下，看了十几遍 :badge[开心]{type=success}",
    "读完了《禅与摩托车维修艺术》。**关注质量本身**，比关注结果更让人平静。",
    "秋天的第一杯桂花拿铁，味道刚刚好。",
  ].entries()) {
    const r = await renderMarkdown(content);
    db.insert(schema.moments)
      .values({ content, html: r.html, createdAt: daysAgo(i * 6 + 2) })
      .run();
  }

  db.insert(schema.links)
    .values([
      {
        name: "阮一峰的网络日志",
        url: "https://www.ruanyifeng.com/blog/",
        description: "科技爱好者周刊",
        group: "博客",
        sortOrder: 1,
      },
      {
        name: "Next.js Blog",
        url: "https://nextjs.org/blog",
        description: "The React Framework",
        group: "技术",
        sortOrder: 2,
      },
      {
        name: "Motion",
        url: "https://motion.dev",
        description: "A modern animation library",
        group: "技术",
        sortOrder: 3,
      },
    ])
    .run();

  console.log("示例内容已生成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
