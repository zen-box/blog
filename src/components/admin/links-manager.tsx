"use client";

import { CheckIcon, PlusIcon, SquarePenIcon, Trash2Icon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteLinkAction, saveLinkAction, setLinkStatusAction } from "@/app/admin/actions";
import { LinkAvatar } from "@/components/links/link-card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useConfirm } from "./confirm";

type Status = "approved" | "pending" | "rejected";
type LinkRow = {
  id: number;
  name: string;
  url: string;
  avatar: string | null;
  description: string | null;
  group: string;
  sortOrder: number;
  status: Status;
  email: string | null;
};

type Form = {
  id?: number;
  name: string;
  url: string;
  avatar: string;
  description: string;
  group: string;
  sortOrder: number;
  status: Status;
};

const EASE = [0.16, 1, 0.3, 1] as const;
const EMPTY: Form = {
  name: "",
  url: "",
  avatar: "",
  description: "",
  group: "友链",
  sortOrder: 0,
  status: "approved",
};

export function LinksManager({ links }: { links: LinkRow[] }) {
  const [form, setForm] = useState<Form | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const applications = links.filter((l) => l.status === "pending");
  const approved = links.filter((l) => l.status === "approved");
  const rejected = links.filter((l) => l.status === "rejected");
  const groups = [...new Set(approved.map((l) => l.group))];

  function save() {
    if (!form) return;
    startTransition(async () => {
      const res = await saveLinkAction(form);
      if (!res.ok) return void toast.error(res.error);
      toast.success(form.id ? "已更新" : "已添加");
      setForm(null);
    });
  }

  function setStatus(l: LinkRow, status: Status) {
    startTransition(async () => {
      const res = await setLinkStatusAction(l.id, status);
      if (res.ok) toast.success(status === "approved" ? `已通过「${l.name}」` : "已拒绝");
      else toast.error(res.error);
    });
  }

  async function remove(l: LinkRow) {
    if (!(await confirm({ title: `删除「${l.name}」？` }))) return;
    startTransition(async () => {
      const res = await deleteLinkAction(l.id);
      if (res.ok) toast.success("已删除");
      else toast.error(res.error);
    });
  }

  const edit = (l: LinkRow) =>
    setForm({
      id: l.id,
      name: l.name,
      url: l.url,
      avatar: l.avatar ?? "",
      description: l.description ?? "",
      group: l.group,
      sortOrder: l.sortOrder,
      status: l.status,
    });

  return (
    <>
      <div className="mb-5 flex justify-end">
        <button
          type="button"
          onClick={() => setForm({ ...EMPTY, group: groups[0] ?? "友链" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm text-background transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" />
          添加友链
        </button>
      </div>

      <AnimatePresence initial={false}>
        {applications.length > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mb-6 overflow-hidden"
          >
            <h3 className="mb-3 text-sm font-medium text-foreground">
              待处理的申请 <span className="ml-1 text-brand">{applications.length}</span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {applications.map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-3 rounded-2xl border border-brand/25 bg-brand-soft/30 p-4"
                >
                  <LinkAvatar src={l.avatar} name={l.name} className="size-10 text-base" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:text-brand"
                    >
                      {l.name}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">{l.url}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>
                    {l.email && <p className="mt-1 text-xs text-subtle">{l.email}</p>}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(l, "approved")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-foreground px-3 text-sm text-background hover:opacity-90"
                      >
                        <CheckIcon className="size-3.5" />
                        通过
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(l, "rejected")}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"
                      >
                        <XIcon className="size-3.5" />
                        拒绝
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-foreground">{g}</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {approved
                .filter((l) => l.group === g)
                .map((l) => (
                  <li
                    key={l.id}
                    className="group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <LinkAvatar src={l.avatar} name={l.name} className="size-9 text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{l.name}</span>
                        <span className="font-mono text-xs text-subtle">#{l.sortOrder}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.description || l.url}
                      </p>
                    </div>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 max-sm:opacity-100">
                      <button
                        type="button"
                        aria-label="编辑"
                        onClick={() => edit(l)}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <SquarePenIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="删除"
                        onClick={() => remove(l)}
                        className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      ))}

      {!approved.length && !applications.length && (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          还没有友链
        </p>
      )}

      {rejected.length > 0 && (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            已拒绝的申请（{rejected.length}）
          </summary>
          <ul className="mt-2 space-y-1">
            {rejected.map((l) => (
              <li key={l.id} className="flex items-center gap-3 text-muted-foreground">
                <span className="truncate">
                  {l.name} · {l.url}
                </span>
                <button
                  type="button"
                  onClick={() => setStatus(l, "approved")}
                  className="text-xs hover:text-brand"
                >
                  通过
                </button>
                <button
                  type="button"
                  onClick={() => remove(l)}
                  className="text-xs text-destructive"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "编辑友链" : "添加友链"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>分组</Label>
                  <Input
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value })}
                    list="link-groups"
                  />
                  <datalist id="link-groups">
                    {groups.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-2">
                <Label>网址</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://"
                />
              </div>
              <div className="space-y-2">
                <Label>头像</Label>
                <Input
                  value={form.avatar}
                  onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                  placeholder="https://…/avatar.png（可选）"
                />
              </div>
              <div className="space-y-2">
                <Label>介绍</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>排序（越小越靠前）</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="h-9 rounded-lg border border-border px-4 text-sm hover:bg-muted"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="h-9 rounded-lg bg-foreground px-4 text-sm text-background hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
