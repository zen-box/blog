"use client";

import { CheckIcon, ImageIcon, LoaderIcon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { listMediaAction } from "@/app/admin/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { thumbUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

import { uploadFiles } from "./upload";

type Item = { id: number; url: string; filename: string; mime: string };

type PickerProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: (urls: string[]) => void;
  multiple?: boolean;
};

/** 从媒体库选择图片，或直接上传新图片 */
export function MediaPicker({ open, ...props }: PickerProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* 弹窗关闭时内容卸载，每次打开都是全新的状态 */}
        {open && <PickerBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onOpenChange, onSelect, multiple = false }: PickerProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listMediaAction(1, true).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) return void toast.error(res.error);
      setItems(res.data.items);
      setHasMore(res.data.hasMore);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    setLoading(true);
    const res = await listMediaAction(page + 1, true);
    setLoading(false);
    if (!res.ok) return void toast.error(res.error);
    setItems((cur) => [...cur, ...res.data.items]);
    setHasMore(res.data.hasMore);
    setPage(page + 1);
  }

  async function upload(files: File[]) {
    setUploading(true);
    try {
      const uploaded = await uploadFiles(files);
      const images = uploaded.filter((f) => f.mime.startsWith("image/"));
      setItems((cur) => [...images, ...cur]);
      if (!multiple && images[0]) {
        onSelect([images[0].url]);
        onOpenChange(false);
      } else {
        setSelected((s) => [...s, ...images.map((i) => i.url)]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggle(url: string) {
    if (!multiple) {
      onSelect([url]);
      onOpenChange(false);
      return;
    }
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  }

  return (
    <>
      <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <DialogTitle>媒体库</DialogTitle>
        <div className="mr-8 flex gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            {uploading ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            上传
          </button>
          {multiple && (
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => {
                onSelect(selected);
                onOpenChange(false);
              }}
              className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              插入 {selected.length || ""}
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple={multiple}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </DialogHeader>
      <div className="max-h-[70vh] overflow-y-auto p-4" data-lenis-prevent>
        {items.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {items.map((m) => {
              const on = selected.includes(m.url);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.url)}
                  title={m.filename}
                  className={cn(
                    "group/item relative aspect-square overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-popover transition-shadow",
                    on ? "ring-2 ring-brand" : "hover:ring-2 hover:ring-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(m.url) ?? m.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover/item:scale-105"
                  />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-brand text-brand-foreground">
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          !loading && (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <ImageIcon className="size-8 text-subtle" />
              <p className="text-sm">还没有图片，点击右上角上传</p>
            </div>
          )
        )}
        {loading && (
          <LoaderIcon className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
        )}
        {!loading && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            className="mx-auto mt-4 block rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            加载更多
          </button>
        )}
      </div>
    </>
  );
}
