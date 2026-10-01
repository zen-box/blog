"use client";

import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  HistoryIcon,
  LoaderIcon,
  type LucideIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  TimerIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { formatDateTime } from "@/lib/format";
import { blockStats, paragraphDiff, readableDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";
import type { EditorPost } from "@/server/admin";

import { Delta, DiffText, TextDiffView } from "./text-diff";

type Version = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  reason: string;
  snapshot: Partial<EditorPost>;
};
const REASONS: Record<string, { label: string; icon: LucideIcon }> = {
  manual: { label: "手动保存", icon: SaveIcon },
  auto: { label: "自动保存", icon: TimerIcon },
  publish: { label: "发布", icon: SendIcon },
  ai: { label: "AI 修改前", icon: SparklesIcon },
  restore: { label: "恢复前", icon: RotateCcwIcon },
  before: { label: "保存前", icon: SaveIcon },
};
const reasonOf = (reason: string) => REASONS[reason] ?? { label: reason, icon: SaveIcon };

function dayLabel(date: Date, now: number) {
  const today = new Date(now || Date.now());
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}
const clock = (date: Date) =>
  date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function PostHistory({
  post,
  snapshot,
  update,
  viewRef,
}: {
  post: EditorPost;
  snapshot: () => Promise<void>;
  update: (patch: Partial<EditorPost>) => void;
  viewRef: React.RefObject<EditorView | null>;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 窄屏在列表和对比之间切换
  const [detail, setDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const now = useNow();

  async function load() {
    if (!post.id) {
      toast("保存草稿后可以查看版本历史");
      return;
    }
    setOpen(true);
    setLoading(true);
    setError("");
    setVersions(null);
    setSelectedId(null);
    setDetail(false);
    try {
      const res = await fetch(`/api/admin/history?postId=${post.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "历史读取失败");
      const list = data.versions as Version[];
      setVersions(list);
      // 默认选中第一个和当前内容不一样的版本
      const current = viewRef.current?.state.doc.toString() ?? post.content;
      const first = list.find((v) => v.content !== current || v.title !== post.title) ?? list[0];
      setSelectedId(first?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const blocks = useMemo(
    () => (selected ? paragraphDiff(post.content, selected.content) : []),
    [selected, post.content],
  );
  const stats = blockStats(blocks);
  const titleChanged = !!selected && selected.title !== post.title;
  const identical = !!selected && !titleChanged && stats.changed === 0;

  const groups = useMemo(() => {
    const out: { label: string; items: Version[] }[] = [];
    for (const version of versions ?? []) {
      const label = dayLabel(new Date(version.createdAt), now);
      if (out.at(-1)?.label === label) out.at(-1)!.items.push(version);
      else out.push({ label, items: [version] });
    }
    return out;
  }, [versions, now]);

  async function restore() {
    if (!selected || restoring) return;
    setRestoring(true);
    try {
      await snapshot();
      const view = viewRef.current;
      if (view)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: selected.content },
          userEvent: "input.restore",
          annotations: isolateHistory.of("full"),
        });
      const saved = selected.snapshot;
      update({
        title: saved.title ?? selected.title,
        content: selected.content,
        slug: saved.slug ?? "",
        excerpt: saved.excerpt ?? "",
        seoDescription: saved.seoDescription ?? "",
        tags: saved.tags ?? [],
        categoryId: saved.categoryId ?? null,
        cover: saved.cover ?? "",
        pinned: saved.pinned ?? false,
        allowComments: saved.allowComments ?? true,
        status: "draft",
        publishedAt: null,
      });
      setOpen(false);
      toast.success("已恢复为草稿", { description: "恢复前的内容也存进了历史，随时可以换回来" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="版本历史"
              onClick={() => void load()}
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            />
          }
        >
          <HistoryIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>版本历史</TooltipContent>
      </Tooltip>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>版本历史</SheetTitle>
            <SheetDescription>
              保留最近 50 个版本，连续的自动保存每 5 分钟合并一次。
            </SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 md:grid-cols-[15.5rem_minmax(0,1fr)]">
            <nav
              aria-label="历史版本"
              className={cn(
                "min-h-0 overflow-y-auto border-border py-2 md:border-r",
                detail && "max-md:hidden",
              )}
              data-lenis-prevent
            >
              {loading &&
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex gap-3 px-5 py-2.5">
                    <Skeleton className="size-6 rounded-full" />
                    <div className="flex-1 space-y-1.5 pt-0.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              {error && (
                <p role="alert" className="mx-5 my-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              {versions && !versions.length && (
                <div className="px-5 py-12 text-center">
                  <HistoryIcon className="mx-auto size-5 text-subtle" />
                  <p className="mt-3 text-sm text-muted-foreground">还没有历史版本</p>
                  <p className="mt-1 text-xs text-subtle">保存、发布或应用 AI 建议时会自动记录</p>
                </div>
              )}
              {groups.map((group) => (
                <div key={group.label} className="px-3 py-2">
                  <p className="px-2 pb-1 text-xs font-medium text-subtle">{group.label}</p>
                  <ol>
                    {group.items.map((version) => {
                      const { label, icon: Icon } = reasonOf(version.reason);
                      const active = version.id === selectedId;
                      const delta = version.content.length - post.content.length;
                      return (
                        <li
                          key={version.id}
                          className="relative before:absolute before:top-9 before:-bottom-2 before:left-5 before:w-px before:bg-border last:before:hidden"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(version.id);
                              setDetail(true);
                            }}
                            aria-current={active || undefined}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/70",
                              active && "bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors",
                                active && "border-brand/40 bg-brand-soft text-brand",
                              )}
                            >
                              <Icon className="size-3" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2 text-sm">
                                <span className="tabular-nums">
                                  {clock(new Date(version.createdAt))}
                                </span>
                                <span className="truncate text-muted-foreground">{label}</span>
                                <span className="ml-auto shrink-0 font-mono text-[11px] text-subtle tabular-nums">
                                  {version.content === post.content
                                    ? "="
                                    : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`}
                                </span>
                              </span>
                              {version.title !== post.title && (
                                <span className="mt-0.5 block truncate text-xs text-subtle">
                                  {version.title}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </nav>

            <section
              aria-label="版本差异"
              className={cn("flex min-h-0 flex-col", !detail && "max-md:hidden")}
            >
              {selected ? (
                <>
                  <div className="flex items-center gap-3 border-b border-border/70 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setDetail(false)}
                      aria-label="返回版本列表"
                      className="-ml-1.5 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                    >
                      <ArrowLeftIcon className="size-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {reasonOf(selected.reason).label} · {formatDateTime(selected.createdAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {identical ? (
                          "与当前内容相同"
                        ) : (
                          <>
                            恢复后正文的变化：
                            <Delta added={stats.added} removed={stats.removed} />
                            <span className="text-subtle"> 字 · {stats.changed} 处</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
                    {titleChanged && (
                      <p className="mb-4 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">
                        <span className="mr-2 text-xs text-subtle">标题</span>
                        <DiffText parts={readableDiff(post.title, selected.title)} />
                      </p>
                    )}
                    {identical ? (
                      <div className="grid h-full place-items-center text-center">
                        <div>
                          <CircleCheckIcon className="mx-auto size-5 text-subtle" />
                          <p className="mt-3 text-sm text-muted-foreground">
                            这个版本和现在的内容一样
                          </p>
                        </div>
                      </div>
                    ) : (
                      <TextDiffView blocks={blocks} />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-5 py-3">
                    <p className="min-w-48 flex-1 text-xs leading-relaxed text-subtle">
                      当前内容会先存入历史；恢复后文章转为草稿，需要重新发布。
                    </p>
                    <Button
                      className="max-sm:w-full"
                      disabled={restoring || identical}
                      onClick={() => void restore()}
                    >
                      {restoring ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />}
                      恢复这个版本
                    </Button>
                  </div>
                </>
              ) : (
                !loading &&
                !!versions?.length && (
                  <p className="m-auto text-sm text-muted-foreground">选择一个版本查看差异</p>
                )
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
