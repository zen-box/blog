"use client";

import { CopyIcon, DownloadIcon, ImageIcon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 预览生成好的分享图：下载、复制图片；手机上可以长按保存 */
export function ShareImageDialog({
  open,
  onOpenChange,
  title,
  description,
  filename,
  render,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  filename: string;
  /** 每次打开时调用，返回 PNG */
  render: () => Promise<Blob>;
}) {
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let url = "";
    let alive = true;
    render().then(
      (blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImage({ url, blob });
      },
      (e: Error) => alive && setError(e.message || "生成图片失败"),
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setImage(null);
      setError("");
    };
    // render 每次渲染都是新函数，只在打开时生成一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canCopy = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-64 place-items-center overflow-hidden rounded-xl bg-muted/50">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={title} className="w-full shadow-soft" />
          ) : error ? (
            <p role="alert" className="px-6 text-center text-sm text-destructive">
              {error}
            </p>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              正在生成…
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-subtle sm:hidden">
            <ImageIcon className="size-3.5" />
            长按图片保存
          </span>
          {canCopy && (
            <Button
              variant="outline"
              disabled={!image}
              onClick={async () => {
                try {
                  await navigator.clipboard.write([
                    new ClipboardItem({ "image/png": image!.blob }),
                  ]);
                  toast.success("图片已复制");
                } catch {
                  toast.error("这个浏览器不支持复制图片，请下载");
                }
              }}
            >
              <CopyIcon />
              复制图片
            </Button>
          )}
          <Button
            disabled={!image}
            render={<a href={image?.url} download={filename} />}
            nativeButton={false}
          >
            <DownloadIcon />
            下载
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
