"use client";

import type { EditorView } from "@codemirror/view";
import {
  ArrowLeftIcon,
  CheckIcon,
  Columns2Icon,
  EyeIcon,
  ExternalLinkIcon,
  LoaderIcon,
  PenLineIcon,
  SendIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import "katex/dist/katex.min.css";

import { savePostAction } from "@/app/admin/actions";
import { PostContent } from "@/components/post/post-content";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EditorPost } from "@/server/admin";

import { markdownFor, uploadFiles } from "../upload";
import { insertText, replacePlaceholder } from "./commands";
import { EditorToolbar } from "./editor-toolbar";
import { cleanImported } from "./import-cleanup";
import { ImportNotice } from "./import-notice";
import { MarkdownEditor } from "./markdown-editor";
import { PostSettings } from "./post-settings";
import { AiMenuButton, AiRewriteBar, AiSelectionBubble, useAiAssistant } from "./ai-assistant";
import { useAiMetadata } from "./ai-metadata";
import { AiReview, AiReviewDock } from "./ai-review";
import { ReaderAiSheet } from "./reader-ai-panel";
import { PostHistory } from "./post-history";

type Mode = "write" | "split" | "preview";
type Preview = { html: string; wordCount: number; readingTime: number; pendingLinks?: number };

/** 链接卡片还在后台抓取时，隔一会儿重新预览；每次改动内容后最多重试这么多次 */
const CARD_RETRIES = 12;
type Backup = { title: string; content: string; savedAt: number };

const backupKey = (type: string, id?: number) => `blog-editor:${type}:${id ?? "new"}`;

function readBackup(key: string): Backup | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function PostEditor({
  initial,
  categories,
  allTags,
}: {
  initial: EditorPost;
  categories: { id: number; name: string }[];
  allTags: string[];
}) {
  const [post, setPost] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "publish" | "auto">(null);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  // 宽屏默认分栏，窄屏只显示编辑区；用户切换后以用户的选择为准
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const mode: Mode = chosenMode ?? (wide ? "split" : "write");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const cardRetries = useRef({ content: "", count: 0 });

  const viewRef = useRef<EditorView | null>(null);
  const editorScroll = useRef<HTMLDivElement>(null);
  const previewScroll = useRef<HTMLDivElement>(null);
  const previewMarkdown = aiPreview ?? post.content;
  const showAiPreview = useCallback(
    (markdown: string | null) => {
      setAiPreview(markdown);
      if (markdown !== null && wide) setMode("split");
    },
    [wide],
  );
  const version = useRef(0);
  const inflight = useRef(false);

  const isPost = post.type === "post";
  const listHref = isPost ? "/admin/posts" : "/admin/pages";
  const viewHref = isPost ? `/posts/${post.slug}` : `/${post.slug}`;
  const now = useNow();
  const future = !!post.publishedAt && now > 0 && Date.parse(post.publishedAt) > now;
  const scheduled = post.status === "published" && future;

  const update = useCallback((patch: Partial<EditorPost>) => {
    version.current++;
    setPost((p) => ({ ...p, ...patch }));
    setDirty(true);
  }, []);

  // 发现比服务器版本更新的本地备份时，提示恢复
  useEffect(() => {
    const key = backupKey(initial.type, initial.id);
    const b = readBackup(key);
    const serverTime = initial.updatedAt ? Date.parse(initial.updatedAt) : 0;
    if (
      !b ||
      b.savedAt <= serverTime ||
      (b.content === initial.content && b.title === initial.title)
    )
      return;
    const id = toast(`发现 ${formatRelative(b.savedAt)} 未保存的本地内容`, {
      duration: Infinity,
      action: { label: "恢复", onClick: () => update({ title: b.title, content: b.content }) },
      cancel: { label: "丢弃", onClick: () => localStorage.removeItem(key) },
    });
    return () => void toast.dismiss(id);
  }, [initial, update]);

  // 输入停顿后写入本地备份
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      localStorage.setItem(
        backupKey(post.type, post.id),
        JSON.stringify({
          title: post.title,
          content: post.content,
          savedAt: Date.now(),
        } satisfies Backup),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [dirty, post.content, post.title, post.id, post.type]);

  // 实时预览（与前台同一条渲染管线）
  useEffect(() => {
    const ctrl = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      async () => {
        try {
          const res = await fetch("/api/admin/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown: previewMarkdown }),
            signal: ctrl.signal,
          });
          if (!res.ok) return;
          const data = (await res.json()) as Preview;
          setPreview(data);
          // 链接卡片还没抓完：稍后重新预览，直到卡片出现
          const tries = cardRetries.current;
          if (tries.content !== previewMarkdown)
            Object.assign(tries, { content: previewMarkdown, count: 0 });
          if (data.pendingLinks && tries.count < CARD_RETRIES) {
            tries.count++;
            retry = setTimeout(() => setPreviewTick((n) => n + 1), 1500);
          }
        } catch {
          /* 被新的输入打断 */
        }
      },
      mode === "write" ? 900 : 300,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(retry);
      ctrl.abort();
    };
  }, [previewMarkdown, mode, previewTick]);

  const save = useCallback(
    async (status?: "draft" | "published", auto = false) => {
      if (!post.title.trim()) {
        if (!auto) toast.error("先写个标题吧");
        return;
      }
      // 同一时间只保存一次，避免新文章被重复创建
      if (inflight.current) return;
      inflight.current = true;
      const target = status ?? post.status;
      const startVersion = version.current;
      setSaving(
        auto ? "auto" : target === "published" && post.status !== "published" ? "publish" : "save",
      );
      let res: Awaited<ReturnType<typeof savePostAction>>;
      try {
        res = await savePostAction(
          {
            id: post.id,
            type: post.type,
            title: post.title,
            slug: post.slug,
            content: post.content,
            excerpt: post.excerpt,
            cover: post.cover,
            status: target,
            publishedAt: post.publishedAt,
            categoryId: post.categoryId,
            tags: post.tags,
            pinned: post.pinned,
            allowComments: post.allowComments,
            seoDescription: post.seoDescription,
          },
          auto
            ? "auto"
            : target === "published" && post.status !== "published"
              ? "publish"
              : "manual",
        );
      } catch {
        res = { ok: false, error: "网络异常，保存失败（内容已备份在本地）" };
      } finally {
        inflight.current = false;
      }
      setSaving(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, slug, status: newStatus, publishedAt, updatedAt } = res.data;
      const wasNew = !post.id;
      setPost((p) => ({ ...p, id, slug, status: newStatus, publishedAt }));
      setSavedAt(updatedAt);
      if (version.current === startVersion) setDirty(false);
      localStorage.removeItem(backupKey(post.type, post.id));
      localStorage.removeItem(backupKey(post.type, id));
      if (wasNew) window.history.replaceState(null, "", `${listHref}/${id}`);

      if (auto) return id;
      if (target === "published" && post.status !== "published") {
        const future = publishedAt && Date.parse(publishedAt) > Date.now();
        toast.success(future ? `已定时，将于 ${formatDateTime(publishedAt)} 发布` : "已发布", {
          action: future
            ? undefined
            : {
                label: "查看",
                onClick: () => window.open(isPost ? `/posts/${slug}` : `/${slug}`, "_blank"),
              },
        });
      } else if (target === "draft" && post.status === "published") {
        toast.success("已转为草稿，前台不再显示");
      } else {
        toast.success("已保存");
      }
      return id;
    },
    [post, listHref, isPost],
  );

  async function saveSnapshot(reason: "ai" | "restore" = "ai") {
    const id = post.id ?? (await save("draft"));
    if (!id) throw new Error("请先填写标题并保存草稿，再应用全文建议");
    const response = await fetch("/api/admin/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: id,
        snapshot: {
          id,
          type: post.type,
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt,
          cover: post.cover,
          status: post.status,
          publishedAt: post.publishedAt,
          categoryId: post.categoryId,
          tags: post.tags,
          pinned: post.pinned,
          allowComments: post.allowComments,
          seoDescription: post.seoDescription,
        },
        reason,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "历史快照保存失败");
  }

  const ai = useAiAssistant({
    post,
    viewRef,
    onPreview: showAiPreview,
    snapshot: saveSnapshot,
    // 整篇修改在右栏审阅；窄屏用底部抽屉
    onDocStart: () => (wide ? setMode("split") : setReviewSheetOpen(true)),
  });
  const meta = useAiMetadata({ post, viewRef, categories, update });
  const reviewing = !!ai.job && ai.job.task !== "rewrite";
  const reviewInPane = reviewing && wide && mode === "split";
  const aiMenu = {
    isPost,
    onMetadata: () => {
      setSettingsOpen(true);
      if (meta.state.status !== "busy") void meta.run();
    },
    onReaderAi: () => {
      if (!post.id || dirty) {
        toast("先保存正文，再管理读者 AI 内容");
        return;
      }
      setReaderOpen(true);
    },
  };

  // 草稿停顿几秒后自动保存到服务器；已发布的内容只做本地备份，避免把半成品发布出去
  useEffect(() => {
    if (!dirty || post.status !== "draft" || !post.title.trim() || saving) return;
    const timer = setTimeout(() => void save(undefined, true), 6000);
    return () => clearTimeout(timer);
  }, [dirty, post, saving, save]);

  // 快捷键保存；未保存时离开页面提醒
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, save]);

  const onUpload = useCallback(async (files: File[], view?: EditorView | null) => {
    const v = view ?? viewRef.current;
    if (!v) return;
    const token = `![上传中 ${files.length} 个文件…](#uploading-${Date.now()})`;
    insertText(v, token);
    try {
      const uploaded = await uploadFiles(files);
      replacePlaceholder(v, token, uploaded.map(markdownFor).join("\n\n"));
    } catch (e) {
      replacePlaceholder(v, token, "");
      toast.error((e as Error).message);
    }
  }, []);

  const syncPreview = useCallback((ratio: number) => {
    const el = previewScroll.current;
    if (!el) return;
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, []);

  const statusText = saving
    ? saving === "auto"
      ? "自动保存中…"
      : "保存中…"
    : dirty
      ? "有未保存的修改"
      : savedAt
        ? `已保存 · ${formatRelative(savedAt)}`
        : "尚未保存";

  const previewBody = (
    <>
      <h1 className="mb-8 font-serif text-[2rem] leading-snug font-bold text-foreground">
        {post.title || <span className="text-subtle">无标题</span>}
      </h1>
      {preview ? (
        <PostContent html={preview.html} preview />
      ) : (
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
      )}
    </>
  );

  const modes: { key: Mode; label: string; icon: React.ReactNode }[] = [
    { key: "write", label: "写作", icon: <PenLineIcon className="size-3.5" /> },
    { key: "split", label: "分栏", icon: <Columns2Icon className="size-3.5" /> },
    { key: "preview", label: "预览", icon: <EyeIcon className="size-3.5" /> },
  ];

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col md:h-[calc(100svh-4.5rem)]">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2 md:px-4">
        <Link
          href={listHref}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {isPost ? "文章" : "页面"}
        </Link>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            post.status === "published"
              ? scheduled
                ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                : "bg-emerald-600/10 text-emerald-800 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {post.status === "published" ? (scheduled ? "定时发布" : "已发布") : "草稿"}
        </span>
        <span className="hidden items-center gap-1.5 text-xs text-subtle sm:inline-flex">
          {saving && <LoaderIcon className="size-3 animate-spin" />}
          {statusText}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <PostHistory
            post={post}
            snapshot={() => saveSnapshot("restore")}
            update={update}
            viewRef={viewRef}
          />
          <div className="hidden rounded-lg border border-border p-0.5 md:flex">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                aria-pressed={mode === m.key}
                className={cn(
                  "relative inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition-colors",
                  mode === m.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === m.key && (
                  <motion.span
                    layoutId="editor-mode"
                    className="absolute inset-0 rounded-md bg-muted"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative flex items-center gap-1">
                  {m.icon}
                  {m.label}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMode(mode === "preview" ? "write" : "preview")}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground md:hidden"
            aria-label="切换预览"
          >
            {mode === "preview" ? (
              <PenLineIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label="文章设置"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm transition-colors hover:bg-muted"
          >
            <Settings2Icon className="size-4" />
            <span className="hidden sm:inline">设置</span>
          </button>
          {post.status === "published" ? (
            <>
              {post.id && !scheduled && (
                <a
                  href={viewHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="查看"
                  className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => save("draft")}
                disabled={!!saving}
                className="hidden h-8 items-center rounded-lg border border-border px-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-50 sm:inline-flex"
              >
                转为草稿
              </button>
              <button
                type="button"
                onClick={() => save("published")}
                disabled={!!saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving === "save" ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <CheckIcon className="size-4" />
                )}
                更新
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => save("draft")}
                disabled={!!saving}
                className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                {saving === "save" ? <LoaderIcon className="size-4 animate-spin" /> : "保存草稿"}
              </button>
              <button
                type="button"
                onClick={() => save("published")}
                disabled={!!saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving === "publish" ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-3.5" />
                )}
                {future ? "定时发布" : "发布"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 编辑区 + 预览区 */}
      <div className={cn("grid min-h-0 flex-1", mode === "split" ? "grid-cols-2" : "grid-cols-1")}>
        {
          <div
            ref={editorScroll}
            className={cn(
              "min-h-0 overflow-y-auto",
              mode === "split" && "border-r border-border/70",
              mode === "preview" && "hidden",
            )}
            data-lenis-prevent
          >
            <div
              className={cn(
                "mx-auto px-5 pt-8 md:px-10",
                mode === "write" ? "max-w-3xl" : "max-w-none",
              )}
            >
              <textarea
                value={post.title}
                onChange={(e) => update({ title: e.target.value.replace(/\n/g, "") })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    viewRef.current?.focus();
                  }
                }}
                rows={1}
                placeholder={isPost ? "文章标题" : "页面标题"}
                className="field-sizing-content w-full resize-none bg-transparent font-serif text-[1.9rem] leading-snug font-bold text-foreground outline-none placeholder:text-subtle"
              />
              <div
                data-editor-toolbar
                className="sticky top-0 z-10 -mx-2 my-3 flex items-start gap-1 bg-background/90 px-1 py-1 backdrop-blur"
              >
                <EditorToolbar
                  className="min-w-0 flex-1"
                  getView={() => viewRef.current}
                  onPickImages={(files) => void onUpload(files)}
                />
                <AiMenuButton ai={ai} viewRef={viewRef} selection={selection} {...aiMenu} />
              </div>
              <ImportNotice
                content={post.content}
                onClean={() => {
                  const v = viewRef.current;
                  if (!v) return;
                  const current = v.state.doc.toString();
                  const next = cleanImported(current);
                  if (next === current) return;
                  v.dispatch({
                    changes: { from: 0, to: v.state.doc.length, insert: next },
                    userEvent: "input.cleanup",
                  });
                  toast.success("已整理导入的内容", { description: "不满意可以按 Ctrl+Z 撤销" });
                }}
              />
              <MarkdownEditor
                value={post.content}
                onChange={(content) => update({ content })}
                onUpload={(files, v) => void onUpload(files, v)}
                onSelection={setSelection}
                onScroll={mode === "split" ? syncPreview : undefined}
                viewRef={viewRef}
                scrollParent={editorScroll}
              />
            </div>
          </div>
        }

        {mode !== "write" && (
          <div
            ref={previewScroll}
            className={cn(
              "min-h-0 bg-card/40",
              reviewInPane ? "overflow-hidden" : "overflow-y-auto",
            )}
            data-lenis-prevent
          >
            {reviewInPane ? (
              <AiReview ai={ai} preview={previewBody} />
            ) : (
              <div className="mx-auto max-w-[42rem] px-6 pt-10 pb-[40vh]">
                {aiPreview !== null && (
                  <p
                    role="status"
                    className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs text-brand"
                  >
                    <SparklesIcon className="size-3.5" />
                    正在预览 AI 建议，正文还没有改动
                  </p>
                )}
                {previewBody}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex items-center gap-4 border-t border-border/70 px-4 py-1.5 text-xs text-subtle">
        <span>{(preview?.wordCount ?? 0).toLocaleString("zh-CN")} 字</span>
        <span>约 {preview?.readingTime ?? 1} 分钟读完</span>
        <span className="ml-auto hidden sm:inline">
          粘贴或拖入图片即可上传 · Ctrl/⌘ + S 保存 · Ctrl/⌘ + J 唤起 AI
        </span>
      </div>

      <PostSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        post={post}
        update={update}
        categories={categories}
        allTags={allTags}
        meta={meta}
      />
      {isPost && (
        <ReaderAiSheet
          postId={post.id}
          dirty={dirty}
          open={readerOpen}
          onOpenChange={setReaderOpen}
        />
      )}
      <AiSelectionBubble ai={ai} viewRef={viewRef} selection={selection} {...aiMenu} />
      <AiRewriteBar ai={ai} viewRef={viewRef} />
      <AiReviewDock
        ai={ai}
        inPane={reviewInPane}
        compact={!wide}
        sheetOpen={reviewSheetOpen}
        onSheetOpenChange={setReviewSheetOpen}
        onShow={() => (wide ? setMode("split") : setReviewSheetOpen(true))}
        preview={previewBody}
      />
    </div>
  );
}
