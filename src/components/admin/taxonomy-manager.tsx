"use client";

import { PlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteCategoryAction,
  deleteTagAction,
  saveCategoryAction,
  saveTagAction,
} from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Panel } from "./admin-page";
import { useConfirm } from "./confirm";

type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  count: number;
};
type Tag = { id: number; name: string; slug: string; count: number };

type CategoryForm = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
};

export function TaxonomyManager({ categories, tags }: { categories: Category[]; tags: Tag[] }) {
  const [catForm, setCatForm] = useState<CategoryForm | null>(null);
  const [tagForm, setTagForm] = useState<Tag | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  function saveCategory() {
    if (!catForm) return;
    startTransition(async () => {
      const res = await saveCategoryAction(catForm);
      if (!res.ok) return void toast.error(res.error);
      toast.success(catForm.id ? "分类已更新" : "分类已添加");
      setCatForm(null);
    });
  }

  async function removeCategory(c: Category) {
    const ok = await confirm({
      title: `删除分类「${c.name}」？`,
      description: c.count ? `其中 ${c.count} 篇文章会变为未分类。` : undefined,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteCategoryAction(c.id);
      if (res.ok) toast.success("已删除");
      else toast.error(res.error);
    });
  }

  function saveTag() {
    if (!tagForm) return;
    startTransition(async () => {
      const res = await saveTagAction(tagForm.id, tagForm.name, tagForm.slug);
      if (!res.ok) return void toast.error(res.error);
      toast.success("标签已更新");
      setTagForm(null);
    });
  }

  async function removeTag(t: Tag) {
    if (!(await confirm({ title: `删除标签「${t.name}」？`, description: "文章本身不会被删除。" })))
      return;
    startTransition(async () => {
      const res = await deleteTagAction(t.id);
      if (res.ok) toast.success("已删除");
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel
        title="分类"
        action={
          <button
            type="button"
            onClick={() =>
              setCatForm({ name: "", slug: "", description: "", sortOrder: categories.length + 1 })
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
            添加
          </button>
        }
      >
        {categories.length ? (
          <ul className="divide-y divide-border/60">
            {categories.map((c) => (
              <li
                key={c.id}
                className="group/row flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="font-mono text-xs text-subtle">/{c.slug}</span>
                  </p>
                  {c.description && (
                    <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{c.count} 篇</span>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 max-sm:opacity-100">
                  <button
                    type="button"
                    aria-label="编辑"
                    onClick={() =>
                      setCatForm({
                        id: c.id,
                        name: c.name,
                        slug: c.slug,
                        description: c.description ?? "",
                        sortOrder: c.sortOrder,
                      })
                    }
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <SquarePenIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={() => removeCategory(c)}
                    className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">还没有分类</p>
        )}
      </Panel>

      <Panel title={`标签 · ${tags.length}`}>
        {tags.length ? (
          <div className="flex flex-wrap gap-2 p-5">
            {tags.map((t) => (
              <span
                key={t.id}
                className="group/tag inline-flex items-center gap-1 rounded-lg border border-border py-1 pr-1 pl-2.5 text-sm"
              >
                <button
                  type="button"
                  onClick={() => setTagForm(t)}
                  className="text-foreground hover:text-brand"
                >
                  {t.name}
                </button>
                <span className="text-xs text-subtle tabular-nums">{t.count}</span>
                <button
                  type="button"
                  aria-label={`删除 ${t.name}`}
                  onClick={() => removeTag(t)}
                  className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/tag:opacity-100 hover:text-destructive"
                >
                  <Trash2Icon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            写文章时添加的标签会出现在这里
          </p>
        )}
      </Panel>

      <Dialog open={!!catForm} onOpenChange={(o) => !o && setCatForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catForm?.id ? "编辑分类" : "添加分类"}</DialogTitle>
          </DialogHeader>
          {catForm && (
            <div className="grid gap-4">
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input
                    autoFocus
                    value={catForm.name}
                    onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>排序</Label>
                  <Input
                    type="number"
                    value={catForm.sortOrder}
                    onChange={(e) =>
                      setCatForm({ ...catForm, sortOrder: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>别名</Label>
                <Input
                  value={catForm.slug}
                  onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                  placeholder="留空自动生成，例如 frontend"
                />
              </div>
              <div className="space-y-2">
                <Label>介绍</Label>
                <Textarea
                  rows={2}
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCatForm(null)}
              className="h-9 rounded-lg border border-border px-4 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveCategory}
              disabled={pending}
              className="h-9 rounded-lg bg-foreground px-4 text-sm text-background hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tagForm} onOpenChange={(o) => !o && setTagForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
          </DialogHeader>
          {tagForm && (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  autoFocus
                  value={tagForm.name}
                  onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>别名</Label>
                <Input
                  value={tagForm.slug}
                  onChange={(e) => setTagForm({ ...tagForm, slug: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTagForm(null)}
              className="h-9 rounded-lg border border-border px-4 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveTag}
              disabled={pending}
              className="h-9 rounded-lg bg-foreground px-4 text-sm text-background hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
