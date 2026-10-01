/** 文章朗读与 AI 播客：前后台共用的类型和纯函数 */

export type AudioKind = "narration" | "podcast";
export type SpeechKind = "title" | "heading" | "text" | "note";

/** 渲染时从正文抽出的可朗读块；say 与文章 HTML 里的 data-say 一一对应 */
export type SpeechBlock = { say: number; kind: Exclude<SpeechKind, "title">; text: string };

/** 播客稿的一句台词；speaker 是主播序号 */
export type PodcastLine = { speaker: number; text: string };

/** 一次语音合成请求 */
export type AudioSegment = {
  text: string;
  /** 用哪个声音：朗读只有 0；播客按主播序号 */
  voice: number;
  kind: SpeechKind;
  say?: number;
  /** 播客台词序号 */
  line?: number;
  /** 长段落拆开后的后续部分（与前一段之间停顿更短） */
  cont?: boolean;
};

/** 成品里每一段的起止时间（秒） */
export type TimelineEntry = {
  start: number;
  end: number;
  kind: SpeechKind;
  text: string;
  say?: number;
  line?: number;
  voice?: number;
};

/** 前台拿到的音频 */
export type PublicPostAudio = {
  kind: AudioKind;
  url: string;
  duration: number;
  timeline: TimelineEntry[];
  /** 播客主播的名字 */
  hosts: string[];
  updatedAt: number;
};

/** 单次合成的长度上限（字）；长段落按句子拆开 */
export const SEGMENT_LIMIT = 240;

/** 按句末标点拆句，再拼成不超过 max 字的几段 */
export function splitSentences(text: string, max = SEGMENT_LIMIT): string[] {
  const sentences = text.match(/[^。！？!?；;…\n]+[。！？!?；;…]*[”」』）)]*|\n+/g) ?? [text];
  const out: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (current && current.length + sentence.length > max) {
      out.push(current);
      current = "";
    }
    // 单句就超长（很少见）：硬切，尽量在逗号处断开
    let rest = sentence;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf("，", max), rest.lastIndexOf(",", max));
      const at = cut > max / 2 ? cut + 1 : max;
      out.push(rest.slice(0, at));
      rest = rest.slice(at);
    }
    current += rest;
  }
  if (current) out.push(current);
  return out;
}

/** 朗读稿：标题 + 正文各块；连续的同类提示只念一次 */
export function narrationSegments(title: string, blocks: SpeechBlock[]): AudioSegment[] {
  const out: AudioSegment[] = [];
  if (title.trim()) out.push({ text: title.trim(), voice: 0, kind: "title" });
  for (const block of blocks) {
    const last = out.at(-1);
    if (block.kind === "note" && last?.kind === "note" && last.text === block.text) continue;
    splitSentences(block.text).forEach((text, i) =>
      out.push({ text, voice: 0, kind: block.kind, say: block.say, cont: i > 0 || undefined }),
    );
  }
  return out;
}

export function podcastSegments(lines: PodcastLine[]): AudioSegment[] {
  return lines.flatMap((line, index) =>
    splitSentences(line.text).map((text, i) => ({
      text,
      voice: line.speaker,
      kind: "text" as const,
      line: index,
      cont: i > 0 || undefined,
    })),
  );
}

/** 「名字：台词」一行一句；也认「A：」「B：」 */
export function parsePodcastScript(source: string, hosts: string[]): PodcastLine[] {
  const lines: PodcastLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([^：:\s]{1,12})\s*[：:]\s*(.+)$/.exec(line);
    const name = match?.[1];
    let speaker = name ? hosts.findIndex((host) => host === name) : -1;
    if (speaker < 0 && name && /^[A-Za-z]$/.test(name))
      speaker = name.toUpperCase() === "A" ? 0 : 1;
    if (match && speaker >= 0) lines.push({ speaker, text: match[2].trim() });
    // 没有说话人的行接到上一句后面
    else if (lines.length) lines.at(-1)!.text += line;
  }
  return lines.filter((line) => line.text);
}

export function formatPodcastScript(lines: PodcastLine[], hosts: string[]): string {
  return lines.map((line) => `${hosts[line.speaker] ?? "A"}：${line.text}`).join("\n");
}

const lrcTime = (seconds: number) => {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${(total - minutes * 60).toFixed(2).padStart(5, "0")}`;
};

/** 时间轴转成 LRC，交给全局播放器的歌词面板显示文字稿 */
export function timelineLrc(timeline: TimelineEntry[], hosts: string[] = []): string {
  const rows: { start: number; text: string; line?: number }[] = [];
  for (const entry of timeline) {
    const text = entry.text.replace(/\s+/g, " ");
    const last = rows.at(-1);
    // 同一句台词拆开的几段合成一行
    if (last && entry.line !== undefined && entry.line === last.line) {
      last.text += text;
      continue;
    }
    const speaker =
      entry.voice !== undefined && hosts.length > 1 && hosts[entry.voice]
        ? `${hosts[entry.voice]}：`
        : "";
    rows.push({ start: entry.start, text: speaker + text, line: entry.line });
  }
  return rows.map((row) => `[${lrcTime(row.start)}]${row.text}`).join("\n");
}

/** 「N 分钟」，不足一分钟按一分钟算 */
export const audioMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
