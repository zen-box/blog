"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { type DiffBlock, type TextDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";

/** 词级差异：绿色是新增，红色删除线是删掉的文字 */
export function DiffText({ parts }: { parts: TextDiff[] }) {
  return parts.map((part, i) =>
    part.kind === "add" ? (
      <ins key={i} className="diff-add">
        {part.text}
      </ins>
    ) : part.kind === "remove" ? (
      <del key={i} className="diff-del">
        {part.text}
      </del>
    ) : (
      <Fragment key={i}>{part.text}</Fragment>
    ),
  );
}

/** 增删字数，例如 +12 −5 */
export function Delta({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="font-mono text-[11px] whitespace-nowrap tabular-nums">
      <span className="text-(--diff-add)">+{added}</span>{" "}
      <span className="text-(--diff-del)">−{removed}</span>
    </span>
  );
}

type Row =
  | { type: "block"; block: DiffBlock; key: number; context?: boolean }
  | { type: "fold"; from: number; count: number };

/** 每段左侧一条竖线标出改动类型；连续没改的段落折叠，只保留改动前后各 context 段 */
function rowsFor(blocks: DiffBlock[], context: number): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].kind !== "same") {
      rows.push({ type: "block", block: blocks[i], key: i });
      i++;
      continue;
    }
    let j = i;
    while (j < blocks.length && blocks[j].kind === "same") j++;
    const lead = i === 0 ? 0 : context;
    const tail = j === blocks.length ? 0 : context;
    if (j - i <= lead + tail + 1) {
      for (let k = i; k < j; k++)
        rows.push({ type: "block", block: blocks[k], key: k, context: true });
    } else {
      for (let k = i; k < i + lead; k++)
        rows.push({ type: "block", block: blocks[k], key: k, context: true });
      rows.push({ type: "fold", from: i + lead, count: j - i - lead - tail });
      for (let k = j - tail; k < j; k++)
        rows.push({ type: "block", block: blocks[k], key: k, context: true });
    }
    i = j;
  }
  return rows;
}

function Block({ block, context }: { block: DiffBlock; context?: boolean }) {
  const bar =
    "relative pl-3.5 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full";
  if (block.kind === "same")
    return (
      <p
        className={cn(
          "pl-3.5 whitespace-pre-wrap text-muted-foreground",
          context && "line-clamp-4",
        )}
      >
        {block.text}
      </p>
    );
  if (block.kind === "change")
    return (
      <p className={cn(bar, "whitespace-pre-wrap before:bg-brand/45")}>
        <DiffText parts={block.parts} />
      </p>
    );
  return (
    <p
      className={cn(
        bar,
        "whitespace-pre-wrap",
        block.kind === "add"
          ? "text-(--diff-add) before:bg-(--diff-add)"
          : "text-(--diff-del) line-through decoration-(--diff-del)/50 before:bg-(--diff-del)",
      )}
    >
      {block.text}
    </p>
  );
}

export function TextDiffView({
  blocks,
  context = 1,
  className,
}: {
  blocks: DiffBlock[];
  context?: number;
  className?: string;
}) {
  const rows = useMemo(() => rowsFor(blocks, context), [blocks, context]);
  const [opened, setOpened] = useState<number[]>([]);
  return (
    <div className={cn("space-y-3 text-[13.5px] leading-[1.8] break-words", className)}>
      {rows.map((row) =>
        row.type === "block" ? (
          <Block key={row.key} block={row.block} context={row.context} />
        ) : opened.includes(row.from) ? (
          blocks
            .slice(row.from, row.from + row.count)
            .map((block, i) => <Block key={row.from + i} block={block} />)
        ) : (
          <button
            key={`fold-${row.from}`}
            type="button"
            onClick={() => setOpened((list) => [...list, row.from])}
            className="flex w-full items-center gap-3 py-0.5 text-xs text-subtle transition-colors hover:text-foreground"
          >
            <span aria-hidden className="h-px flex-1 border-t border-dashed border-border" />
            <ChevronsUpDownIcon className="size-3" />
            {row.count} 段未改动
            <span aria-hidden className="h-px flex-1 border-t border-dashed border-border" />
          </button>
        ),
      )}
    </div>
  );
}
