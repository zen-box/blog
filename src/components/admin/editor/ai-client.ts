export type AiTask = "rewrite" | "format" | "proofread" | "polish" | "metadata" | "podcast";
export async function streamAi(
  input: { task: AiTask; title: string; content: string; instruction?: string; context?: string },
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> {
  const response = await fetch("/api/admin/ai/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "AI 请求失败");
  }
  if (!response.body) throw new Error("AI 没有返回内容");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    result = "",
    done = false;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error || "AI 生成失败");
    if (event.type === "delta") {
      result += String(event.text ?? "");
      onText(result);
    }
    if (event.type === "done") done = true;
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!done || !result.trim()) throw new Error("AI 返回不完整或为空，请重新生成");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
