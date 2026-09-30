"use client";

import { CheckIcon, CopyIcon, FileIcon, LoaderIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteMediaAction } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/format";
import { thumbUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

import { useConfirm } from "./confirm";
import { formatBytes, markdownFor, uploadFiles } from "./upload";

type Item = {
  id: number;
  url: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  storage: "local" | "s3";
  createdAt: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

export function MediaLibrary({ items }: { items: Item[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(files.length);
    try {
      await uploadFiles(files);
      toast.success(`已上传 ${files.length} 个文件`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(0);
    }
  }

  // 整个页面都可以拖入文件
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void upload(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
    // upload 只依赖稳定的 router
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      toast.error("复制失败");
    }
  }

  async function remove(m: Item) {
    const ok = await confirm({
      title: `删除「${m.filename}」？`,
      description: "文章中引用这个文件的地方将无法显示。",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteMediaAction(m.id);
      if (res.ok) toast.success("已删除");
      else toast.error(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="mb-5 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        {uploading ? (
          <LoaderIcon className="size-6 animate-spin" />
        ) : (
          <UploadIcon className="size-6" />
        )}
        {uploading ? `正在上传 ${uploading} 个文件…` : "点击上传，或把文件拖到页面任意位置"}
        <span className="text-xs text-subtle">单个文件最大 30MB</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(files);
        }}
      />

      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <AnimatePresence initial={false}>
            {items.map((m) => {
              const image = m.mime.startsWith("image/");
              return (
                <motion.figure
                  key={m.id}
                  layout
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="group/m overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {m.storage === "s3" && (
                      <span className="absolute top-2 left-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur">
                        S3
                      </span>
                    )}
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrl(m.url) ?? m.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-subtle">
                        <FileIcon className="size-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/45 to-transparent p-2 opacity-0 transition-opacity group-hover/m:opacity-100 max-sm:opacity-100">
                      <OverlayBtn label="复制地址" onClick={() => copy(m.url, `u${m.id}`)}>
                        {copied === `u${m.id}` ? <CheckIcon /> : <CopyIcon />}
                      </OverlayBtn>
                      <OverlayBtn
                        label="复制 Markdown"
                        onClick={() => copy(markdownFor({ ...m }), `m${m.id}`)}
                      >
                        {copied === `m${m.id}` ? (
                          <CheckIcon />
                        ) : (
                          <span className="text-[0.62rem] font-semibold">MD</span>
                        )}
                      </OverlayBtn>
                      <OverlayBtn label="删除" onClick={() => remove(m)} danger>
                        <Trash2Icon />
                      </OverlayBtn>
                    </div>
                  </div>
                  <figcaption className="px-3 py-2">
                    <p className="truncate text-xs text-foreground" title={m.filename}>
                      {m.filename}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[0.68rem] text-subtle"
                      title={formatDateTime(m.createdAt)}
                    >
                      {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
                      {formatBytes(m.size)}
                    </p>
                  </figcaption>
                </motion.figure>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">还没有上传过文件</p>
      )}

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-background/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand/50 bg-card px-16 py-12 text-brand shadow-float"
            >
              <UploadIcon className="size-8" />
              松开即可上传
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function OverlayBtn({
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
        "grid size-7 place-items-center rounded-lg bg-white/90 text-neutral-700 transition-colors hover:bg-white [&_svg]:size-3.5",
        danger && "text-red-600",
      )}
    >
      {children}
    </button>
  );
}
