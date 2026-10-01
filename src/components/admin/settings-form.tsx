"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  DatabaseBackupIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { rerenderAllAction, saveSettingsAction, testMailAction } from "@/app/admin/actions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { SiteSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

import { ImageField } from "./image-field";
import { LinkCardSettings } from "./link-card-settings";
import { type AccountInfo, SecuritySettings } from "./security-settings";
import { Row, Section } from "./settings-ui";
import { StorageSettings } from "./storage-settings";
import { AiSettings } from "./ai-settings";
import { MusicSettings } from "./music-settings";
import { ReaderAiSettings } from "./reader-ai-settings";

const EASE = [0.16, 1, 0.3, 1] as const;

const SECTIONS = [
  { id: "site", label: "站点" },
  { id: "brand", label: "Logo 与图标" },
  { id: "author", label: "首页与作者" },
  { id: "appearance", label: "外观" },
  { id: "nav", label: "导航" },
  { id: "social", label: "社交链接" },
  { id: "comments", label: "评论" },
  { id: "mail", label: "邮件通知" },
  { id: "links", label: "友链" },
  { id: "footer", label: "页脚与备案" },
  { id: "storage", label: "存储" },
  { id: "linkcards", label: "链接卡片" },
  { id: "ai", label: "AI 写作助手" },
  { id: "music", label: "轻音乐播放器" },
  { id: "reader-ai", label: "读者 AI 内容" },
  { id: "advanced", label: "高级" },
  { id: "account", label: "账号与安全" },
  { id: "devices", label: "登录设备" },
];

const HUES = [
  { name: "黛蓝", hue: 254 },
  { name: "朱砂", hue: 32 },
  { name: "竹青", hue: 158 },
  { name: "藤紫", hue: 300 },
  { name: "琥珀", hue: 70 },
  { name: "青碧", hue: 205 },
];

export function SettingsForm({
  initial,
  hasSmtpPass,
  hasS3Secret,
  mailReady,
  envSiteUrl,
  iconUrl,
  localCount,
  s3Count,
  proxyEndpoint,
  linkPreviewCount,
  account,
}: {
  initial: SiteSettings;
  hasSmtpPass: boolean;
  hasS3Secret: boolean;
  /** 已保存的代理地址（不含用户名密码） */
  proxyEndpoint: string;
  linkPreviewCount: number;
  mailReady: boolean;
  envSiteUrl: string;
  /** 当前网站图标（含默认印章）的地址，用于预览 */
  iconUrl: string;
  localCount: number;
  s3Count: number;
  account: AccountInfo;
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [testTo, setTestTo] = useState(initial.smtp.notifyTo);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setS((cur) => ({ ...cur, [key]: value }));
  const setIn = <K extends "social" | "comments" | "smtp" | "links">(
    key: K,
    patch: Partial<SiteSettings[K]>,
  ) => setS((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));

  // 主题色实时预览；离开页面时恢复为已保存的值
  useEffect(() => {
    document.documentElement.style.setProperty("--hue", String(s.accentHue));
  }, [s.accentHue]);
  useEffect(() => {
    const savedHue = saved.accentHue;
    return () => document.documentElement.style.setProperty("--hue", String(savedHue));
  }, [saved.accentHue]);

  function save() {
    startTransition(async () => {
      const res = await saveSettingsAction(s);
      if (!res.ok) return void toast.error(res.error);
      setSaved(s);
      toast.success("设置已保存");
    });
  }

  async function testMail() {
    setBusy("mail");
    const res = await testMailAction(testTo);
    setBusy(null);
    if (res.ok) toast.success(`测试邮件已发送到 ${testTo}`);
    else toast.error(res.error);
  }

  async function rerender() {
    setBusy("rerender");
    const res = await rerenderAllAction();
    setBusy(null);
    if (res.ok) toast.success(`已重新渲染 ${res.data} 篇内容`);
    else toast.error(res.error);
  }

  const moveNav = (i: number, d: number) => {
    const items = [...s.navItems];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    set("navItems", items);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[9rem_minmax(0,1fr)]">
      <nav className="hidden lg:block">
        <ul className="sticky top-20 space-y-0.5 text-sm">
          {SECTIONS.map((sec) => (
            <li key={sec.id}>
              <a
                href={`#${sec.id}`}
                className="block rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {sec.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-5 pb-24">
        <AiSettings />
        <ReaderAiSettings />
        <MusicSettings />
        <Section id="site" title="站点">
          <Row label="站点名称">
            <Input value={s.siteTitle} onChange={(e) => set("siteTitle", e.target.value)} />
          </Row>
          <Row label="站点描述" hint="用于搜索引擎和 RSS">
            <Input
              value={s.siteDescription}
              onChange={(e) => set("siteDescription", e.target.value)}
            />
          </Row>
          <Row
            label="站点地址"
            hint={envSiteUrl ? "已由环境变量 SITE_URL 指定" : "用于生成 RSS、站点地图中的完整链接"}
          >
            <Input
              value={envSiteUrl || s.siteUrl}
              disabled={!!envSiteUrl}
              onChange={(e) => set("siteUrl", e.target.value)}
              placeholder="https://example.com"
            />
          </Row>
          <Row label="关键词" hint="用逗号分隔">
            <Input value={s.siteKeywords} onChange={(e) => set("siteKeywords", e.target.value)} />
          </Row>
          <Row label="建站日期" hint="页脚显示已运行天数">
            <Input
              type="date"
              value={s.siteStartDate}
              onChange={(e) => set("siteStartDate", e.target.value)}
              className="w-fit"
            />
          </Row>
        </Section>

        <Section
          id="brand"
          title="Logo 与图标"
          description="未设置时，Logo 与网站图标都使用站名首字印章。"
        >
          <Row label="Logo" hint="显示在页头、页脚与后台登录页，建议使用透明背景的 SVG 或 PNG">
            <ImageField
              value={s.logo}
              onChange={(v) => set("logo", v)}
              raw
              accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
              shape="wide"
            />
          </Row>
          <Row label="暗色模式 Logo" hint="可选，深色背景下使用；留空时沿用上面的 Logo">
            <ImageField
              value={s.logoDark}
              onChange={(v) => set("logoDark", v)}
              raw
              accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
              shape="wide"
              dark
            />
          </Row>
          <Row label="显示站点名称" hint="Logo 本身已包含文字时可以关闭">
            <Switch
              checked={s.showTitleWithLogo}
              onCheckedChange={(v) => set("showTitleWithLogo", v)}
            />
          </Row>
          <Row
            label="网站图标"
            hint="浏览器标签页与收藏夹中的图标，建议正方形 PNG（至少 180×180）或 SVG，也支持 ICO"
          >
            <ImageField
              value={s.favicon}
              onChange={(v) => set("favicon", v)}
              raw
              accept=".ico,image/x-icon,image/svg+xml,image/png,image/webp,image/jpeg"
              fallback={iconUrl}
            />
          </Row>
        </Section>

        <Section id="author" title="首页与作者">
          <Row label="首页标题">
            <Input value={s.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
          </Row>
          <Row label="首页副标题">
            <Input value={s.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} />
          </Row>
          <Row label="博主昵称" hint="也用于后台回复评论">
            <Input value={s.authorName} onChange={(e) => set("authorName", e.target.value)} />
          </Row>
          <Row label="头像">
            <ImageField
              value={s.authorAvatar}
              onChange={(v) => set("authorAvatar", v)}
              shape="circle"
            />
          </Row>
          <Row label="个人简介">
            <Textarea
              rows={2}
              value={s.authorBio}
              onChange={(e) => set("authorBio", e.target.value)}
            />
          </Row>
        </Section>

        <Section id="appearance" title="外观" description="主题色会同时推导出亮色与暗色两套配色。">
          <Row label="主题色">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {HUES.map((h) => (
                  <button
                    key={h.hue}
                    type="button"
                    onClick={() => set("accentHue", h.hue)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                      s.accentHue === h.hue
                        ? "border-foreground/40 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ background: `oklch(0.52 0.1 ${h.hue})` }}
                    />
                    {h.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={s.accentHue}
                  onChange={(e) => set("accentHue", Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right in oklch longer hue, oklch(0.6 0.12 0), oklch(0.6 0.12 360))",
                    accentColor: "var(--brand)",
                  }}
                  aria-label="色相"
                />
                <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                  {s.accentHue}°
                </span>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm text-brand-foreground">
                  按钮
                </span>
                <span className="inline-flex h-8 items-center rounded-lg bg-brand-soft px-3 text-sm text-brand">
                  标签
                </span>
                <span className="inline-flex h-8 items-center text-sm text-brand underline underline-offset-4">
                  链接
                </span>
              </div>
            </div>
          </Row>
          <Row label="每页文章数">
            <Input
              type="number"
              min={1}
              max={50}
              value={s.postsPerPage}
              onChange={(e) =>
                set("postsPerPage", Math.min(50, Math.max(1, Number(e.target.value) || 10)))
              }
              className="w-24"
            />
          </Row>
          <Row label="平滑滚动" hint="惯性滚动效果">
            <Switch checked={s.smoothScroll} onCheckedChange={(v) => set("smoothScroll", v)} />
          </Row>
        </Section>

        <Section id="nav" title="导航" description="顶部导航栏的链接。">
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {s.navItems.map((item, i) => (
                <motion.li
                  key={i}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={item.label}
                    onChange={(e) =>
                      set(
                        "navItems",
                        s.navItems.map((n, j) => (j === i ? { ...n, label: e.target.value } : n)),
                      )
                    }
                    placeholder="名称"
                    className="w-28"
                  />
                  <Input
                    value={item.href}
                    onChange={(e) =>
                      set(
                        "navItems",
                        s.navItems.map((n, j) => (j === i ? { ...n, href: e.target.value } : n)),
                      )
                    }
                    placeholder="/archive 或 https://"
                    className="font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label="上移"
                    onClick={() => moveNav(i, -1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="下移"
                    onClick={() => moveNav(i, 1)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <ArrowDownIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={() =>
                      set(
                        "navItems",
                        s.navItems.filter((_, j) => j !== i),
                      )
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <button
            type="button"
            onClick={() => set("navItems", [...s.navItems, { label: "", href: "/" }])}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
            添加链接
          </button>
        </Section>

        <Section id="social" title="社交链接" description="显示在首页和页脚，留空则不显示。">
          {(
            [
              ["github", "GitHub", "用户名或完整地址"],
              ["twitter", "X / Twitter", "用户名或完整地址"],
              ["bilibili", "哔哩哔哩", "UID 或完整地址"],
              ["weibo", "微博", "完整地址"],
              ["zhihu", "知乎", "完整地址"],
              ["email", "邮箱", "you@example.com"],
            ] as const
          ).map(([key, label, ph]) => (
            <Row key={key} label={label}>
              <Input
                value={s.social[key]}
                onChange={(e) => setIn("social", { [key]: e.target.value })}
                placeholder={ph}
              />
            </Row>
          ))}
        </Section>

        <Section id="comments" title="评论">
          <Row label="开启评论">
            <Switch
              checked={s.comments.enabled}
              onCheckedChange={(v) => setIn("comments", { enabled: v })}
            />
          </Row>
          <Row label="审核方式">
            <Select
              items={[
                { value: "first", label: "首次评论需审核" },
                { value: "all", label: "全部需要审核" },
                { value: "none", label: "无需审核，直接显示" },
              ]}
              value={s.comments.moderation}
              onValueChange={(v) =>
                v && setIn("comments", { moderation: v as SiteSettings["comments"]["moderation"] })
              }
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">首次评论需审核</SelectItem>
                <SelectItem value="all">全部需要审核</SelectItem>
                <SelectItem value="none">无需审核，直接显示</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="头像镜像" hint="Gravatar 镜像地址，国内推荐 Cravatar">
            <Input
              value={s.comments.avatarMirror}
              onChange={(e) => setIn("comments", { avatarMirror: e.target.value })}
              className="font-mono text-xs"
            />
          </Row>
          <Row label="屏蔽词" hint="命中后自动归入垃圾评论，每行或用逗号分隔">
            <Textarea
              rows={3}
              value={s.comments.blockedWords}
              onChange={(e) => setIn("comments", { blockedWords: e.target.value })}
            />
          </Row>
        </Section>

        <Section id="mail" title="邮件通知" description="用于新评论提醒、回复通知和友链申请提醒。">
          <Row label="SMTP 服务器">
            <div className="flex gap-2">
              <Input
                value={s.smtp.host}
                onChange={(e) => setIn("smtp", { host: e.target.value })}
                placeholder="smtp.qq.com"
              />
              <Input
                type="number"
                value={s.smtp.port}
                onChange={(e) => setIn("smtp", { port: Number(e.target.value) || 465 })}
                className="w-24"
              />
            </div>
          </Row>
          <Row label="使用 SSL" hint="端口 465 一般开启，587 关闭">
            <Switch checked={s.smtp.secure} onCheckedChange={(v) => setIn("smtp", { secure: v })} />
          </Row>
          <Row label="账号">
            <Input
              value={s.smtp.user}
              onChange={(e) => setIn("smtp", { user: e.target.value })}
              autoComplete="off"
            />
          </Row>
          <Row label="密码 / 授权码">
            <Input
              type="password"
              value={s.smtp.pass}
              onChange={(e) => setIn("smtp", { pass: e.target.value })}
              placeholder={hasSmtpPass ? "已设置，留空则不修改" : ""}
              autoComplete="new-password"
            />
          </Row>
          <Row label="发件人" hint="留空时使用账号">
            <Input
              value={s.smtp.from}
              onChange={(e) => setIn("smtp", { from: e.target.value })}
              placeholder='"拾光手记" <noreply@example.com>'
            />
          </Row>
          <Row label="通知邮箱" hint="新评论、友链申请发送到这里">
            <Input
              value={s.smtp.notifyTo}
              onChange={(e) => setIn("smtp", { notifyTo: e.target.value })}
            />
          </Row>
          <Row label="发送测试" hint={mailReady ? "使用已保存的配置" : "保存配置后可以测试"}>
            <div className="flex gap-2">
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="收件邮箱"
              />
              <button
                type="button"
                onClick={testMail}
                disabled={busy === "mail"}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
              >
                {busy === "mail" ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <SendIcon className="size-3.5" />
                )}
                发送
              </button>
            </div>
          </Row>
        </Section>

        <Section id="links" title="友链">
          <Row label="开放申请" hint="访客可以在友链页提交申请">
            <Switch
              checked={s.links.allowApply}
              onCheckedChange={(v) => setIn("links", { allowApply: v })}
            />
          </Row>
          <Row label="申请说明" hint="支持 Markdown">
            <Textarea
              rows={5}
              value={s.links.intro}
              onChange={(e) => setIn("links", { intro: e.target.value })}
            />
          </Row>
        </Section>

        <Section id="footer" title="页脚与备案">
          <Row label="页脚文字" hint="留空时显示站点描述">
            <Input value={s.footerText} onChange={(e) => set("footerText", e.target.value)} />
          </Row>
          <Row label="ICP 备案号">
            <Input
              value={s.icp}
              onChange={(e) => set("icp", e.target.value)}
              placeholder="京ICP备00000000号-1"
            />
          </Row>
          <Row label="公安备案号">
            <Input
              value={s.gonganBeian}
              onChange={(e) => set("gonganBeian", e.target.value)}
              placeholder="京公网安备00000000000000号"
            />
          </Row>
          <Row label="公安备案链接">
            <Input
              value={s.gonganLink}
              onChange={(e) => set("gonganLink", e.target.value)}
              className="font-mono text-xs"
            />
          </Row>
          <Row label="版权协议">
            <div className="flex gap-2">
              <Input
                value={s.license}
                onChange={(e) => set("license", e.target.value)}
                className="w-44"
              />
              <Input
                value={s.licenseUrl}
                onChange={(e) => set("licenseUrl", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </Row>
        </Section>

        <StorageSettings
          value={s.storage}
          onChange={(storage) => set("storage", storage)}
          hasSecret={hasS3Secret}
          localCount={localCount}
          s3Count={s3Count}
          dirty={dirty}
        />

        <LinkCardSettings
          linkCards={s.linkCards}
          outbound={s.outbound}
          onLinkCardsChange={(v) => set("linkCards", v)}
          onOutboundChange={(v) => set("outbound", v)}
          proxyEndpoint={proxyEndpoint}
          cached={linkPreviewCount}
        />

        <Section id="advanced" title="高级">
          <Row label="自定义 head" hint="统计代码、站点验证等，支持 script / meta / link / style">
            <Textarea
              rows={5}
              value={s.customHead}
              onChange={(e) => setS((cur) => ({ ...cur, customHead: e.target.value }))}
              className="font-mono text-xs"
              placeholder={'<script defer src="https://…"></script>'}
            />
          </Row>
          <Row label="重新渲染" hint="修改渲染规则后，把所有文章重新生成一遍">
            <button
              type="button"
              onClick={rerender}
              disabled={busy === "rerender"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCwIcon className={cn("size-3.5", busy === "rerender" && "animate-spin")} />
              重新渲染全部内容
            </button>
          </Row>
          <Row label="备份" hint="下载数据库文件；上传的图片位于数据目录的 uploads 文件夹">
            <a
              href="/api/admin/backup"
              download
              className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted"
            >
              <DatabaseBackupIcon className="size-3.5" />
              下载数据库备份
            </a>
          </Row>
        </Section>

        <SecuritySettings
          account={account}
          security={s.security}
          onSecurityChange={(v) => set("security", v)}
          mailReady={mailReady}
          issuer={saved.siteTitle}
        />
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-popover/95 py-2 pr-2 pl-4 text-sm shadow-float backdrop-blur md:left-[calc(50%+var(--sidebar-width,0px)/2)]"
          >
            <span className="text-muted-foreground">有未保存的修改</span>
            <button
              type="button"
              onClick={() => setS(saved)}
              className="h-8 rounded-lg px-3 text-muted-foreground hover:text-foreground"
            >
              撤销
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-background hover:opacity-90 disabled:opacity-50"
            >
              {pending ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              保存设置
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
