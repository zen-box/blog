"use client";

import {
  EllipsisIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PenLineIcon,
  PinIcon,
  SearchIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePostAction } from "@/app/admin/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminPostRow } from "@/server/admin";

type Status = "all" | "published" | "draft";

function StatusBadge({ row }: { row: AdminPostRow }) {
  if (row.scheduled) {
    return (
      <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
        定时
      </span>
    );
  }
  return row.status === "published" ? (
    <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
      已发布
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">草稿</span>
  );
}

export function ContentList({
  type,
  rows,
  counts,
  status,
  q,
}: {
  type: "post" | "page";
  rows: AdminPostRow[];
  counts: Record<Status, number>;
  status: Status;
  q: string;
}) {
  const base = type === "post" ? "/admin/posts" : "/admin/pages";
  const viewBase = type === "post" ? "/posts/" : "/";
  const [deleting, setDeleting] = useState<AdminPostRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const row = deleting;
    startTransition(async () => {
      const res = await deletePostAction(row.id);
      if (res.ok) toast.success(`已删除「${row.title}」`);
      else toast.error(res.error);
      setDeleting(null);
    });
  }

  const tabs: { key: Status; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "published", label: "已发布" },
    { key: "draft", label: "草稿" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex rounded-xl border border-border bg-card p-1 text-sm">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`${base}${t.key === "all" ? "" : `?status=${t.key}`}`}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-colors",
                status === t.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-subtle tabular-nums">{counts[t.key]}</span>
            </Link>
          ))}
        </nav>
        <Form action={base} className="relative w-full sm:w-64">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder={`搜索${type === "post" ? "文章" : "页面"}标题…`}
            className="h-9 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-sm transition-[border-color,box-shadow] outline-none placeholder:text-subtle focus:border-brand/50 focus:ring-3 focus:ring-brand/12"
          />
        </Form>
      </div>

      {rows.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-normal">标题</th>
                <th className="hidden px-3 py-3 font-normal md:table-cell">状态</th>
                {type === "post" && (
                  <th className="hidden px-3 py-3 font-normal lg:table-cell">分类</th>
                )}
                <th className="hidden px-3 py-3 text-right font-normal sm:table-cell">浏览</th>
                <th className="hidden px-3 py-3 text-right font-normal sm:table-cell">评论</th>
                <th className="hidden px-3 py-3 font-normal md:table-cell">时间</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={row.id} className="group/row transition-colors hover:bg-muted/40">
                  <td className="max-w-0 px-5 py-3.5">
                    <Link href={`${base}/${row.id}`} className="block">
                      <span className="flex items-center gap-1.5">
                        {row.pinned && <PinIcon className="size-3.5 shrink-0 text-brand" />}
                        <span className="truncate font-medium text-foreground transition-colors group-hover/row:text-brand">
                          {row.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-subtle">
                        {viewBase}
                        {row.slug}
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-3.5 md:table-cell">
                    <StatusBadge row={row} />
                  </td>
                  {type === "post" && (
                    <td className="hidden px-3 py-3.5 text-muted-foreground lg:table-cell">
                      {row.category ?? "—"}
                    </td>
                  )}
                  <td className="hidden px-3 py-3.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {row.views}
                  </td>
                  <td className="hidden px-3 py-3.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {row.comments}
                  </td>
                  <td className="hidden px-3 py-3.5 text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                    <span title={formatDateTime(row.publishedAt ?? row.updatedAt)}>
                      {row.status === "published" && row.publishedAt
                        ? formatDateTime(row.publishedAt).slice(0, 10)
                        : `${formatRelative(row.updatedAt)}编辑`}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="更多操作"
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
                      >
                        <EllipsisIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem render={<Link href={`${base}/${row.id}`} />}>
                          <SquarePenIcon />
                          编辑
                        </DropdownMenuItem>
                        {row.status === "published" && (
                          <DropdownMenuItem
                            render={
                              <a href={`${viewBase}${row.slug}`} target="_blank" rel="noreferrer" />
                            }
                          >
                            <ExternalLinkIcon />
                            查看
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(row)}>
                          <Trash2Icon />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <FileTextIcon className="size-8 text-subtle" />
          <p className="text-muted-foreground">
            {q ? `没有找到与「${q}」相关的内容` : "这里还是空的"}
          </p>
          {!q && (
            <Link
              href={`${base}/new`}
              className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90"
            >
              <PenLineIcon className="size-4" />
              {type === "post" ? "写第一篇文章" : "新建页面"}
            </Link>
          )}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleting?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {type === "post" ? "文章" : "页面"}和它下面的所有评论都会被永久删除，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={pending}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
