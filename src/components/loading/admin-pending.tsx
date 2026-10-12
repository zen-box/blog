"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Bone, BoneLines, BoneRow, PendingRegion } from "./bones";

type Shape = "dashboard" | "editor" | "media" | "form" | "list";

function shapeOf(pathname: string): Shape {
  if (pathname === "/admin") return "dashboard";
  if (/^\/admin\/(posts|pages)\/(new|\d+)/.test(pathname)) return "editor";
  if (pathname.startsWith("/admin/media")) return "media";
  if (/^\/admin\/(settings|ai)(\/|$)/.test(pathname)) return "form";
  return "list";
}

/** 标题右边有「写文章」「新建页面」按钮的页面 */
const WITH_ACTION = /^\/admin(\/(posts|pages))?\/?$/;

/** 后台的骨架比前台出现得早一点：后台操作频繁，等待感更明显 */
const ADMIN_DELAY = { "--sk-delay": "140ms" } as React.CSSProperties;

/** 后台页面加载中：按目标页的版式画骨架 */
export function AdminPending() {
  const pathname = usePathname();
  const shape = shapeOf(pathname);
  if (shape === "editor") {
    return (
      <PendingRegion className="flex min-h-0 flex-1 flex-col" style={ADMIN_DELAY}>
        <EditorBones />
      </PendingRegion>
    );
  }
  return (
    <PendingRegion
      className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8"
      style={ADMIN_DELAY}
    >
      {/* 与 AdminPage 的标题区同高：衬线标题 + 一行说明 */}
      <BoneRow className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex h-8 items-center">
            <Bone className="h-6 w-24 rounded-lg" />
          </div>
          <div className="mt-1.5 flex h-5 items-center">
            <Bone className="h-3 w-52" />
          </div>
        </div>
        {WITH_ACTION.test(pathname) && <Bone className="h-9 w-24 rounded-lg" />}
      </BoneRow>
      {shape === "dashboard" && <DashboardBones />}
      {shape === "list" && <ListBones />}
      {shape === "media" && <MediaBones />}
      {shape === "form" && <FormBones />}
    </PendingRegion>
  );
}

/** 与后台 Panel 同形的卡片外框 */
function Card({
  i,
  className,
  children,
}: {
  i: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <BoneRow i={i} className={cn("rounded-2xl border border-border bg-card", className)}>
      {children}
    </BoneRow>
  );
}

function CardHead({ width = "w-24" }: { width?: string }) {
  return (
    <div className="flex h-12 items-center border-b border-border/70 px-5">
      <Bone className={cn("h-3.5", width)} />
    </div>
  );
}

function DashboardBones() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((n) => (
          <Card key={n} i={1 + n * 0.5} className="p-5">
            <Bone className="h-3 w-14" />
            <Bone className="mt-5 h-7 w-12 rounded-lg" />
            <Bone className="mt-4 h-3 w-24" />
          </Card>
        ))}
      </div>
      <Card i={3}>
        <CardHead />
        {/* 访问曲线的轮廓 */}
        <div className="relative h-64 px-5 pt-6 pb-5">
          <div className="absolute inset-x-5 top-6 bottom-5 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} className="h-px bg-border/60" />
            ))}
          </div>
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            aria-hidden
            className="relative h-full w-full text-foreground/[0.06] dark:text-foreground/[0.08]"
          >
            <path
              d="M0 34 C 8 33, 14 30, 22 31 S 34 24, 42 26 S 54 14, 62 18 S 74 29, 82 22 S 94 10, 100 12 L 100 40 L 0 40 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((n) => (
          <Card key={n} i={4}>
            <CardHead width="w-20" />
            <div className="divide-y divide-border/60">
              {[70, 56, 64].map((w, k) => (
                <div key={k} className="flex h-[2.6rem] items-center justify-between gap-4 px-5">
                  <Bone className="h-3" style={{ width: `${w}%` }} />
                  <Bone className="h-2.5 w-12" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ListBones() {
  return (
    <>
      <BoneRow i={1} className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Bone className="h-10 w-52 rounded-xl" />
        <Bone className="h-10 w-[min(16rem,100%)] rounded-xl" />
      </BoneRow>
      <Card i={2}>
        <div className="flex h-10 items-center gap-6 border-b border-border/70 px-5">
          <Bone className="h-2.5 w-10" />
          <Bone className="h-2.5 w-10" />
          <Bone className="ml-auto h-2.5 w-10" />
        </div>
        <div className="divide-y divide-border/60">
          {[52, 64, 44, 58, 48, 60].map((w, n) => (
            <div key={n} className="flex h-[4.15rem] items-center gap-6 px-5">
              <div className="min-w-0 flex-1">
                <Bone className="h-3.5" style={{ width: `${w}%` }} />
                <Bone className="mt-2.5 h-2.5 w-32" />
              </div>
              <Bone className="hidden h-5 w-14 sm:block" />
              <Bone className="hidden h-2.5 w-16 md:block" />
              <Bone className="h-2.5 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/** 媒体库：上传区 + 文件卡片（缩略图和两行说明） */
function MediaBones() {
  return (
    <>
      <BoneRow
        i={1}
        className="mb-5 flex h-[8.9rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border"
      >
        <Bone className="size-6 rounded-md" />
        <Bone className="h-3 w-56" />
        <Bone className="h-2.5 w-24" />
      </BoneRow>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, n) => (
          <Card key={n} i={2 + Math.floor(n / 5)} className="overflow-hidden">
            <Bone className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2.5 px-3 py-3">
              <Bone className="h-3 w-[80%]" />
              <Bone className="h-2.5 w-[45%]" />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

/** 设置、AI：左侧分节目录 + 表单卡片 */
function FormBones() {
  return (
    <div className="grid gap-6 lg:grid-cols-[10rem_1fr] lg:gap-8">
      <BoneRow i={1} className="hidden space-y-[1.15rem] px-3 pt-2 lg:block">
        {[38, 70, 64, 40, 40, 64, 40].map((w, n) => (
          <Bone key={n} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </BoneRow>
      <Card i={2}>
        <div className="flex h-14 items-center border-b border-border/70 px-5">
          <Bone className="h-4 w-16" />
        </div>
        <div className="space-y-6 px-5 py-5">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="grid gap-3 md:grid-cols-[11rem_1fr] md:gap-6">
              <div>
                <Bone className="h-3.5 w-16" />
                <Bone className="mt-2.5 h-2.5 w-24" />
              </div>
              <Bone className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** 编辑器：顶部工具条，左边写作区、右边预览 */
function EditorBones() {
  return (
    <>
      <BoneRow className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 px-4 md:px-6">
        <Bone className="h-3.5 w-12" />
        <Bone className="h-5 w-14" />
        <Bone className="hidden h-3 w-24 sm:block" />
        <div className="ml-auto flex items-center gap-2">
          <Bone className="hidden size-8 rounded-lg md:block" />
          <Bone className="hidden h-8 w-40 rounded-lg md:block" />
          <Bone className="h-8 w-16 rounded-lg" />
          <Bone className="h-8 w-16 rounded-lg" />
        </div>
      </BoneRow>
      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className="px-6 py-8 md:px-10">
          <BoneRow i={1}>
            <Bone className="h-9 w-[68%] rounded-lg" />
          </BoneRow>
          <BoneRow i={2} className="mt-7 flex flex-wrap gap-3">
            {Array.from({ length: 12 }, (_, n) => (
              <Bone key={n} className="size-6 rounded-md" />
            ))}
          </BoneRow>
          <BoneRow i={3} className="mt-8 space-y-9">
            <BoneLines widths={[96, 100, 52]} />
            <BoneLines widths={[100, 88, 94, 40]} />
          </BoneRow>
        </div>
        <div className="hidden border-l border-border/70 px-6 py-8 lg:block">
          <BoneRow i={2}>
            <Bone className="h-9 w-[72%] rounded-lg" />
          </BoneRow>
          <BoneRow i={4} className="mt-10 space-y-9">
            <BoneLines widths={[100, 92, 60]} />
            <Bone className="h-28 w-full rounded-xl" />
            <BoneLines widths={[98, 100, 44]} />
          </BoneRow>
        </div>
      </div>
    </>
  );
}
