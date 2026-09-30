/**
 * 测评报告识别：NodeQuality 与 xykt 系列脚本（Check.Place）的纯文本输出。
 * 这些报告都以「分隔线 + 标题 + 分隔线」的横幅开头，据此切分和命名。
 */

export type ReportKind = "nodequality" | "hardware" | "ip" | "net" | "route" | "generic";

export type ReportSection = {
  kind: ReportKind;
  /** 标签页上的名字，和 NodeQuality 网页保持一致 */
  label: string;
  /** 单独显示时终端标题栏上的名字 */
  title: string;
  text: string;
};

const RULE = /^\s*([#+*=~_-])\1{19,}\s*$/;
const SIGNATURE = /体检报告|NodeQuality|Check\.Place|HardwareQuality|IPQuality|NetQuality/;
const FOOTER_RULE = /^\s*={20,}\s*$/;

export const isRule = (line: string) => RULE.test(line);

export type Banner = { start: number; end: number; kind: ReportKind; title: string };

/** 第 i 行开始的报告横幅：分隔线、若干行标题、同样字符的分隔线 */
export function bannerAt(lines: readonly string[], i: number): Banner | null {
  const open = RULE.exec(lines[i] ?? "");
  if (!open) return null;
  for (let j = i + 2; j < Math.min(lines.length, i + 10); j++) {
    const close = RULE.exec(lines[j]);
    if (!close) continue;
    if (close[1] !== open[1]) return null;
    const body = lines.slice(i + 1, j);
    if (!SIGNATURE.test(body.join("\n"))) return null;
    return { start: i, end: j + 1, ...classify(body) };
  }
  return null;
}

function classify(body: string[]): { kind: ReportKind; title: string } {
  const text = body.join("\n");
  if (/硬件质量体检报告|Hardware Quality/i.test(text))
    return { kind: "hardware", title: "硬件质量" };
  if (/IP质量体检报告|IP Quality/i.test(text)) return { kind: "ip", title: "IP质量" };
  if (/网络质量体检报告|Network Quality/i.test(text)) return { kind: "net", title: "网络质量" };
  if (/NodeQuality/.test(text)) return { kind: "nodequality", title: "NodeQuality" };
  const first = body.map((l) => l.trim()).find((l) => l && !/^(https?:|bash\b)/.test(l)) ?? "";
  const title = first.split(/[：:]/)[0].trim().slice(0, 16) || "测试报告";
  return { kind: "generic", title };
}

const LABELS: Record<ReportKind, string> = {
  nodequality: "📊NodeQuality",
  hardware: "💻基本信息",
  ip: "🎬IP质量",
  net: "🌐网络质量",
  route: "📍回程路由",
  generic: "",
};

/** 页脚：分隔线、「今日…检测量…」、可能隔一个空行的「报告链接：」 */
function footerEnd(lines: readonly string[], i: number): number {
  let j = i + 1;
  while (j < lines.length && /检测量|感谢使用/.test(lines[j])) j++;
  const k = lines[j] !== undefined && !lines[j].trim() ? j + 1 : j;
  if (/^\s*报告链接[：:]/.test(lines[k] ?? "")) j = k + 1;
  return j;
}

/**
 * 从 start 行的横幅开始，找到连续报告的结束位置（不含）。
 * 报告之间只隔空行时算同一段；正文遇到页脚、空行或下一个横幅结束。
 */
export function reportRegionEnd(lines: readonly string[], start: number): number {
  let end = start;
  let i = start;
  for (;;) {
    const banner = bannerAt(lines, i);
    if (!banner) return end;
    i = banner.end;
    while (i < lines.length && lines[i].trim() && !bannerAt(lines, i)) {
      if (FOOTER_RULE.test(lines[i]) && /检测量|感谢使用/.test(lines[i + 1] ?? "")) {
        i = footerEnd(lines, i);
        break;
      }
      i++;
    }
    end = i;
    let k = i;
    while (k < lines.length && !lines[k].trim()) k++;
    if (k >= lines.length || !bannerAt(lines, k)) return end;
    i = k;
  }
}

/** 文本里是否有可识别的报告横幅（只看前几十行，避免在长文本里做无用功） */
export function hasReportBanner(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").slice(0, 60);
  return lines.some((_, i) => bannerAt(lines, i) !== null);
}

const trimBlankLines = (lines: string[]) => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

/** 把一段报告文本按横幅切成若干份；NodeQuality 自己的横幅并入后一份 */
export function splitReport(text: string): ReportSection[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const banners: Banner[] = [];
  for (let i = 0; i < lines.length;) {
    const b = bannerAt(lines, i);
    if (b) {
      banners.push(b);
      i = b.end;
    } else i++;
  }
  if (!banners.length) {
    return [{ kind: "generic", label: "", title: "", text: trimBlankLines(lines).join("\n") }];
  }

  const sections: ReportSection[] = [];
  let carry: string[] = trimBlankLines(lines.slice(0, banners[0].start));
  banners.forEach((b, k) => {
    const body = lines.slice(b.start, banners[k + 1]?.start ?? lines.length);
    if (b.kind === "nodequality" && k + 1 < banners.length) {
      carry = [...carry, ...trimBlankLines(body), ""];
      return;
    }
    let kind = b.kind;
    // NetQuality 的 -R 模式只输出「三网回程路由」的逐跳详情
    if (
      kind === "net" &&
      !body.some((l) => /BGP信息/.test(l)) &&
      body.some((l) => /回程路由/.test(l))
    ) {
      kind = "route";
    }
    const title = kind === "route" ? "回程路由" : b.title;
    sections.push({
      kind,
      label: LABELS[kind] || title,
      title,
      text: trimBlankLines([...carry, ...body]).join("\n"),
    });
    carry = [];
  });
  return sections;
}
