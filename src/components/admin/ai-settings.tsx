"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Row, Section } from "./settings-ui";

export const AI_PRESETS = [
  {
    name: "MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.6-pro",
    fastModel: "mimo-v2.6-flash",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    fastModel: "deepseek-chat",
  },
  {
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    fastModel: "qwen-flash",
  },
  {
    name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5",
    fastModel: "moonshot-v1-8k",
  },
  {
    name: "智谱",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.7",
    fastModel: "glm-4-flash",
  },
  {
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-235B-A22B",
    fastModel: "Qwen/Qwen3-8B",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1",
    fastModel: "openai/gpt-4.1-mini",
  },
  {
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3:8b",
    fastModel: "qwen3:8b",
  },
];
type Config = {
  protocol: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  fastModel: string;
  useProxy: boolean;
  timeoutMs: number;
};
type Usage = {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  unknownUsage: number;
};

export function AiSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [days, setDays] = useState<Usage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/admin/ai/config", { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "配置读取失败");
        setConfig(data.config);
        setHasKey(data.hasKey);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e.message);
      });
    fetch("/api/admin/ai/usage", { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => setDays(data.days ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  const patch = (value: Partial<Config>) => setConfig((cur) => (cur ? { ...cur, ...value } : cur));
  async function save(test = false) {
    if (!config) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, apiKey: key, clearKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setKey("");
      setHasKey(data.hasKey ?? (clearKey ? false : !!key || hasKey));
      setClearKey(false);
      if (test) {
        const result = await fetch("/api/admin/ai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = await result.json();
        if (!result.ok || body.ok === false) throw new Error(body.error || "连接失败");
        toast.success("AI 连接成功");
      } else toast.success("AI 设置已保存");
      const usage = await fetch("/api/admin/ai/usage");
      if (usage.ok) setDays((await usage.json()).days);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      id="ai"
      title="AI 写作助手"
      description="仅在后台主动使用时调用。正文建议先预览再应用，API Key 仅保存在服务器。"
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!config ? (
        <p role="status">正在读取 AI 配置…</p>
      ) : (
        <>
          <Row label="服务商预设" hint="选择后仍可修改接口和模型">
            <div className="flex flex-wrap gap-2">
              {AI_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    patch({
                      baseUrl: preset.baseUrl,
                      model: preset.model,
                      fastModel: preset.fastModel,
                      protocol: "openai",
                    })
                  }
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </Row>
          <Row label="接口协议">
            <Select
              value={config.protocol}
              onValueChange={(value) => patch({ protocol: value as Config["protocol"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI 兼容</SelectItem>
                <SelectItem value="anthropic">Anthropic 兼容</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="接口地址" hint="填写基础地址，可使用局域网地址接入 Ollama">
            <Input value={config.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
          </Row>
          <Row
            label="API Key"
            hint={hasKey ? "已配置。留空保存保留原密钥" : "尚未配置；本地 Ollama 可以留空"}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={hasKey ? "留空表示不修改" : "填写服务商密钥"}
            />
          </Row>
          {hasKey && (
            <Row label="清除已保存密钥">
              <Switch checked={clearKey} onCheckedChange={setClearKey} />
            </Row>
          )}
          <Row label="主模型">
            <Input value={config.model} onChange={(e) => patch({ model: e.target.value })} />
          </Row>
          <Row label="快速模型">
            <Input
              value={config.fastModel}
              onChange={(e) => patch({ fastModel: e.target.value })}
            />
          </Row>
          <Row label="使用出站代理" hint="使用链接卡片设置中的代理；代理失败不会改为直连">
            <Switch
              checked={config.useProxy}
              onCheckedChange={(value) => patch({ useProxy: value })}
            />
          </Row>
          <Row label="超时（秒）">
            <Input
              type="number"
              min="1"
              max="600"
              value={config.timeoutMs / 1000}
              onChange={(e) => patch({ timeoutMs: Number(e.target.value) * 1000 })}
            />
          </Row>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void save()}>
              保存 AI 设置
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => void save(true)}>
              {busy ? "处理中…" : "保存并测试连接"}
            </Button>
          </div>
          <div className="overflow-x-auto" role="region" aria-label="AI 每日用量" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <caption className="mb-3 text-left text-muted-foreground">
                最近 30 天用量（未返回 token 的请求单独标注）
              </caption>
              <thead>
                <tr>
                  {["日期", "调用", "输入 token", "输出 token", "未报告用量"].map((label) => (
                    <th key={label} className="px-2 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.day} className="border-t border-border">
                    <td className="px-2 py-2">{day.day}</td>
                    <td>{day.calls}</td>
                    <td>{day.inputTokens}</td>
                    <td>{day.outputTokens}</td>
                    <td>{day.unknownUsage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!days.length && (
              <p className="py-3 text-sm text-muted-foreground">还没有 AI 调用记录</p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
