import { type TextDiff, wordDiff } from "./ai-text";

export type { TextDiff };

const sameLength = (parts: TextDiff[]) =>
  parts.reduce((n, part) => n + (part.kind === "same" ? part.text.length : 0), 0);

/** 相同部分占较长一方的比例，0–1 */
export function similarity(before: string, after: string, parts = wordDiff(before, after)) {
  const longest = Math.max(before.length, after.length);
  return longest ? sameLength(parts) / longest : 1;
}

/**
 * 给人看的词级差异：夹在两处修改之间的一两个字并入修改，
 * 同一处修改先删后增；改动过大时整段替换，免得删增交错难以阅读。
 */
export function readableDiff(before: string, after: string): TextDiff[] {
  const parts = wordDiff(before, after);
  const out: TextDiff[] = [];
  let removed = "",
    added = "";
  const flush = () => {
    if (removed) out.push({ kind: "remove", text: removed });
    if (added) out.push({ kind: "add", text: added });
    removed = added = "";
  };
  parts.forEach((part, i) => {
    if (part.kind === "remove") removed += part.text;
    else if (part.kind === "add") added += part.text;
    else if (
      (removed || added) &&
      i < parts.length - 1 &&
      part.text.trim().length <= 2 &&
      !part.text.includes("\n")
    ) {
      removed += part.text;
      added += part.text;
    } else {
      flush();
      out.push(part);
    }
  });
  flush();
  if (similarity(before, after, out) < 0.3)
    return [
      { kind: "remove" as const, text: before },
      { kind: "add" as const, text: after },
    ].filter((part) => part.text);
  return out;
}

export function diffStats(parts: TextDiff[]) {
  let added = 0,
    removed = 0;
  for (const part of parts) {
    const size = part.text.replace(/\s/g, "").length;
    if (part.kind === "add") added += size;
    if (part.kind === "remove") removed += size;
  }
  return { added, removed };
}

export type DiffBlock =
  | { kind: "same"; text: string }
  | { kind: "add" | "remove"; text: string }
  | { kind: "change"; before: string; after: string; parts: TextDiff[] };

const paragraphs = (text: string) => (text ? text.split(/\n[ \t]*\n+/) : []);

/** 段落对齐（LCS）后，再对改动的段落做词级比较 */
function alignParagraphs(a: string[], b: string[]) {
  const ops: { kind: "same" | "add" | "remove"; text: string }[] = [];
  if (a.length * b.length > 250_000) {
    for (const text of a) ops.push({ kind: "remove", text });
    for (const text of b) ops.push({ kind: "add", text });
    return ops;
  }
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      rows[i][j] =
        a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i++] });
      j++;
    } else if (j < b.length && (i === a.length || rows[i][j + 1] >= rows[i + 1][j]))
      ops.push({ kind: "add", text: b[j++] });
    else ops.push({ kind: "remove", text: a[i++] });
  }
  return ops;
}

/** 一处连续改动里，按顺序把相近的旧段落和新段落配成一对 */
function pairHunk(removed: string[], added: string[]): DiffBlock[] {
  const out: DiffBlock[] = [];
  let i = 0,
    j = 0;
  const close = (x: string, y: string) => similarity(x, y) >= 0.3;
  while (i < removed.length || j < added.length) {
    if (i < removed.length && j < added.length) {
      if (removed.length === added.length || close(removed[i], added[j])) {
        out.push({
          kind: "change",
          before: removed[i],
          after: added[j],
          parts: readableDiff(removed[i++], added[j++]),
        });
      } else if (j + 1 < added.length && close(removed[i], added[j + 1]))
        out.push({ kind: "add", text: added[j++] });
      else out.push({ kind: "remove", text: removed[i++] });
    } else if (i < removed.length) out.push({ kind: "remove", text: removed[i++] });
    else out.push({ kind: "add", text: added[j++] });
  }
  return out;
}

/** 按段落比较两份 Markdown：没改的段落原样保留，方便界面折叠 */
export function paragraphDiff(before: string, after: string): DiffBlock[] {
  const a = paragraphs(before),
    b = paragraphs(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const blocks: DiffBlock[] = a.slice(0, start).map((text) => ({ kind: "same", text }));
  let removed: string[] = [],
    added: string[] = [];
  const flush = () => {
    blocks.push(...pairHunk(removed, added));
    removed = [];
    added = [];
  };
  for (const op of alignParagraphs(a.slice(start, endA), b.slice(start, endB))) {
    if (op.kind === "remove") removed.push(op.text);
    else if (op.kind === "add") added.push(op.text);
    else {
      flush();
      blocks.push({ kind: "same", text: op.text });
    }
  }
  flush();
  for (const text of a.slice(endA)) blocks.push({ kind: "same", text });
  return blocks;
}

export function blockStats(blocks: DiffBlock[]) {
  let added = 0,
    removed = 0,
    changed = 0;
  for (const block of blocks) {
    if (block.kind === "same") continue;
    changed++;
    if (block.kind === "change") {
      const stats = diffStats(block.parts);
      added += stats.added;
      removed += stats.removed;
    } else if (block.kind === "add") added += block.text.replace(/\s/g, "").length;
    else removed += block.text.replace(/\s/g, "").length;
  }
  return { added, removed, changed };
}
