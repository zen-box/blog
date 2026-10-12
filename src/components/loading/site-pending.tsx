"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Bone, BoneRow, PendingRegion } from "./bones";

type Shape = "home" | "post" | "page" | "archive" | "moments" | "links" | "list";

/** 跳转时地址已经换成目标页，按目标页的版式画骨架 */
function shapeOf(pathname: string): Shape {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/posts/")) return "post";
  if (pathname === "/archive") return "archive";
  if (pathname === "/moments") return "moments";
  if (pathname === "/links") return "links";
  if (/^\/(page|categories|tags|series)(\/|$)/.test(pathname)) return "list";
  return "page";
}

/**
 * 前台页面加载中：与目标页同形的骨架。
 * 每一行占位都和真实页面的行高一致，内容到达时文字正好落在占位的位置上；
 * 跳转很快时整组不出现（见 loading.css 的延迟淡入）。
 */
export function SitePending() {
  const shape = shapeOf(usePathname());
  return (
    <PendingRegion className="min-h-svh pt-(--header-h)">
      {shape === "home" && <HomeBones />}
      {(shape === "post" || shape === "page") && <ArticleBones post={shape === "post"} />}
      {shape === "archive" && <ArchiveBones />}
      {shape === "moments" && <MomentBones />}
      {shape === "links" && <LinkBones />}
      {shape === "list" && <ListBones />}
    </PendingRegion>
  );
}

/** 一行文字：外框是行高，里面的胶囊是字的高度 */
function Line({
  box,
  className,
  style,
}: {
  box: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("flex items-center", box)}>
      <Bone className={className} style={style} />
    </div>
  );
}

/** 列表页统一的标题区（PageHeader）：短线小字、大标题、说明 */
function HeaderBones({ children }: { children?: React.ReactNode }) {
  return (
    <section className="container-page pt-14 pb-10 sm:pt-20 sm:pb-14">
      <BoneRow className="flex h-[1.2rem] items-center gap-3">
        <span className="h-px w-8 bg-brand/35" />
        <Bone className="h-2.5 w-20" />
      </BoneRow>
      <BoneRow i={1} className="mt-4">
        <Line box="h-[clamp(2.375rem,5.75vw,3.5rem)]" className="h-[72%] w-32 rounded-xl sm:w-40" />
      </BoneRow>
      <BoneRow i={2} className="mt-4">
        <Line box="h-[1.625rem]" className="h-3.5 w-[min(24rem,82%)]" />
      </BoneRow>
      {children}
    </section>
  );
}

/** 文章卡片（PostCard）：日期行、标题、两行摘要、「阅读全文」 */
function CardBones({ i, cover }: { i: number; cover: boolean }) {
  return (
    <BoneRow
      i={i}
      className={cn(
        "grid items-center gap-5 p-3 sm:gap-8 sm:p-4",
        cover && "sm:grid-cols-[minmax(0,17rem)_1fr]",
      )}
    >
      {cover && <Bone className="aspect-[16/10] w-full rounded-2xl" />}
      <div className={cn("py-1", !cover && "px-2")}>
        <Line box="h-5" className="h-2.5 w-44" />
        <Line box="mt-2.5 h-[1.76rem] sm:h-[1.95rem]" className="h-5 w-[72%] rounded-lg" />
        <div className="mt-2.5">
          <Line box="h-[1.53rem]" className="h-3 w-full" />
          <Line box="h-[1.53rem]" className="h-3 w-[62%]" />
        </div>
        <div className="mt-4 h-5" />
      </div>
    </BoneRow>
  );
}

function HomeBones() {
  return (
    <>
      <section className="container-page pt-14 pb-10 sm:pt-24 sm:pb-16">
        <BoneRow className="flex h-[1.23rem] items-center gap-3">
          <span className="h-px w-8 bg-brand/35" />
          <Bone className="h-2.5 w-32" />
        </BoneRow>
        <BoneRow i={1} className="mt-5">
          <Line
            box="h-[clamp(2.562rem,6.588vw,4.331rem)]"
            className="h-[70%] w-[min(30rem,92%)] rounded-xl"
          />
        </BoneRow>
        <BoneRow i={2} className="mt-5">
          <Line box="h-[1.706rem]" className="h-3.5 w-[min(16rem,70%)]" />
        </BoneRow>
        <BoneRow i={2} className="mt-7">
          <Line box="h-9" className="h-2.5 w-36" />
        </BoneRow>
      </section>
      <section className="container-page">
        <BoneRow
          i={3}
          className="mb-5 flex h-[2.75rem] items-end justify-between border-b border-border/70 pb-4"
        >
          <Line box="h-7" className="h-4 w-20" />
          <Line box="h-7" className="h-3 w-16" />
        </BoneRow>
        <div className="-mx-3 flex flex-col gap-2 sm:-mx-4 sm:gap-3">
          <CardBones i={4} cover />
          <CardBones i={5} cover={false} />
          <CardBones i={6} cover />
        </div>
      </section>
    </>
  );
}

/** 文章与独立页面（PostHero + 正文）；页面没有日期和统计行 */
function ArticleBones({ post }: { post: boolean }) {
  const title = "h-[clamp(2.442rem,5.808vw,3.564rem)]";
  return (
    <>
      <header className="container-read pt-12 sm:pt-20">
        {post && (
          <BoneRow>
            <Line box="h-5" className="h-3 w-36" />
          </BoneRow>
        )}
        <BoneRow i={1} className={cn(post && "mt-4")}>
          <Line box={title} className="h-[62%] w-[88%] rounded-xl sm:w-[76%]" />
          <Line box={cn(title, "sm:hidden")} className="h-[62%] w-[46%] rounded-xl" />
        </BoneRow>
        {post && (
          <BoneRow i={2} className="mt-5 flex h-5 flex-wrap items-center gap-4">
            <Bone className="h-2.5 w-14" />
            <Bone className="h-2.5 w-14" />
            <Bone className="h-2.5 w-20" />
            <Bone className="h-2.5 w-16" />
          </BoneRow>
        )}
      </header>
      <div className="container-read mt-12 space-y-8 sm:mt-14">
        {[
          [100, 97, 100, 58],
          [98, 100, 74],
          [100, 94, 99, 88, 36],
        ].map((lines, p) => (
          <BoneRow key={p} i={3 + p}>
            {p === 1 && <Line box="mb-3 h-9" className="h-5 w-40 rounded-lg" />}
            {lines.map((w, n) => (
              <Line key={n} box="h-[1.9rem]" className="h-3.5" style={{ width: `${w}%` }} />
            ))}
          </BoneRow>
        ))}
      </div>
    </>
  );
}

/** 归档：标题区下面三个入口，再是按年的时间线（每行与条目同高） */
function ArchiveBones() {
  return (
    <>
      <HeaderBones>
        <BoneRow i={2} className="mt-6 flex gap-2">
          <Bone className="h-[2.125rem] w-20" />
          <Bone className="h-[2.125rem] w-20" />
          <Bone className="h-[2.125rem] w-[4.5rem]" />
        </BoneRow>
      </HeaderBones>
      <div className="container-page">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-[8rem_1fr] sm:gap-10">
          <BoneRow i={3} className="flex items-center gap-3 sm:block">
            <Bone className="h-9 w-24 rounded-xl sm:mt-1 sm:h-11 sm:w-28" />
            <Bone className="h-3 w-8 sm:mt-3" />
          </BoneRow>
          <BoneRow i={3} className="border-l border-border/80">
            {[44, 66, 30, 30, 34, 58, 46, 52].map((w, n) => (
              <div key={n} className="flex h-11 items-center gap-5 pl-6">
                <Bone className="h-2.5 w-10 shrink-0" />
                <Bone className="h-3.5" style={{ width: `${w}%` }} />
              </div>
            ))}
          </BoneRow>
        </div>
      </div>
    </>
  );
}

/** 说说：头像 + 卡片，左边一条时间线 */
function MomentBones() {
  return (
    <>
      <HeaderBones />
      <div className="container-page">
        <div className="relative max-w-2xl space-y-8">
          <span className="sk-row absolute top-2 bottom-2 left-5 w-px bg-border/80" />
          {[[90], [76, 40], [64]].map((lines, n) => (
            <BoneRow key={n} i={3 + n} className="relative flex gap-4">
              <Bone className="size-10 shrink-0 ring-4 ring-background" />
              <div className="min-w-0 flex-1 rounded-2xl border border-border/80 bg-card/50 px-5 py-4">
                <div className="flex h-5 items-center gap-2">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-2.5 w-12" />
                </div>
                <div className="mt-2">
                  {lines.map((w, k) => (
                    <Line key={k} box="h-[1.75rem]" className="h-3" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            </BoneRow>
          ))}
        </div>
      </div>
    </>
  );
}

/** 友链：分组标题 + 三列卡片 */
function LinkBones() {
  return (
    <>
      <HeaderBones />
      <div className="container-page">
        <BoneRow i={3}>
          <Line box="mb-4 h-7" className="h-4 w-24" />
        </BoneRow>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <BoneRow
              key={n}
              i={4 + Math.floor(n / 3)}
              className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card/40 p-4"
            >
              <Bone className="size-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <Line box="h-6" className="h-3.5 w-24" />
                <Line box="mt-0.5 h-5" className="h-2.5 w-[85%]" />
              </div>
            </BoneRow>
          ))}
        </div>
      </div>
    </>
  );
}

/** 分类、标签、系列、首页翻页：标题区 + 文章列表 */
function ListBones() {
  return (
    <>
      <HeaderBones />
      <section className="container-page">
        <div className="-mx-3 flex flex-col gap-2 sm:-mx-4 sm:gap-3">
          <CardBones i={3} cover={false} />
          <CardBones i={4} cover={false} />
          <CardBones i={5} cover={false} />
        </div>
      </section>
    </>
  );
}
