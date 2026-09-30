"use client";

import { CornerDownRightIcon, LoaderIcon, MessageCircleIcon, SendIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { PublicComment } from "@/server/comments";

import { TimeAgo } from "./time-ago";

const EASE = [0.16, 1, 0.3, 1] as const;
const IDENTITY_KEY = "comment-identity";

type Identity = { author: string; email: string; url: string };

function loadIdentity(): Identity {
  const empty = { author: "", email: "", url: "" };
  if (typeof window === "undefined") return empty;
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "{}") };
  } catch {
    return empty;
  }
}

/** 昵称等信息只在表单展开后才渲染，所以直接在初始化时读取本地记录，不会与服务端渲染不一致 */
function useIdentity() {
  const [identity, setIdentity] = useState<Identity>(loadIdentity);
  const save = (next: Identity) => {
    setIdentity(next);
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
  };
  return [identity, save] as const;
}

function CommentForm({
  postId,
  parent,
  onCancel,
  onPosted,
  autoFocus,
}: {
  postId: number;
  parent?: PublicComment;
  onCancel?: () => void;
  onPosted: (c: PublicComment, approved: boolean) => void;
  autoFocus?: boolean;
}) {
  const [identity, setIdentity] = useIdentity();
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState(!!parent);
  const [pending, setPending] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textarea.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!identity.author.trim()) {
      setExpanded(true);
      toast.error("请填写昵称");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          parentId: parent?.id ?? null,
          ...identity,
          content,
          website: honeypot.current?.value ?? "",
          t: openedAt,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        comment?: PublicComment;
        status?: string;
      };
      if (!res.ok || !data.comment) throw new Error(data.error ?? "提交失败");
      const approved = data.status === "approved";
      onPosted(data.comment, approved);
      setContent("");
      toast.success(approved ? "评论已发布" : "评论已提交，审核通过后就会显示");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  const input =
    "h-10 w-full rounded-xl border border-border bg-background/60 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-brand/50 focus:ring-3 focus:ring-brand/12";

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-[border-color,box-shadow] duration-300 focus-within:border-foreground/20 focus-within:shadow-soft sm:p-4"
    >
      <textarea
        ref={textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setExpanded(true)}
        rows={parent ? 3 : 4}
        maxLength={5000}
        placeholder={parent ? `回复 @${parent.author}…` : "写下你的想法…（支持 Markdown）"}
        className="field-sizing-content min-h-24 w-full resize-none bg-transparent px-1 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-subtle"
      />
      <input
        ref={honeypot}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 pt-3 sm:grid-cols-3">
              <input
                className={input}
                placeholder="昵称 *"
                value={identity.author}
                maxLength={40}
                onChange={(e) => setIdentity({ ...identity, author: e.target.value })}
              />
              <input
                className={input}
                type="email"
                placeholder="邮箱（接收回复通知，不公开）"
                value={identity.email}
                maxLength={120}
                onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
              />
              <input
                className={input}
                placeholder="网址"
                value={identity.url}
                maxLength={200}
                onChange={(e) => setIdentity({ ...identity, url: e.target.value })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-3 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-3.5" />
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={pending || content.trim().length < 2}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm text-background transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <SendIcon className="size-3.5" />
          )}
          {parent ? "回复" : "发表评论"}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  postId,
  replyingTo,
  setReplyingTo,
  onPosted,
  fresh,
  isReply,
}: {
  comment: PublicComment;
  postId: number;
  replyingTo: number | null;
  setReplyingTo: (id: number | null) => void;
  onPosted: (c: PublicComment, approved: boolean) => void;
  fresh: Set<number>;
  isReply?: boolean;
}) {
  const replying = replyingTo === comment.id;
  return (
    <motion.li
      id={`comment-${comment.id}`}
      layout="position"
      initial={fresh.has(comment.id) ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="scroll-mt-28"
    >
      <div
        className={cn(
          "group/comment flex gap-3 rounded-2xl p-2 transition-colors duration-1000 sm:gap-4",
          fresh.has(comment.id) && "animate-[comment-flash_2.4s_ease-out]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comment.avatar}
          alt=""
          width={isReply ? 32 : 40}
          height={isReply ? 32 : 40}
          loading="lazy"
          className={cn(
            "shrink-0 rounded-full bg-muted object-cover ring-1 ring-border",
            isReply ? "size-8" : "size-10",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {comment.url ? (
              <a
                href={comment.url}
                target="_blank"
                rel="nofollow ugc noopener noreferrer"
                className="font-medium text-foreground transition-colors hover:text-brand"
              >
                {comment.author}
              </a>
            ) : (
              <span className="font-medium text-foreground">{comment.author}</span>
            )}
            {comment.isAdmin && (
              <span className="rounded-full bg-brand-soft px-1.5 py-px text-[0.68rem] font-medium text-brand">
                博主
              </span>
            )}
            {comment.replyTo && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CornerDownRightIcon className="size-3" />
                {comment.replyTo}
              </span>
            )}
            <TimeAgo date={comment.createdAt} className="text-xs text-subtle" />
            <button
              type="button"
              onClick={() => setReplyingTo(replying ? null : comment.id)}
              className="ml-auto text-xs text-muted-foreground opacity-0 transition-[opacity,color] group-hover/comment:opacity-100 hover:text-brand focus-visible:opacity-100 max-sm:opacity-100"
            >
              {replying ? "取消回复" : "回复"}
            </button>
          </div>
          <div
            className="prose-blog prose-comment mt-1.5 text-[0.93rem]"
            dangerouslySetInnerHTML={{ __html: comment.html }}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {replying && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="overflow-hidden"
          >
            <div className={cn("pt-2 pb-3", isReply ? "pl-11" : "pl-14")}>
              <CommentForm
                postId={postId}
                parent={comment}
                autoFocus
                onCancel={() => setReplyingTo(null)}
                onPosted={(c, approved) => {
                  setReplyingTo(null);
                  onPosted(c, approved);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!!comment.replies?.length && (
        <ul className="mt-1 ml-5 space-y-1 border-l border-border/80 pl-4 sm:ml-7 sm:pl-5">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              onPosted={onPosted}
              fresh={fresh}
              isReply
            />
          ))}
        </ul>
      )}
    </motion.li>
  );
}

export function Comments({
  postId,
  initial,
  total: initialTotal,
  enabled,
}: {
  postId: number;
  initial: PublicComment[];
  total: number;
  enabled: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());

  // 从邮件链接进入时，定位并高亮对应评论
  useEffect(() => {
    const m = /^#comment-(\d+)$/.exec(location.hash);
    const el = m && document.getElementById(`comment-${m[1]}`)?.firstElementChild;
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate(
        [
          { backgroundColor: "color-mix(in oklab, var(--brand) 10%, transparent)", offset: 0.35 },
          { backgroundColor: "transparent" },
        ],
        { duration: 2600, easing: "ease-out" },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  function onPosted(c: PublicComment, approved: boolean) {
    if (!approved) return;
    setFresh((s) => new Set(s).add(c.id));
    setTotal((n) => n + 1);
    setItems((list) => {
      if (!c.rootId) return [{ ...c, replies: [] }, ...list];
      return list.map((root) =>
        root.id === c.rootId ? { ...root, replies: [...(root.replies ?? []), c] } : root,
      );
    });
  }

  return (
    <section id="comments" className="scroll-mt-24">
      <h2 className="mb-5 flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
        <MessageCircleIcon className="size-5 text-brand" />
        评论
        <span className="font-sans text-base font-normal text-muted-foreground">{total}</span>
      </h2>

      {enabled ? (
        <CommentForm postId={postId} onPosted={onPosted} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          评论已关闭
        </p>
      )}

      {items.length ? (
        <ul className="mt-8 space-y-3">
          {items.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              postId={postId}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              onPosted={onPosted}
              fresh={fresh}
            />
          ))}
        </ul>
      ) : (
        enabled && <p className="mt-8 text-center text-sm text-subtle">还没有评论，来说两句吧～</p>
      )}
    </section>
  );
}
