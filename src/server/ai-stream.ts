import "server-only";

/** SSE 的 UTF-8 解码、行及事件缓冲互相独立；支持 CR/LF/CRLF 与多行 data。 */
export async function* readSse(body: {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(): Promise<void>;
    releaseLock(): void;
  };
}): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let line = "";
  let data: string[] = [];
  let eventSize = 0;
  let wasCR = false;
  function consumeLine(): string | undefined {
    const current = line;
    line = "";
    if (!current) {
      const event = data.length ? data.join("\n") : undefined;
      data = [];
      eventSize = 0;
      return event;
    }
    if (current.startsWith("data:")) {
      const value = current.slice(5).replace(/^ /, "");
      eventSize += value.length;
      if (eventSize > 1024 * 1024) throw new Error("SSE event too large");
      data.push(value);
    }
  }
  try {
    for (;;) {
      const chunk = await reader.read();
      const text = chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      for (const char of text) {
        if (char === "\n" && wasCR) {
          wasCR = false;
          continue;
        }
        wasCR = char === "\r";
        if (char === "\n" || char === "\r") {
          const event = consumeLine();
          if (event !== undefined) yield event;
        } else {
          line += char;
          if (line.length > 1024 * 1024) throw new Error("SSE line too large");
        }
      }
      if (chunk.done) break;
    }
    if (line) consumeLine();
    if (data.length) yield data.join("\n");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** 思考标签可以跨任意文本帧；未闭合的思考块也不会泄出。 */
export class ThinkFilter {
  private pending = "";
  private depth = 0;
  push(text: string, final = false): string {
    this.pending += text;
    let output = "";
    for (;;) {
      const match = /<\/?think>/i.exec(this.pending);
      if (match) {
        if (this.depth === 0) output += this.pending.slice(0, match.index);
        if (match[0][1] === "/") this.depth = Math.max(0, this.depth - 1);
        else this.depth++;
        this.pending = this.pending.slice(match.index + match[0].length);
        continue;
      }
      let keep = 0;
      if (!final) {
        const lower = this.pending.toLowerCase();
        for (const token of ["<think>", "</think>"]) {
          for (let size = 1; size < token.length; size++) {
            if (lower.endsWith(token.slice(0, size))) keep = Math.max(keep, size);
          }
        }
      }
      if (this.depth === 0) output += this.pending.slice(0, this.pending.length - keep);
      this.pending = keep ? this.pending.slice(-keep) : "";
      return output;
    }
  }
}

/** 保留可能是密钥前缀的尾部，以覆盖密钥跨 delta 的情况。 */
export class SecretFilter {
  private pending = "";
  constructor(private readonly secret: string) {}
  push(text: string, final = false): string {
    this.pending += text;
    if (!this.secret) {
      const result = this.pending;
      this.pending = "";
      return result;
    }
    this.pending = this.pending.split(this.secret).join("[密钥已隐藏]");
    let keep = 0;
    if (!final) {
      for (let size = 1; size < this.secret.length && size <= this.pending.length; size++) {
        if (this.pending.endsWith(this.secret.slice(0, size))) keep = size;
      }
    }
    const output = this.pending.slice(0, this.pending.length - keep);
    this.pending = keep ? this.pending.slice(-keep) : "";
    return output;
  }
}
