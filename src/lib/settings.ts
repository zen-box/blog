import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";

const navItem = z.object({ label: z.string(), href: z.string() });

export const siteSettingsSchema = z.object({
  siteTitle: z.string().default("拾光手记"),
  siteDescription: z.string().default("写代码，也写生活。"),
  siteUrl: z.string().default("http://localhost:3000"),
  siteKeywords: z.string().default("博客,前端,生活"),
  /** 站点 Logo（留空时显示站名首字印章） */
  logo: z.string().default(""),
  /** 暗色模式下使用的 Logo，可选 */
  logoDark: z.string().default(""),
  /** 有 Logo 时是否同时显示站点名称 */
  showTitleWithLogo: z.boolean().default(true),
  /** 浏览器标签页图标（留空时使用印章图标） */
  favicon: z.string().default(""),
  /** 首页大标题 */
  heroTitle: z.string().default("写代码，也写生活。"),
  /** 首页副标题 */
  heroSubtitle: z.string().default("一个前端开发者的笔记本"),
  authorName: z.string().default("博主"),
  authorAvatar: z.string().default(""),
  authorBio: z.string().default("热爱技术，也热爱生活。"),
  /** 主题色相（OKLCH hue，0-360），默认黛蓝 */
  accentHue: z.number().min(0).max(360).default(254),
  navItems: z.array(navItem).default([
    { label: "首页", href: "/" },
    { label: "归档", href: "/archive" },
    { label: "说说", href: "/moments" },
    { label: "友链", href: "/links" },
    { label: "关于", href: "/about" },
  ]),
  social: z
    .object({
      github: z.string().default(""),
      email: z.string().default(""),
      twitter: z.string().default(""),
      bilibili: z.string().default(""),
      weibo: z.string().default(""),
      zhihu: z.string().default(""),
    })
    .prefault({}),
  postsPerPage: z.number().int().min(1).max(50).default(10),
  /** 建站日期，用于页脚「已运行 N 天」 */
  siteStartDate: z.string().default(""),
  footerText: z.string().default(""),
  icp: z.string().default(""),
  gonganBeian: z.string().default(""),
  gonganLink: z.string().default(""),
  license: z.string().default("CC BY-NC-SA 4.0"),
  licenseUrl: z.string().default("https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans"),
  comments: z
    .object({
      enabled: z.boolean().default(true),
      /** first: 首次评论需审核；all: 全部审核；none: 直接显示 */
      moderation: z.enum(["first", "all", "none"]).default("first"),
      avatarMirror: z.string().default("https://cravatar.cn/avatar/"),
      blockedWords: z.string().default(""),
    })
    .prefault({}),
  smtp: z
    .object({
      host: z.string().default(""),
      port: z.number().int().default(465),
      secure: z.boolean().default(true),
      user: z.string().default(""),
      pass: z.string().default(""),
      from: z.string().default(""),
      /** 新评论通知发送到的邮箱 */
      notifyTo: z.string().default(""),
    })
    .prefault({}),
  links: z
    .object({
      allowApply: z.boolean().default(true),
      /** 友链页顶部说明（Markdown） */
      intro: z
        .string()
        .default(
          "欢迎交换友链～ 请先在你的站点添加本站，然后在下方提交申请。\n\n- 站点可正常访问，内容以原创为主\n- 不含违法违规内容",
        ),
    })
    .prefault({}),
  /** 注入到 <head> 的自定义 HTML，例如统计脚本 */
  customHead: z.string().default(""),
  smoothScroll: z.boolean().default(true),
  storage: z
    .object({
      /** 新上传的文件存放位置；已有文件各自记录存放位置，不受影响 */
      driver: z.enum(["local", "s3"]).default("local"),
      s3: z
        .object({
          endpoint: z.string().default(""),
          region: z.string().default("auto"),
          bucket: z.string().default(""),
          accessKeyId: z.string().default(""),
          secretAccessKey: z.string().default(""),
          /** 对象键前缀，例如 blog/ */
          prefix: z.string().default(""),
          /** 路径风格访问（Garage、MinIO 通常需要） */
          forcePathStyle: z.boolean().default(true),
          /** 公开访问地址（CDN / 自定义域名）；留空时由博客服务器转发 */
          publicUrl: z.string().default(""),
        })
        .prefault({}),
    })
    .prefault({}),
  /** 服务器访问外部网站的方式：链接卡片抓取、外部网站图标下载都走这里 */
  outbound: z
    .object({
      mode: z.enum(["direct", "proxy"]).default("direct"),
      /** HTTP(S) 代理，例如 http://user:pass@proxy-host:8888 */
      proxy: z.string().default(""),
    })
    .prefault({}),
  linkCards: z
    .object({
      /** 单独一行的网址显示为卡片，标题、简介和封面在后台抓取 */
      enabled: z.boolean().default(false),
    })
    .prefault({}),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const KEY = "site";

type Cache = { value?: SiteSettings };
const cache = globalThis as typeof globalThis & { __blogSettings?: Cache };
cache.__blogSettings ??= {};

export function getSettings(): SiteSettings {
  const hit = cache.__blogSettings!.value;
  if (hit) return hit;

  const row = db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).get();
  const parsed = siteSettingsSchema.safeParse(row?.value ?? {});
  const value = parsed.success ? parsed.data : siteSettingsSchema.parse({});
  cache.__blogSettings!.value = value;
  return value;
}

export function saveSettings(patch: Partial<SiteSettings>): SiteSettings {
  const next = siteSettingsSchema.parse({ ...getSettings(), ...patch });
  db.insert(schema.settings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: next, updatedAt: new Date() },
    })
    .run();
  cache.__blogSettings!.value = next;
  return next;
}

/** 站点绝对地址（去掉末尾斜杠），优先使用环境变量 */
export function siteUrl(): string {
  const url = process.env.SITE_URL || getSettings().siteUrl;
  return url.replace(/\/+$/, "");
}

/** 站内相对地址补全为绝对地址；已经是完整地址（例如 S3 直链）时原样返回 */
export function absoluteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${siteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}
