"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  LibraryBigIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useConfirm } from "./confirm";
import { SaveBar } from "./save-bar";

type SeriesPost = { id: number; title: string; status: string };
type Series = {
  id: number;
  name: string;
  slug: string;
  description: string;
  posts: SeriesPost[];
};
type Candidate = { id: number; title: string; status: string; seriesId: number | null };
type Draft = Omit<Series, "id"> & { id?: number };

const EMPTY: Draft = { name: "", slug: "", description: "", posts: [] };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function postJson(body: unknown) {
  const res = await fetch("/api/admin/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "保存失败，请重试");
  return data as { series: Series[]; candidates: Candidate[]; id?: number };
}

export function SeriesManager({
  initial,
  candidates: initialCandidates,
}: {
  initial: Series[];
  candidates: Candidate[];
}) {
  const [list, setList] = useState(initial);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selected, setSelected] = useState<number | "new" | null>(initial[0]?.id ?? null);
  const current = selected === "new" ? EMPTY : list.find((item) => item.id === selected);
  const [draft, setDraft] = useState<Draft | null>(current ?? null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const dirty = !!draft && !same(draft, current ?? null);

  function select(next: number | "new") {
    if (next === selected) return;
    setSelected(next);
    setDraft(next === "new" ? { ...EMPTY } : (list.find((item) => item.id === next) ?? null));
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return void toast.error("先给系列起个名字");
    setSaving(true);
    try {
      const data = await postJson({
        op: "save",
        id: draft.id,
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        postIds: draft.posts.map((post) => post.id),
      });
      setList(data.series);
      setCandidates(data.candidates);
      const saved = data.series.find((item) => item.id === data.id) ?? null;
      setSelected(saved?.id ?? null);
      setDraft(saved);
      toast.success(draft.id ? "系列已保存" : "系列已创建");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (
      !(await confirm({
        title: `删除系列「${draft.name}」？`,
        description: "文章本身不会被删除，只是不再属于这个系列。",
        confirmText: "删除",
      }))
    )
      return;
    try {
      const data = await postJson({ op: "delete", id: draft.id });
      setList(data.series);
      setCandidates(data.candidates);
      const next = data.series[0] ?? null;
      setSelected(next?.id ?? null);
      setDraft(next);
      toast.success("系列已删除");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const move = (index: number, delta: number) =>
    setDraft((d) => {
      if (!d) return d;
      const posts = [...d.posts];
      const [item] = posts.splice(index, 1);
      posts.splice(index + delta, 0, item);
      return { ...d, posts };
    });

  const inDraft = new Set(draft?.posts.map((post) => post.id));
  const seriesName = (id: number | null) => list.find((item) => item.id === id)?.name;

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => select("new")}>
          <PlusIcon />
          新建系列
        </Button>
        <ul className="space-y-1">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item.id)}
                aria-current={selected === item.id || undefined}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/70",
                  selected === item.id && "bg-muted",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
                  <LibraryBigIcon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.posts.length} 篇
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!list.length && selected !== "new" && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">还没有系列</p>
        )}
      </aside>

      {draft ? (
        <motion.section
          key={String(selected)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-card"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-4">
            <h3 className="font-medium">{draft.id ? "编辑系列" : "新建系列"}</h3>
            {draft.id && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => void remove()}
              >
                <Trash2Icon />
                删除系列
              </Button>
            )}
          </header>
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm">名字</span>
                <Input
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="例如：从零搭一个博客"
                  className="mt-2"
                />
              </label>
              <label className="block">
                <span className="text-sm">链接</span>
                <div className="mt-2 flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                  <span className="pl-2.5 font-mono text-xs text-subtle">/series/</span>
                  <input
                    aria-label="系列链接"
                    value={draft.slug}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    placeholder="留空按名字生成"
                    className="h-8 min-w-0 flex-1 bg-transparent pr-2.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </label>
            </div>
            <label className="block">
              <span className="text-sm">简介</span>
              <Textarea
                value={draft.description}
                maxLength={500}
                rows={2}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="一两句话说明这个系列讲什么"
                className="mt-2"
              />
            </label>

            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  文章
                  <span className="ml-2 text-xs text-muted-foreground">按阅读顺序排列</span>
                </span>
                <Popover open={adding} onOpenChange={setAdding}>
                  <PopoverTrigger
                    render={
                      <Button variant="outline" size="sm">
                        <PlusIcon />
                        添加文章
                      </Button>
                    }
                  />
                  <PopoverContent align="end" className="w-80 gap-0 p-0">
                    <Command className="rounded-none! bg-transparent">
                      <CommandInput placeholder="搜索文章标题…" />
                      <CommandList className="max-h-72">
                        <CommandEmpty>没有找到文章</CommandEmpty>
                        <CommandGroup>
                          {candidates
                            .filter((post) => !inDraft.has(post.id))
                            .map((post) => (
                              <CommandItem
                                key={post.id}
                                value={`${post.title} ${post.id}`}
                                onSelect={() => {
                                  setDraft((d) =>
                                    d
                                      ? {
                                          ...d,
                                          posts: [
                                            ...d.posts,
                                            { id: post.id, title: post.title, status: post.status },
                                          ],
                                        }
                                      : d,
                                  );
                                  setAdding(false);
                                }}
                                className="rounded-lg"
                              >
                                <span className="min-w-0 flex-1 truncate">{post.title}</span>
                                {post.seriesId && post.seriesId !== draft.id ? (
                                  <span className="shrink-0 text-[11px] text-subtle">
                                    在「{seriesName(post.seriesId)}」
                                  </span>
                                ) : post.status !== "published" ? (
                                  <span className="shrink-0 text-[11px] text-subtle">草稿</span>
                                ) : null}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {draft.posts.length ? (
                <ol className="mt-3 divide-y divide-border/70 rounded-xl border border-border">
                  {draft.posts.map((post, index) => (
                    <li key={post.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-6 shrink-0 text-center font-mono text-xs text-subtle tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{post.title}</span>
                      {post.status !== "published" && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          草稿
                        </span>
                      )}
                      <span className="flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-label="上移"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUpIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="下移"
                          disabled={index === draft.posts.length - 1}
                          onClick={() => move(index, 1)}
                          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDownIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="移出系列"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              posts: draft.posts.filter((p) => p.id !== post.id),
                            })
                          }
                          className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                  还没有文章，点「添加文章」把文章加进来
                </p>
              )}
              <p className="mt-2 text-xs text-subtle">
                草稿也可以先放进来，发布后才会出现在系列目录里。一篇文章只能属于一个系列。
              </p>
            </div>
          </div>
        </motion.section>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          新建一个系列，把相关的文章串起来
        </div>
      )}

      <SaveBar
        dirty={dirty}
        saving={saving}
        label={draft?.id ? "保存系列" : "创建系列"}
        onSave={() => void save()}
        onReset={() => setDraft(selected === "new" ? { ...EMPTY } : (current ?? null))}
      />
    </div>
  );
}
