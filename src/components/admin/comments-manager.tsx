"use client";

import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MessageCircleIcon,
  ReplyIcon,
  ShieldAlertIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteCommentAction,
  replyCommentAction,
  setCommentStatusAction,
} from "@/app/admin/actions";
import { UserAvatar } from "@/components/site/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "pending" | "approved" | "spam" | "trash";

export type AdminComment = {
  id: number;
  author: string;
  email: string | null;
  url: string | null;
  ip: string | null;
  html: string;
  status: Status;
  isAdmin: boolean;
  createdAt: string;
  avatar: string;
  avatarFallback: string;
  postTitle: string;
  postUrl: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

const TABS: { key: Status | "all"; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "spam", label: "垃圾" },
  { key: "trash", label: "回收站" },
  { key: "all", label: "全部" },
];

const STATUS_LABEL: Record<Status, string> = {
  pending: "待审核",
  approved: "已通过",
  spam: "垃圾",
  trash: "回收站",
};

export function CommentsManager({
  status,
  counts,
  items,
}: {
  status: Status | "all";
  counts: Partial<Record<Status, number>>;
  items: AdminComment[];
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [replying, setReplying] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  function act(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(label);
        setSelected([]);
      } else toast.error(res.error ?? "操作失败");
    });
  }

  const setStatus = (ids: number[], s: Status, label: string) =>
    act(label, () => setCommentStatusAction(ids, s));
  const remove = (ids: number[]) => act("已永久删除", () => deleteCommentAction(ids));

  function sendReply(id: number) {
    const content = reply.trim();
    if (content.length < 2) return toast.error("回复内容太短了");
    act("已回复", async () => {
      const res = await replyCommentAction(id, content);
      if (res.ok) {
        setReply("");
        setReplying(null);
      }
      return res;
    });
  }

  const allChecked = items.length > 0 && selected.length === items.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap rounded-xl border border-border bg-card p-1 text-sm">
          {TABS.map((t) => {
            const n = t.key === "all" ? total : (counts[t.key] ?? 0);
            return (
              <Link
                key={t.key}
                href={`/admin/comments?status=${t.key}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  status === t.key
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "ml-1.5 text-xs tabular-nums",
                    t.key === "pending" && n > 0 ? "text-brand" : "text-subtle",
                  )}
                >
                  {n}
                </span>
              </Link>
            );
          })}
        </nav>

        <AnimatePresence>
          {selected.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-muted-foreground">已选 {selected.length} 条</span>
              <button
                type="button"
                onClick={() => setStatus(selected, "approved", "已通过")}
                className="h-8 rounded-lg border border-border px-3 transition-colors hover:bg-muted"
              >
                通过
              </button>
              <button
                type="button"
                onClick={() => setStatus(selected, "spam", "已标记为垃圾")}
                className="h-8 rounded-lg border border-border px-3 transition-colors hover:bg-muted"
              >
                垃圾
              </button>
              {status === "trash" || status === "spam" ? (
                <button
                  type="button"
                  onClick={() => remove(selected)}
                  className="h-8 rounded-lg bg-destructive/10 px-3 text-destructive transition-colors hover:bg-destructive/20"
                >
                  永久删除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStatus(selected, "trash", "已移入回收站")}
                  className="h-8 rounded-lg border border-border px-3 transition-colors hover:bg-muted"
                >
                  移入回收站
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {items.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
            <Checkbox
              checked={allChecked}
              onCheckedChange={(v) => setSelected(v ? items.map((i) => i.id) : [])}
              aria-label="全选"
            />
            全选
            {pending && <LoaderIcon className="ml-auto size-3.5 animate-spin" />}
          </div>
          <ul className="divide-y divide-border/60">
            <AnimatePresence initial={false}>
              {items.map((c) => (
                <motion.li
                  key={c.id}
                  layout="position"
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="group/item flex gap-3 px-5 py-4"
                >
                  <Checkbox
                    className="mt-2.5"
                    checked={selected.includes(c.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, c.id] : s.filter((id) => id !== c.id)))
                    }
                    aria-label={`选择 ${c.author} 的评论`}
                  />
                  <UserAvatar
                    src={c.avatar}
                    fallback={c.avatarFallback}
                    alt=""
                    className="size-9 shrink-0 rounded-full bg-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="font-medium text-foreground hover:text-brand"
                        >
                          {c.author}
                        </a>
                      ) : (
                        <span className="font-medium text-foreground">{c.author}</span>
                      )}
                      {c.isAdmin && (
                        <span className="rounded-full bg-brand-soft px-1.5 text-[0.68rem] text-brand">
                          博主
                        </span>
                      )}
                      {status === "all" && (
                        <span className="rounded-full bg-muted px-1.5 text-[0.68rem] text-muted-foreground">
                          {STATUS_LABEL[c.status]}
                        </span>
                      )}
                      <span className="text-xs text-subtle" title={formatDateTime(c.createdAt)}>
                        {formatRelative(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-subtle">
                      {c.email ?? "未留邮箱"}
                      {c.ip && ` · ${c.ip}`}
                    </p>
                    <div
                      className="prose-blog prose-comment mt-2 text-sm"
                      dangerouslySetInnerHTML={{ __html: c.html }}
                    />
                    <a
                      href={`${c.postUrl}#comment-${c.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
                    >
                      《{c.postTitle}》
                      <ExternalLinkIcon className="size-3" />
                    </a>

                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      {c.status !== "approved" && (
                        <ActionButton
                          icon={<CheckIcon />}
                          onClick={() => setStatus([c.id], "approved", "已通过")}
                        >
                          通过
                        </ActionButton>
                      )}
                      {c.status === "approved" && (
                        <ActionButton
                          icon={<Undo2Icon />}
                          onClick={() => setStatus([c.id], "pending", "已撤回为待审核")}
                        >
                          撤回
                        </ActionButton>
                      )}
                      <ActionButton
                        icon={<ReplyIcon />}
                        onClick={() => setReplying(replying === c.id ? null : c.id)}
                      >
                        回复
                      </ActionButton>
                      {c.status !== "spam" && (
                        <ActionButton
                          icon={<ShieldAlertIcon />}
                          onClick={() => setStatus([c.id], "spam", "已标记为垃圾")}
                        >
                          垃圾
                        </ActionButton>
                      )}
                      {c.status === "trash" || c.status === "spam" ? (
                        <ActionButton danger icon={<Trash2Icon />} onClick={() => remove([c.id])}>
                          永久删除
                        </ActionButton>
                      ) : (
                        <ActionButton
                          icon={<Trash2Icon />}
                          onClick={() => setStatus([c.id], "trash", "已移入回收站")}
                        >
                          删除
                        </ActionButton>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {replying === c.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-xl border border-border bg-background/60 p-2">
                            <textarea
                              autoFocus
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendReply(c.id);
                              }}
                              rows={3}
                              placeholder={`回复 ${c.author}…（Ctrl/⌘ + Enter 发送）`}
                              className="field-sizing-content min-h-16 w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-subtle"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setReplying(null)}
                                className="h-8 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => sendReply(c.id)}
                                className="h-8 rounded-lg bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                发送回复
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <MessageCircleIcon className="size-8 text-subtle" />
          <p className="text-muted-foreground">
            {status === "pending" ? "没有待审核的评论，一切都处理好了" : "这里没有评论"}
          </p>
        </div>
      )}
    </>
  );
}

function ActionButton({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 transition-colors [&_svg]:size-3.5",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
