import { restoreEscapes } from "./markdown/terminal/ansi";
import { bannerAt, reportRegionEnd } from "./markdown/terminal/report";

export type JobStatus = "pending" | "running" | "retry" | "succeeded" | "failed" | "cancelled";
export type BenchmarkGroup = "hardware" | "performance" | "ip" | "media" | "network";
export type BenchmarkItem = {
  key: string;
  label: string;
  value: string;
  group: BenchmarkGroup;
  evidence: { line: number; text: string }[];
};
export type BenchmarkInsight = { conclusion: string; items: BenchmarkItem[] };
export type BenchmarkExtraction = BenchmarkInsight & { matched: boolean; message: string };
export type ReaderInsights = {
  summary: { text: string; contentHash: string; updatedAt: number } | null;
  benchmark: (BenchmarkInsight & { contentHash: string; updatedAt: number }) | null;
};
export type ReaderAiConfig = {
  enabled: boolean;
  autoSummary: boolean;
  showSummary: boolean;
  showBenchmark: boolean;
};
export type ReaderJobView = {
  id: string;
  type: string;
  postId: number;
  contentHash: string;
  authorization: "admin" | "auto";
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  leaseUntil: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};
export type ReaderAiAdminState = ReaderInsights & {
  postId: number;
  contentHash: string;
  config: ReaderAiConfig;
  stale: { summary: boolean; benchmark: boolean };
  jobs: ReaderJobView[];
};

const cleanLine = (line: string) =>
  restoreEscapes(line)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .trim();
const signature =
  /NodeQuality|Check\.Place|HardwareQuality|IPQuality|NetQuality|硬件质量体检报告|IP质量体检报告|网络质量体检报告/i;
const reportTitle =
  /^(?:NodeQuality|Check\.Place|HardwareQuality|IPQuality|NetQuality)\b|^(?:硬件质量|IP质量|网络质量)体检报告/i;
function reportParagraphEnd(lines: string[], start: number) {
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !/^\s*(`{3,}|~{3,})/.test(lines[end])) end++;
  return end;
}

/** Only report regions qualify. Evidence line numbers are 1-based in the original Markdown. */
export function extractBenchmark(content: string): BenchmarkExtraction {
  const original = content.replace(/\r\n?/g, "\n").split("\n");
  const lines = original.map(cleanLine);
  const accepted = new Set<number>();
  let fence: { start: number; marker: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const match = /^(`{3,}|~{3,})/.exec(lines[i]);
    if (match) {
      if (!fence) fence = { start: i + 1, marker: match[1] };
      else if (match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length) {
        if (lines.slice(fence.start, i).some((line) => signature.test(line)))
          for (let j = fence.start; j < i; j++) accepted.add(j);
        fence = null;
      }
    } else if (!fence && bannerAt(lines, i)) {
      const end = reportRegionEnd(lines, i);
      for (let j = i; j < end; j++) accepted.add(j);
    } else if (!fence && reportTitle.test(lines[i])) {
      const end = reportParagraphEnd(lines, i);
      for (let j = i; j < end; j++) accepted.add(j);
    }
  }
  if (fence && lines.slice(fence.start).some((line) => signature.test(line)))
    for (let j = fence.start; j < lines.length; j++) accepted.add(j);

  const items: BenchmarkItem[] = [];
  let section: BenchmarkGroup | null = null;
  for (const i of [...accepted].sort((a, b) => a - b)) {
    const text = lines[i];
    if (/CPU测评|内存测评|硬盘测评|加权评分|Geekbench|sysbench/i.test(text))
      section = "performance";
    if (/IP类型属性|风险评分|风险因子|IP质量体检/.test(text)) section = "ip";
    if (/流媒体/.test(text)) section = "media";
    if (/网络质量体检|大包延迟|回程路由|国内测速/.test(text)) section = "network";
    if (/硬件质量体检/.test(text)) section = "hardware";
    if (
      !text ||
      signature.test(text) ||
      /^[#=*~_─━-]{5,}$/.test(text) ||
      /^[一二三四五六七八九十]+、/.test(text)
    )
      continue;
    let group: BenchmarkGroup | null = null;
    let label = "";
    const hardware =
      /^(CPU(?:\s*(?:Model|型号|模型))?|处理器|内存|Memory|硬盘|Disk|系统|OS|虚拟化|Virtualization|架构|Architecture|核心|Cores?)\s*[：:]\s*(.+)/i.exec(
        text,
      );
    if (hardware) {
      group = "hardware";
      label = hardware[1];
    } else if (
      /(?:Geekbench|sysbench|单核|多核|Single.?Core|Multi.?Core|IOPS|[0-9.]\s*(?:MB|GB)\/s)/i.test(
        text,
      ) &&
      /\d/.test(text)
    ) {
      group = "performance";
      label = "跑分 / 性能";
    } else if (
      /(?:Netflix|Disney\+?|YouTube|TikTok|Prime Video|HBO|Spotify|OpenAI|ChatGPT)/i.test(text) &&
      /[:：]|解锁|Yes|No|[✓✗✔✘]|可用|支持|失败|屏蔽|仅|原创/i.test(text)
    ) {
      group = "media";
      label = "流媒体 / 服务";
    } else if (
      /(?:电信|联通|移动|Telecom|Unicom|Mobile)/i.test(text) &&
      /\d|CN2|CMI|回程|直连|绕|NoData/i.test(text)
    ) {
      group = "network";
      label = "三网延迟 / 回程";
    } else if (
      section === "ip" &&
      /(?:风险|评分|原生|住宅|机房|广播|欺诈|代理|VPN|ASN|AS\d|Scamalytics|IP2Location|AbuseIPDB|DB-IP|IPinfo)/i.test(
        text,
      ) &&
      /[:：]|\d|是|否|低|高/.test(text)
    ) {
      group = "ip";
      label = "IP 质量";
    } else if (
      section === "performance" &&
      /\d/.test(text) &&
      /分数|得分|GB[56]|单线程|多线程|读|写/.test(text)
    ) {
      group = "performance";
      label = "跑分 / 性能";
    }
    if (!group || items.length >= 60 || text.length > 1000) continue;
    const evidence = [{ line: i + 1, text }];
    // Column-oriented Check.Place tables keep all source rows together.
    if (group === "media" && /^服务商\s*[：:]/.test(text)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 10) && accepted.has(j); j++) {
        if (!lines[j]) continue;
        if (!/^(状态|地区|方式)\s*[：:]/.test(lines[j])) break;
        evidence.push({ line: j + 1, text: lines[j] });
      }
      if (!evidence.some((row) => /^状态\s*[：:]/.test(row.text))) continue;
    }
    items.push({
      key: `${group}:${i + 1}`,
      label,
      value: hardware ? hardware[2].trim() : evidence.map((row) => row.text).join("；"),
      group,
      evidence,
    });
  }
  const matched = items.length > 0;
  const conclusion = matched
    ? `报告记录：${items
        .slice(0, 3)
        .map((item) => `${item.label} ${item.value}`)
        .join("；")}。`.slice(0, 500)
    : "";
  return {
    matched,
    items,
    conclusion,
    message: matched
      ? "已提取源报告指标，请选择条目并确认后公开"
      : "未找到可提取的 NodeQuality / Check.Place 测评指标",
  };
}

/** Remove non-prose including unclosed fences, terminal reports and custom embeds. */
export function summaryProse(content: string): string {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .replace(/<(pre|code|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .split("\n");
  const out: string[] = [];
  let marker = "";
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (fence) {
      if (!marker) marker = fence[1];
      else if (fence[1][0] === marker[0] && fence[1].length >= marker.length) marker = "";
      continue;
    }
    if (marker || /^(?: {4}|\t)/.test(lines[i])) continue;
    if (bannerAt(lines, i)) {
      i = reportRegionEnd(lines, i) - 1;
      continue;
    }
    if (reportTitle.test(cleanLine(lines[i]))) {
      i = reportParagraphEnd(lines, i) - 1;
      continue;
    }
    if (
      /NodeQuality|Check\.Place|CPU Model|三网回程|流媒体解锁|^\s*(?:\$ |# (?:curl|wget|bash)|::|\{%)/i.test(
        lines[i],
      )
    )
      continue;
    out.push(lines[i]);
  }
  return out
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/`+[^`\n]*`+/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, "")
    .trim()
    .slice(0, 24000);
}
