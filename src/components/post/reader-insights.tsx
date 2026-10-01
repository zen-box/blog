"use client";
import { ActivityIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { BenchmarkGroup, ReaderInsights } from "@/lib/reader-ai";
import "./reader-insights.css";
const GROUPS: Record<BenchmarkGroup, string> = {
  hardware: "硬件",
  performance: "跑分与性能",
  ip: "IP 质量",
  media: "流媒体与服务",
  network: "三网延迟与回程",
};
export function ReaderInsightsCard({ insights }: { insights: ReaderInsights }) {
  const text = insights.summary?.text ?? "",
    root = useRef<HTMLElement>(null),
    reduced = useReducedMotion();
  const [characters, setCharacters] = useState(0);
  useEffect(() => {
    const element = root.current;
    if (!element || !text) return;
    let frame = 0,
      started = false;
    const reveal = () => {
      if (started) return;
      started = true;
      if (reduced || !("IntersectionObserver" in window)) {
        setCharacters(text.length);
        return;
      }
      const start = performance.now();
      const tick = (time: number) => {
        const count = Math.min(text.length, Math.ceil(((time - start) / 900) * text.length));
        setCharacters(count);
        if (count < text.length) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (!("IntersectionObserver" in window)) {
      frame = requestAnimationFrame(reveal);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text, reduced]);
  if (!insights.summary && !insights.benchmark) return null;
  return (
    <div className="mb-8 space-y-4" data-reader-insights>
      {insights.summary && (
        <section
          ref={root}
          aria-labelledby="ai-reader-summary"
          className="ai-summary-reveal rounded-2xl border border-border bg-brand-soft/40 p-5 sm:p-6"
          data-ai-summary
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="ai-reader-summary" className="flex items-center gap-2 text-sm font-semibold">
              <SparklesIcon className="size-4 text-brand" />
              AI 摘要
            </h2>
            <span className="text-xs text-muted-foreground">由 AI 生成，可经作者修改</span>
          </div>
          <p className="text-sm leading-relaxed">
            <span aria-hidden="true" data-summary-visible>
              {text.slice(0, characters)}
            </span>
            <span aria-hidden="true" data-summary-remaining className="opacity-0">
              {text.slice(characters)}
            </span>
            <span className="sr-only">{text}</span>
          </p>
          <noscript>
            <p className="text-sm leading-relaxed">{text}</p>
          </noscript>
        </section>
      )}
      {insights.benchmark && (
        <section
          aria-labelledby="reader-benchmark"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          data-benchmark-summary
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="reader-benchmark" className="flex items-center gap-2 text-sm font-semibold">
              <ActivityIcon className="size-4 text-brand" />
              测评速览
            </h2>
            <span className="text-xs text-muted-foreground">源报告提取 · 已由作者确认</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed">{insights.benchmark.conclusion}</p>
          <div className="space-y-4">
            {Object.entries(GROUPS).map(([group, label]) => {
              const items = insights.benchmark!.items.filter((item) => item.group === group);
              return items.length ? (
                <div key={group}>
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
                  <dl className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.key}
                        className="grid gap-1 rounded-lg bg-muted/40 px-3 py-2 text-sm sm:grid-cols-[9rem_1fr]"
                      >
                        <dt className="text-muted-foreground">{item.label}</dt>
                        <dd className="min-w-0 break-words">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null;
            })}
          </div>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">查看原文依据</summary>
            <ul className="mt-2 space-y-2">
              {insights.benchmark.items.flatMap((item) =>
                item.evidence.map((evidence) => (
                  <li key={`${item.key}-${evidence.line}`} className="break-words">
                    第 {evidence.line} 行：{evidence.text}
                  </li>
                )),
              )}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
