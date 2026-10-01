"use client";

import {
  ChevronDownIcon,
  CpuIcon,
  GaugeIcon,
  GlobeIcon,
  type LucideIcon,
  NetworkIcon,
  SparklesIcon,
  TvMinimalPlayIcon,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { BenchmarkGroup, BenchmarkItem, ReaderInsights } from "@/lib/reader-ai";
import { cn } from "@/lib/utils";

import "./reader-insights.css";

const GROUPS: Record<BenchmarkGroup, { label: string; icon: LucideIcon }> = {
  hardware: { label: "硬件", icon: CpuIcon },
  performance: { label: "性能", icon: GaugeIcon },
  ip: { label: "IP 质量", icon: GlobeIcon },
  media: { label: "流媒体", icon: TvMinimalPlayIcon },
  network: { label: "网络", icon: NetworkIcon },
};
const ORDER: BenchmarkGroup[] = ["hardware", "performance", "network", "ip", "media"];
const FOLD = 6;

/** 进入视野后逐字显示摘要；开启「减少动态效果」时直接显示 */
function useTypewriter(text: string) {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || !text) return;
    let frame = 0;
    const reveal = () => {
      if (reduced) {
        setCount(text.length);
        return;
      }
      const start = performance.now();
      const duration = Math.min(1400, 400 + text.length * 6);
      const tick = (time: number) => {
        const n = Math.min(text.length, Math.ceil(((time - start) / duration) * text.length));
        setCount(n);
        if (n < text.length) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          reveal();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text, reduced]);
  return { root, count };
}

function Summary({ text }: { text: string }) {
  const { root, count } = useTypewriter(text);
  return (
    <section
      ref={root}
      aria-labelledby="ai-reader-summary"
      className="ai-summary-reveal relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-4 sm:px-6 sm:py-5"
      data-ai-summary
    >
      <span aria-hidden className="absolute inset-y-5 left-0 w-[3px] rounded-r-full bg-brand/70" />
      <h2 id="ai-reader-summary" className="flex items-center gap-2 text-xs text-muted-foreground">
        <SparklesIcon className="size-3.5 text-brand" />
        <span className="font-medium text-foreground">AI 摘要</span>
        <span className="text-subtle">由 AI 生成，作者已审阅</span>
      </h2>
      <p className="mt-2.5 text-[0.95rem] leading-[1.9] text-foreground/90">
        <span aria-hidden="true" data-summary-visible>
          {text.slice(0, count)}
        </span>
        <span aria-hidden="true" data-summary-remaining className="opacity-0">
          {text.slice(count)}
        </span>
        <span className="sr-only">{text}</span>
      </p>
    </section>
  );
}

function Tile({ item }: { item: BenchmarkItem }) {
  const Icon = GROUPS[item.group].icon;
  const evidence = item.evidence.map((e) => `第 ${e.line} 行：${e.text}`).join("\n");
  return (
    <div
      className="bg-card px-4 py-3 sm:px-5"
      title={evidence ? `原文依据\n${evidence}` : undefined}
    >
      <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 text-subtle" aria-hidden />
        {item.label}
      </dt>
      <dd className="mt-1 text-sm leading-snug break-words text-foreground">{item.value}</dd>
    </div>
  );
}

function Benchmark({ conclusion, items }: { conclusion: string; items: BenchmarkItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  const head = sorted.slice(0, FOLD);
  const rest = sorted.slice(FOLD);
  const evidence = sorted.flatMap((item) =>
    item.evidence.map((e) => ({ ...e, label: item.label })),
  );
  return (
    <section
      aria-labelledby="reader-benchmark"
      className="overflow-hidden rounded-2xl border border-border bg-card"
      data-benchmark-summary
    >
      <div className="px-5 pt-4 sm:px-6 sm:pt-5">
        <h2 id="reader-benchmark" className="flex items-center gap-2 text-xs text-muted-foreground">
          <GaugeIcon className="size-3.5 text-brand" />
          <span className="font-medium text-foreground">测评速览</span>
          <span className="text-subtle">数据取自文中的测试报告</span>
        </h2>
        {conclusion && (
          <p className="mt-2.5 text-[0.95rem] leading-[1.85] text-foreground/90">{conclusion}</p>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 sm:grid-cols-3">
        {head.map((item) => (
          <Tile key={item.key} item={item} />
        ))}
        {expanded && rest.map((item) => <Tile key={item.key} item={item} />)}
        {/* 补齐最后一行，免得露出底色 */}
        {Array.from({
          length: (3 - ((expanded ? sorted.length : head.length) % 3)) % 3,
        }).map((_, i) => (
          <div key={`pad-${i}`} aria-hidden className="hidden bg-card sm:block" />
        ))}
        {(expanded ? sorted.length : head.length) % 2 === 1 && (
          <div aria-hidden className="bg-card sm:hidden" />
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 px-5 py-2.5 text-xs text-muted-foreground sm:px-6">
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-brand hover:opacity-80"
          >
            {expanded ? "收起" : `展开全部 ${sorted.length} 项`}
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform duration-300", expanded && "rotate-180")}
            />
          </button>
        )}
        {evidence.length > 0 && (
          <details className="group w-full sm:w-auto">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-foreground">
              原文依据 {evidence.length} 处
              <ChevronDownIcon className="size-3.5 transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <ul className="mt-2 mb-1 space-y-1 font-mono text-[11px] leading-relaxed">
              {evidence.map((e, i) => (
                <li key={`${e.line}-${i}`} className="break-words">
                  <span className="text-subtle">L{e.line}</span> {e.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

export function ReaderInsightsCard({ insights }: { insights: ReaderInsights }) {
  if (!insights.summary && !insights.benchmark) return null;
  return (
    <div className="mb-10 space-y-4" data-reader-insights>
      {insights.summary && <Summary text={insights.summary.text} />}
      {insights.benchmark && (
        <Benchmark conclusion={insights.benchmark.conclusion} items={insights.benchmark.items} />
      )}
    </div>
  );
}
