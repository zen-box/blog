"use client";

import { LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { uploadFiles } from "./upload";

/** 图片设置项：预览 + 地址输入 + 上传；raw 模式保留原文件（Logo、图标） */
export function ImageField({
  value,
  onChange,
  raw = false,
  accept = "image/*",
  shape = "square",
  fallback,
  dark = false,
  placeholder = "图片地址",
}: {
  value: string;
  onChange: (url: string) => void;
  raw?: boolean;
  accept?: string;
  shape?: "circle" | "square" | "wide";
  /** 未设置时的预览图 */
  fallback?: string;
  /** 在深色底上预览（暗色 Logo） */
  dark?: boolean;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = value || fallback;

  async function upload(file: File) {
    setUploading(true);
    try {
      const [f] = await uploadFiles([file], { raw });
      onChange(f.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden border border-border",
          dark ? "bg-neutral-900" : "bg-muted",
          shape === "circle" && "size-12 rounded-full",
          shape === "square" && "size-12 rounded-xl",
          shape === "wide" && "h-12 w-32 rounded-xl px-2",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className={cn(
              shape === "wide" ? "max-h-8 max-w-full object-contain" : "size-full object-cover",
              shape === "square" && "object-contain p-1.5",
            )}
          />
        ) : null}
      </span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button
          type="button"
          aria-label="清除"
          onClick={() => onChange("")}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
      >
        {uploading ? (
          <LoaderIcon className="size-3.5 animate-spin" />
        ) : (
          <UploadIcon className="size-3.5" />
        )}
        上传
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
