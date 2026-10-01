/** 常用 AI 服务商：选中后填入接口地址和模型，之后仍可修改 */
export type AiPreset = {
  id: string;
  name: string;
  /** 图标里显示的字 */
  mark: string;
  /** 一句话说明 */
  note: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  /** 本机或局域网服务，不需要 Key */
  local?: boolean;
};

export const AI_PRESETS: AiPreset[] = [
  {
    id: "mimo",
    name: "MiMo",
    mark: "Mi",
    note: "小米 · 也能合成语音",
    baseUrl: "https://api.xiaomimimo.com/v1",
    model: "mimo-v2.6-pro",
    fastModel: "mimo-v2.6-flash",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    mark: "DS",
    note: "深度求索 · 中文好、价格低",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    fastModel: "deepseek-chat",
  },
  {
    id: "qwen",
    name: "通义千问",
    mark: "通",
    note: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    fastModel: "qwen-flash",
  },
  {
    id: "kimi",
    name: "Kimi",
    mark: "K",
    note: "月之暗面 · 长文本",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5",
    fastModel: "moonshot-v1-8k",
  },
  {
    id: "zhipu",
    name: "智谱",
    mark: "智",
    note: "GLM 系列",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.7",
    fastModel: "glm-4-flash",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    mark: "硅",
    note: "开源模型聚合",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-235B-A22B",
    fastModel: "Qwen/Qwen3-8B",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    mark: "OR",
    note: "海外模型聚合",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1",
    fastModel: "openai/gpt-4.1-mini",
  },
  {
    id: "ollama",
    name: "Ollama",
    mark: "Ol",
    note: "本机运行 · 不需要 Key",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3:8b",
    fastModel: "qwen3:8b",
    local: true,
  },
];

const normalize = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

/** 当前接口地址对应的预设；自定义地址返回 undefined */
export function presetFor(baseUrl: string): AiPreset | undefined {
  const url = normalize(baseUrl);
  return AI_PRESETS.find((p) => normalize(p.baseUrl) === url);
}

/** 本机或局域网地址：可以不填 Key */
export function isLocalUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === "::1"
    );
  } catch {
    return false;
  }
}
