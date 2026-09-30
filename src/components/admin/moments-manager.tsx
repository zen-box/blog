"use client";

import {
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  LoaderIcon,
  MapPinIcon,
  SendIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteMomentAction, saveMomentAction } from "@/app/admin/actions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { thumbUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

import { useConfirm } from "./confirm";
import { uploadFiles } from "./upload";

type Moment = {
  id: number;
  content: string;
  html: string;
  images: string[];
  location: string | null;
  visible: boolean;
  createdAt: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;
const EMPTY = {
  id: undefined as number | undefined,
  content: "",
  images: [] as string[],
  location: "",
};

export function MomentsManager({ items }: { items: Moment[] }) {
  const [draft, setDraft] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function addImages(files: File[]) {
    const room = 9 - draft.images.length;
    if (room <= 0) return toast.error("最多 9 张图片");
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files.slice(0, room));
      const urls = uploaded.filter((f) => f.mime.startsWith("image/")).map((f) => f.url);
      setDraft((d) => ({ ...d, images: [...d.images, ...urls] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function publish() {
    startTransition(async () => {
      const res = await saveMomentAction({
        id: draft.id,
        content: draft.content,
        images: draft.images,
        location: draft.location,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(draft.id ? "已更新" : "已发布");
      setDraft(EMPTY);
    });
  }

  function edit(m: Moment) {
    setDraft({ id: m.id, content: m.content, images: m.images, location: m.location ?? "" });
    textarea.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleVisible(m: Moment) {
    startTransition(async () => {
      const res = await saveMomentAction({
        id: m.id,
        content: m.content,
        images: m.images,
        location: m.location,
        visible: !m.visible,
        createdAt: m.createdAt,
      });
      if (!res.ok) toast.error(res.error);
    });
  }

  async function remove(m: Moment) {
    if (!(await confirm({ title: "删除这条说说？", description: "删除后无法恢复。" }))) return;
    startTransition(async () => {
      const res = await deleteMomentAction(m.id);
      if (res.ok) toast.success("已删除");
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* 编辑器 */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div
          className="rounded-2xl border border-border bg-card p-4 transition-shadow focus-within:shadow-soft"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void addImages(files);
            }
          }}
        >
          {draft.id && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-soft/60 px-3 py-1.5 text-xs text-brand">
              正在编辑一条说说
              <button type="button" onClick={() => setDraft(EMPTY)} className="hover:underline">
                取消
              </button>
            </div>
          )}
          <textarea
            ref={textarea}
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") publish();
            }}
            rows={5}
            maxLength={5000}
            placeholder="此刻在想什么？（支持 Markdown，可以直接粘贴图片）"
            className="field-sizing-content min-h-28 w-full resize-none bg-transparent text-[0.95rem] leading-relaxed outline-none placeholder:text-subtle"
          />
          {draft.images.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
              <AnimatePresence initial={false}>
                {draft.images.map((url) => (
                  <motion.div
                    key={url}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="group/img relative aspect-square overflow-hidden rounded-lg bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbUrl(url) ?? url} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label="移除图片"
                      onClick={() =>
                        setDraft((d) => ({ ...d, images: d.images.filter((u) => u !== url) }))
                      }
                      className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-background/85 opacity-0 transition-opacity group-hover/img:opacity-100"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              aria-label="添加图片"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {uploading ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <ImagePlusIcon className="size-4" />
              )}
            </button>
            <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-muted-foreground focus-within:bg-muted/60">
              <MapPinIcon className="size-3.5 shrink-0" />
              <input
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                maxLength={60}
                placeholder="位置（可选）"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
              />
            </div>
            <button
              type="button"
              onClick={publish}
              disabled={pending || uploading || (!draft.content.trim() && !draft.images.length)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <SendIcon className="size-3.5" />
              )}
              {draft.id ? "更新" : "发布"}
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void addImages(files);
            }}
          />
        </div>
      </div>

      {/* 列表 */}
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {items.map((m) => (
            <motion.li
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className={cn(
                "group/m rounded-2xl border border-border bg-card p-4 transition-opacity",
                !m.visible && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-subtle">
                <span title={formatDateTime(m.createdAt)}>{formatRelative(m.createdAt)}</span>
                {m.location && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPinIcon className="size-3" />
                    {m.location}
                  </span>
                )}
                {!m.visible && (
                  <span className="rounded-full bg-muted px-1.5 text-muted-foreground">已隐藏</span>
                )}
                <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover/m:opacity-100 max-sm:opacity-100">
                  <IconBtn label="编辑" onClick={() => edit(m)}>
                    <SquarePenIcon />
                  </IconBtn>
                  <IconBtn label={m.visible ? "隐藏" : "显示"} onClick={() => toggleVisible(m)}>
                    {m.visible ? <EyeOffIcon /> : <EyeIcon />}
                  </IconBtn>
                  <IconBtn label="删除" danger onClick={() => remove(m)}>
                    <Trash2Icon />
                  </IconBtn>
                </div>
              </div>
              {m.html && (
                <div
                  className="prose-blog prose-comment mt-2"
                  dangerouslySetInnerHTML={{ __html: m.html }}
                />
              )}
              {m.images.length > 0 && (
                <div className="mt-2 grid max-w-sm grid-cols-3 gap-1.5">
                  {m.images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={thumbUrl(url) ?? url}
                      alt=""
                      className="aspect-square rounded-lg bg-muted object-cover"
                    />
                  ))}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
        {!items.length && (
          <li className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
            还没有说说，写下第一条吧
          </li>
        )}
      </ul>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors [&_svg]:size-3.5",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
