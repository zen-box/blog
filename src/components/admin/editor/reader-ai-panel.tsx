"use client";
import { BookOpenIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { BenchmarkExtraction, ReaderAiAdminState, ReaderJobView } from "@/lib/reader-ai";
import { useConfirm } from "../confirm";
import { READER_JOB_LABELS } from "../job-status";
type Proposal = BenchmarkExtraction & { contentHash: string };
export function ReaderAiPanel({ postId, dirty }: { postId?: number; dirty: boolean }) {
  const [open, setOpen] = useState(false),
    [state, setState] = useState<ReaderAiAdminState | null>(null),
    [sourceHash, setSourceHash] = useState("");
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [conclusion, setConclusion] = useState("");
  const edited = useRef(false),
    initialHash = useRef(""),
    requestId = useRef(0),
    confirm = useConfirm();
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!postId) return;
      const ticket = ++requestId.current;
      try {
        const response = await fetch(`/api/admin/reader-ai?postId=${postId}`, { signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "读者内容读取失败");
        if (signal?.aborted || ticket !== requestId.current) return;
        setState(data);
        if (!initialHash.current) {
          initialHash.current = data.contentHash;
          setSourceHash(data.contentHash);
        }
        if (!edited.current) setText(data.summary?.text ?? "");
      } catch (error) {
        if (!signal?.aborted && ticket === requestId.current) setError((error as Error).message);
      }
    },
    [postId],
  );
  useEffect(() => {
    if (!open || !postId) return;
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => void refresh(controller.signal));
    const timer = setInterval(() => void refresh(controller.signal), 1500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      controller.abort();
    };
  }, [open, postId, refresh]);
  const changed = dirty || Boolean(state && sourceHash && sourceHash !== state.contentHash);
  async function submit(payload: unknown, endpoint = "/api/admin/reader-ai") {
    if (changed) {
      setError("正文有变化，请保存后重新打开读者 AI 内容");
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "操作失败，请重试");
      return data;
    } catch (error) {
      setError((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!state) return;
    const result = await submit({ op: "generate", postId, contentHash: sourceHash, force: true });
    if (result) {
      toast.success("摘要生成任务已加入队列");
      await refresh();
    }
  }
  async function saveSummary(value = text) {
    const result = await submit({
      op: "saveSummary",
      postId,
      contentHash: sourceHash,
      text: value,
    });
    if (result) {
      edited.current = false;
      setState(result);
      setText(result.summary?.text ?? "");
      toast.success("摘要已保存");
    }
  }
  async function extract() {
    const result = await submit({ op: "extractBenchmark", postId });
    if (result) {
      if (!result.matched) {
        setError(result.message);
        return;
      }
      setProposal(result);
      setSelected([]);
      setConclusion(result.conclusion);
    }
  }
  async function saveBenchmark(clear = false) {
    if (!clear && !proposal) return;
    const result = await submit({
      op: "saveBenchmark",
      postId,
      contentHash: clear ? sourceHash : proposal!.contentHash,
      conclusion: clear ? "" : conclusion,
      itemKeys: clear ? [] : selected,
    });
    if (result) {
      setState(result);
      setProposal(null);
      setSelected([]);
      toast.success(clear ? "测评速览已清除" : "已确认并保存测评速览");
    }
  }
  async function jobAction(job: ReaderJobView, op: "retry" | "cancel") {
    if (await submit({ op, jobId: job.id }, "/api/admin/jobs")) await refresh();
  }
  function openPanel() {
    if (!postId || dirty) {
      toast("先保存正文，再管理读者 AI 内容");
      return;
    }
    edited.current = false;
    initialHash.current = "";
    setSourceHash("");
    setState(null);
    setText("");
    setProposal(null);
    setSelected([]);
    setError("");
    setOpen(true);
  }
  return (
    <>
      <Button variant="outline" size="sm" aria-label="读者 AI 内容" onClick={openPanel}>
        <BookOpenIcon className="size-4" />
        <span className="hidden sm:inline">读者 AI</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>读者 AI 内容</DialogTitle>
            <DialogDescription>
              根据已保存的正文生成摘要，测评指标经你确认后公开。生成和编辑不会发布文章。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {changed && (
            <p role="alert" className="text-sm text-destructive">
              正文有变化，请保存后重新打开此面板。
            </p>
          )}
          {!state ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取…
            </p>
          ) : (
            <div className="space-y-6">
              <section
                className="space-y-3 rounded-xl border border-border p-4"
                aria-labelledby="reader-summary-heading"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="reader-summary-heading" className="font-medium">
                    AI 摘要
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || changed || !state.config.enabled}
                    onClick={() => void generate()}
                  >
                    <RefreshCwIcon className="size-3.5" />
                    {state.summary ? "重新生成摘要" : "生成摘要"}
                  </Button>
                </div>
                {state.stale.summary && (
                  <p className="text-xs text-muted-foreground">
                    正文已更新，旧摘要暂不向读者显示；请重新生成或核对后保存。
                  </p>
                )}
                <Textarea
                  aria-label="读者 AI 摘要"
                  maxLength={500}
                  className="min-h-32"
                  value={text}
                  onChange={(event) => {
                    edited.current = true;
                    setText(event.target.value);
                  }}
                  placeholder="生成完成后显示摘要，也可以手动编辑。"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={busy || changed || (!text.trim() && !state.summary)}
                    onClick={() => void saveSummary()}
                  >
                    保存摘要
                  </Button>
                  {state.summary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || changed}
                      onClick={async () => {
                        if (
                          await confirm({ title: "清除这篇文章的 AI 摘要？", confirmText: "清除" })
                        )
                          await saveSummary("");
                      }}
                    >
                      清除摘要
                    </Button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{text.length} / 500</span>
                </div>
              </section>
              <section
                className="space-y-3 rounded-xl border border-border p-4"
                aria-labelledby="reader-benchmark-heading"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="reader-benchmark-heading" className="font-medium">
                    测评速览
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || changed}
                    onClick={() => void extract()}
                  >
                    提取测评指标
                  </Button>
                </div>
                {state.stale.benchmark && (
                  <p className="text-xs text-muted-foreground">
                    正文已更新，旧速览暂不向读者显示；请重新提取并确认。
                  </p>
                )}
                {proposal ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      以下是尚未公开的建议。勾选指标，核对原文依据和结论后保存。
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelected(
                          selected.length === proposal.items.length
                            ? []
                            : proposal.items.map((item) => item.key),
                        )
                      }
                    >
                      {selected.length === proposal.items.length ? "取消全选" : "全选指标"}
                    </Button>
                    <div
                      role="region"
                      aria-label="待确认的测评指标"
                      tabIndex={0}
                      className="max-h-72 space-y-2 overflow-y-auto"
                      data-lenis-prevent
                    >
                      {proposal.items.map((item) => (
                        <label
                          key={item.key}
                          className="flex gap-3 rounded-lg border border-border p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(item.key)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, item.key]
                                  : current.filter((key) => key !== item.key),
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="font-medium">{item.label}：</span>
                            <span className="break-words">{item.value}</span>
                            <span className="mt-1 block text-xs break-words text-muted-foreground">
                              {item.evidence
                                .map((evidence) => `原文第 ${evidence.line} 行：${evidence.text}`)
                                .join("；")}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <Textarea
                      aria-label="测评速览结论"
                      maxLength={500}
                      value={conclusion}
                      onChange={(event) => setConclusion(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-foreground text-background hover:bg-foreground/90"
                        disabled={busy || changed || !selected.length || !conclusion.trim()}
                        onClick={() => void saveBenchmark()}
                      >
                        确认并保存速览
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                        放弃提取建议
                      </Button>
                    </div>
                  </>
                ) : state.benchmark ? (
                  <>
                    <p className="text-sm leading-relaxed">{state.benchmark.conclusion}</p>
                    <p className="text-xs text-muted-foreground">
                      已确认 {state.benchmark.items.length} 项指标
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || changed}
                      onClick={async () => {
                        if (await confirm({ title: "清除已确认的测评速览？", confirmText: "清除" }))
                          await saveBenchmark(true);
                      }}
                    >
                      清除测评速览
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    尚未确认测评速览。支持 NodeQuality / Check.Place 报告。
                  </p>
                )}
              </section>
              <section className="space-y-2" aria-labelledby="reader-jobs-heading">
                <h3 id="reader-jobs-heading" className="font-medium">
                  生成任务
                </h3>
                {state.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>摘要 · {READER_JOB_LABELS[job.status]}</span>
                    <span className="text-xs text-muted-foreground">
                      尝试 {job.attempts} / {job.maxAttempts}
                    </span>
                    {job.error && (
                      <span className="basis-full text-xs text-destructive">{job.error}</span>
                    )}
                    {["pending", "running", "retry"].includes(job.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || changed}
                        onClick={() => void jobAction(job, "cancel")}
                      >
                        取消任务
                      </Button>
                    )}
                    {["failed", "cancelled"].includes(job.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || changed}
                        onClick={() => void jobAction(job, "retry")}
                      >
                        重试任务
                      </Button>
                    )}
                  </div>
                ))}
                {!state.jobs.length && (
                  <p className="text-sm text-muted-foreground">还没有生成任务。</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
