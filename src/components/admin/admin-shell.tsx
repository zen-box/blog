"use client";

import {
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  FeatherIcon,
  FileTextIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LinkIcon,
  LogOutIcon,
  MessageCircleIcon,
  PanelsTopLeftIcon,
  PenLineIcon,
  SettingsIcon,
  TagsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Seal } from "@/components/site/seal";
import { ThemeToggle } from "@/components/site/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";

import { ConfirmProvider } from "./confirm";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: keyof Badges;
  exact?: boolean;
};

type Badges = { comments: number; links: number };

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "概览",
    items: [{ title: "仪表盘", href: "/admin", icon: LayoutDashboardIcon, exact: true }],
  },
  {
    label: "内容",
    items: [
      { title: "文章", href: "/admin/posts", icon: FileTextIcon },
      { title: "页面", href: "/admin/pages", icon: PanelsTopLeftIcon },
      { title: "说说", href: "/admin/moments", icon: FeatherIcon },
      { title: "分类与标签", href: "/admin/taxonomy", icon: TagsIcon },
    ],
  },
  {
    label: "互动",
    items: [
      { title: "评论", href: "/admin/comments", icon: MessageCircleIcon, badge: "comments" },
      { title: "友链", href: "/admin/links", icon: LinkIcon, badge: "links" },
    ],
  },
  {
    label: "系统",
    items: [
      { title: "媒体库", href: "/admin/media", icon: ImageIcon },
      { title: "设置", href: "/admin/settings", icon: SettingsIcon },
    ],
  },
];

const TITLES: [RegExp, string][] = [
  [/^\/admin\/posts\/new/, "写文章"],
  [/^\/admin\/posts\/\d+/, "编辑文章"],
  [/^\/admin\/posts/, "文章"],
  [/^\/admin\/pages\/new/, "新建页面"],
  [/^\/admin\/pages\/\d+/, "编辑页面"],
  [/^\/admin\/pages/, "页面"],
  [/^\/admin\/moments/, "说说"],
  [/^\/admin\/taxonomy/, "分类与标签"],
  [/^\/admin\/comments/, "评论"],
  [/^\/admin\/links/, "友链"],
  [/^\/admin\/media/, "媒体库"],
  [/^\/admin\/settings/, "设置"],
  [/^\/admin$/, "仪表盘"],
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function AdminShell({
  children,
  defaultOpen,
  siteTitle,
  iconUrl,
  user,
  badges,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
  siteTitle: string;
  /** 自定义网站图标；为空时显示印章 */
  iconUrl: string | null;
  user: { name: string; email: string };
  badges: Badges;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "后台";
  const isEditor = /^\/admin\/(posts|pages)\/(new|\d+)/.test(pathname);

  async function signOut() {
    await authClient.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <TooltipProvider delay={300}>
      <ConfirmProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <Sidebar variant="inset" collapsible="icon">
            <SidebarHeader>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    render={<Link href="/admin" />}
                    className="group/logo"
                  >
                    {iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={iconUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-lg object-contain"
                      />
                    ) : (
                      <Seal text={siteTitle} className="size-8 shrink-0" />
                    )}
                    <span className="grid leading-tight">
                      <span className="truncate font-serif font-semibold tracking-wide">
                        {siteTitle}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">管理后台</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup className="pb-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="写文章"
                      render={<Link href="/admin/posts/new" />}
                      className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary/90 active:text-sidebar-primary-foreground"
                    >
                      <PenLineIcon />
                      <span>写文章</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
              {NAV.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const count = item.badge ? badges[item.badge] : 0;
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              tooltip={item.title}
                              isActive={isActive(pathname, item)}
                              render={<Link href={item.href} />}
                            >
                              <item.icon />
                              <span>{item.title}</span>
                            </SidebarMenuButton>
                            {count > 0 && (
                              <SidebarMenuBadge className="bg-brand/12 text-brand">
                                {count}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuButton
                          size="lg"
                          className="data-popup-open:bg-sidebar-accent"
                        />
                      }
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft font-serif font-semibold text-brand">
                        {Array.from(user.name)[0] ?? "我"}
                      </span>
                      <span className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">{user.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      </span>
                      <ChevronsUpDownIcon className="ml-auto size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      align="start"
                      className="w-(--anchor-width) min-w-56"
                    >
                      {/* Base UI 的菜单标签必须放在分组里，否则打开菜单时会报错 */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {user.email}
                        </DropdownMenuLabel>
                        <DropdownMenuItem render={<a href="/" target="_blank" rel="noreferrer" />}>
                          <ExternalLinkIcon />
                          查看站点
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<Link href="/admin/settings#account" />}>
                          <SettingsIcon />
                          账号与设置
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={signOut}>
                        <LogOutIcon />
                        退出登录
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-xl md:rounded-t-xl">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 data-vertical:h-4" />
              <h1 className="font-serif text-[0.95rem] font-semibold tracking-wide">{title}</h1>
              <div className="ml-auto flex items-center gap-1">
                {!isEditor && (
                  <a
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="hidden h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    查看站点
                  </a>
                )}
                <ThemeToggle className="size-8" />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </ConfirmProvider>
    </TooltipProvider>
  );
}
