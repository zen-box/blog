"use client";

import { ImageIcon, LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { thumbUrl } from "@/lib/images";
import type { EditorPost } from "@/server/admin";

import { MediaPicker } from "../media-picker";
import { TagInput } from "../tag-input";
import { uploadFiles } from "../upload";

/** ISO 时间 ↔ <input type="datetime-local"> 的本地时间 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[0.8rem] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

function CoverField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const [f] = await uploadFiles([file]);
      onChange(f.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="group/cover relative aspect-[2/1] overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(value) ?? value} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="移除封面"
              className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/85 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover/cover:opacity-100 hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="grid size-full place-items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex flex-col items-center gap-2">
              {uploading ? (
                <LoaderIcon className="size-5 animate-spin" />
              ) : (
                <UploadIcon className="size-5" />
              )}
              上传封面（建议 2:1）
            </span>
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm transition-colors hover:bg-muted"
        >
          <UploadIcon className="size-3.5" />
          上传
        </button>
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm transition-colors hover:bg-muted"
        >
          <ImageIcon className="size-3.5" />
          媒体库
        </button>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="或填写图片地址"
        className="h-8 text-xs"
      />
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <MediaPicker
        open={picker}
        onOpenChange={setPicker}
        onSelect={([url]) => url && onChange(url)}
      />
    </div>
  );
}

export function PostSettings({
  open,
  onOpenChange,
  post,
  update,
  categories,
  allTags,
  onGenerateInfo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: EditorPost;
  update: (patch: Partial<EditorPost>) => void;
  categories: { id: number; name: string }[];
  allTags: string[];
  onGenerateInfo: () => void;
}) {
  const isPost = post.type === "post";
  const categoryItems = [
    { value: "none", label: "未分类" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{isPost ? "文章设置" : "页面设置"}</SheetTitle>
          <SheetDescription>修改会在下次保存时生效。</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5" data-lenis-prevent>
          <button
            type="button"
            className="h-9 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted"
            onClick={() => {
              onOpenChange(false);
              onGenerateInfo();
            }}
          >
            AI 生成文章信息
          </button>
          <Field label="链接" hint="留空将根据标题自动生成拼音链接。">
            <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <span className="pl-2.5 font-mono text-xs text-subtle">
                {isPost ? "/posts/" : "/"}
              </span>
              <input
                aria-label="链接"
                value={post.slug}
                onChange={(e) => update({ slug: e.target.value })}
                placeholder="my-first-post"
                className="h-8 min-w-0 flex-1 bg-transparent pr-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>

          {isPost && (
            <>
              <Field label="分类">
                <Select
                  items={categoryItems}
                  value={post.categoryId ? String(post.categoryId) : "none"}
                  onValueChange={(v) =>
                    update({ categoryId: v && v !== "none" ? Number(v) : null })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="标签">
                <TagInput
                  value={post.tags}
                  onChange={(tags) => update({ tags })}
                  suggestions={allTags}
                />
              </Field>
            </>
          )}

          <Field label="封面">
            <CoverField value={post.cover} onChange={(cover) => update({ cover })} />
          </Field>

          {isPost && (
            <Field label="摘要" hint="留空时自动截取正文开头，或 <!-- more --> 之前的内容。">
              <Textarea
                value={post.excerpt}
                onChange={(e) => update({ excerpt: e.target.value })}
                rows={3}
                maxLength={500}
                placeholder="用一两句话介绍这篇文章"
              />
            </Field>
          )}

          <Field label="发布时间" hint={isPost ? "设为将来的时间即为定时发布。" : undefined}>
            <Input
              type="datetime-local"
              value={toLocalInput(post.publishedAt)}
              onChange={(e) => update({ publishedAt: fromLocalInput(e.target.value) })}
              className="h-8"
            />
          </Field>

          <div className="space-y-4 rounded-xl border border-border p-4">
            {isPost && (
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  置顶
                  <span className="mt-0.5 block text-xs text-subtle">显示在首页最前面</span>
                </span>
                <Switch checked={post.pinned} onCheckedChange={(pinned) => update({ pinned })} />
              </label>
            )}
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                允许评论
                <span className="mt-0.5 block text-xs text-subtle">关闭后仍会显示已有评论</span>
              </span>
              <Switch
                checked={post.allowComments}
                onCheckedChange={(allowComments) => update({ allowComments })}
              />
            </label>
          </div>

          <Field label="SEO 描述" hint="搜索引擎结果中显示的描述，留空时使用摘要。">
            <Textarea
              value={post.seoDescription}
              onChange={(e) => update({ seoDescription: e.target.value })}
              rows={2}
              maxLength={300}
            />
          </Field>
        </div>
      </SheetContent>
    </Sheet>
  );
}
