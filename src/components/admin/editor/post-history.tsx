"use client";

import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EditorPost } from "@/server/admin";
import { AiDiff } from "./ai-assistant";

type Version = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  reason: string;
  snapshot: Partial<EditorPost>;
};
const REASONS: Record<string, string> = {
  manual: "手动保存",
  auto: "自动保存",
  publish: "发布",
  ai: "AI 修改前",
  restore: "恢复前",
  before: "保存前",
};
export function PostHistory({
  post,
  snapshot,
  update,
  viewRef,
}: {
  post: EditorPost;
  snapshot: () => Promise<void>;
  update: (patch: Partial<EditorPost>) => void;
  viewRef: React.RefObject<EditorView | null>;
}) {
  const [open, setOpen] = useState(false),
    [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    if (!post.id) {
      toast("保存草稿后可以查看版本历史");
      return;
    }
    setOpen(true);
    setBusy(true);
    setError("");
    setSelected(null);
    try {
      const res = await fetch(`/api/admin/history?postId=${post.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "历史读取失败");
      setVersions(data.versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await snapshot();
      const view = viewRef.current;
      if (view)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: selected.content },
          userEvent: "input.restore",
          annotations: isolateHistory.of("full"),
        });
      const saved = selected.snapshot;
      update({
        title: saved.title ?? selected.title,
        content: selected.content,
        slug: saved.slug ?? "",
        excerpt: saved.excerpt ?? "",
        seoDescription: saved.seoDescription ?? "",
        tags: saved.tags ?? [],
        categoryId: saved.categoryId ?? null,
        cover: saved.cover ?? "",
        pinned: saved.pinned ?? false,
        allowComments: saved.allowComments ?? true,
        status: "draft",
        publishedAt: null,
      });
      setOpen(false);
      toast.success("历史版本已填回草稿，恢复前内容已保存到历史");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void load()} aria-label="版本历史">
        <HistoryIcon className="size-4" />
        <span className="hidden sm:inline">历史</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>版本历史</DialogTitle>
            <DialogDescription>
              最近 50 个版本；自动保存按 5 分钟合并。恢复前保留当前内容，恢复后为草稿。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && <p role="status">正在处理…</p>}
          <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
            <div className="max-h-72 space-y-1 overflow-auto">
              {versions.map((version) => (
                <button
                  type="button"
                  key={version.id}
                  onClick={() => setSelected(version)}
                  aria-pressed={selected?.id === version.id}
                  className="block w-full rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-muted aria-pressed:bg-muted"
                >
                  <span className="block">
                    {new Date(version.createdAt).toLocaleString("zh-CN")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {REASONS[version.reason] ?? version.reason} · {version.title}
                  </span>
                </button>
              ))}
              {!busy && !versions.length && (
                <p className="text-sm text-muted-foreground">还没有历史版本</p>
              )}
            </div>
            <div className="min-w-0">
              {selected ? (
                <>
                  <p className="mb-3 font-medium">当前正文 → 所选版本</p>
                  <div
                    className="max-h-96 overflow-auto"
                    role="region"
                    aria-label="历史版本正文差异"
                    tabIndex={0}
                  >
                    <AiDiff before={post.content} after={selected.content} />
                  </div>
                  <Button className="mt-4" disabled={busy} onClick={() => void restore()}>
                    恢复为草稿
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">选择一个版本查看差异</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
