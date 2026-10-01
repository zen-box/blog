import "server-only";

import dns from "node:dns";
import net from "node:net";

import { Agent, type Dispatcher, fetch, ProxyAgent } from "undici";

import { getSettings, type SiteSettings } from "@/lib/settings";

/**
 * 服务器主动访问外部网站（链接卡片、外部网站图标）的统一出口。
 * - 直连：解析域名后拒绝内网与保留地址，防止文章里的链接被用来探测内网
 * - 代理：所有请求经 HTTP(S) 代理发出，目标网站看到的是代理的 IP；代理失败不会回退直连
 */

export type OutboundConfig = SiteSettings["outbound"];

export class OutboundError extends Error {}

// 198.18.0.0/15 没有列入：它是基准测试保留段，Clash / Mihomo 的 fake-ip 模式会把所有域名解析到这里
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

/** 内网、本机、保留地址 */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], "ipv4");
  }
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** 只允许 http(s)，拒绝写成 IP 的内网地址和 localhost 一类的主机名 */
function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundError("网址格式不正确");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundError("只支持 http:// 和 https:// 网址");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    /\.(localhost|local|internal|lan|home\.arpa)$/.test(host) ||
    (net.isIP(host) && isPrivateAddress(host))
  ) {
    throw new OutboundError("不允许访问内网地址");
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/** 直连时的 DNS 解析：解析到内网地址就拒绝连接（在连接前校验，避免 DNS 重绑定） */
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || !list.length) {
      return callback(new OutboundError(`不允许访问内网地址（${bad?.address ?? hostname}）`), "");
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

/** 校验代理地址：http(s)://[用户名:密码@]主机[:端口]，不能带路径和参数 */
export function parseProxy(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new OutboundError("代理地址格式不正确，例如 http://proxy-host:8888");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundError("代理地址只支持 http:// 或 https://");
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new OutboundError("代理地址不能包含路径或查询参数");
  }
  return url;
}

/** 在页面上展示用的代理地址：去掉用户名密码 */
export function proxyEndpoint(raw: string): string {
  if (!raw) return "";
  try {
    const url = parseProxy(raw);
    const auth = url.username || url.password ? "（含认证）" : "";
    return `${url.protocol}//${url.host}${auth}`;
  } catch {
    return "";
  }
}

function createDispatcher(config: OutboundConfig): Dispatcher {
  if (config.mode === "proxy") {
    if (!config.proxy) throw new OutboundError("请先填写代理地址");
    return new ProxyAgent({ uri: parseProxy(config.proxy).href });
  }
  return new Agent({ connect: { lookup: safeLookup as never, timeout: 8000 } });
}

const holder = globalThis as typeof globalThis & {
  __blogOutbound?: { key: string; dispatcher: Dispatcher };
};

/** 按当前设置复用连接池；设置变化后换新的 */
function currentDispatcher(): Dispatcher {
  const { outbound } = getSettings();
  const key = outbound.mode === "proxy" ? `proxy ${outbound.proxy}` : "direct";
  const cached = holder.__blogOutbound;
  if (cached?.key === key) return cached.dispatcher;
  const dispatcher = createDispatcher(outbound);
  void cached?.dispatcher.close().catch(() => {});
  holder.__blogOutbound = { key, dispatcher };
  return dispatcher;
}

/** 目标网站看到的 User-Agent：带上常见预览爬虫的标识，很多网站只对它们输出完整的 Open Graph 信息 */
const USER_AGENT = "Mozilla/5.0 (compatible; LinkPreview/1.0; facebookexternalhit/1.1)";

export type OutboundResponse = {
  /** 跟随跳转后的最终地址 */
  url: string;
  status: number;
  headers: { get(name: string): string | null };
  body: Buffer;
};

/**
 * 抓取外部网址：手动跟随最多 5 次跳转（每一跳都重新校验），
 * 限制总时长和读取的字节数；stopAt 命中后提前结束（例如读到 </head> 就够了）
 */
export async function outboundFetch(
  target: string,
  opts: {
    accept: string;
    maxBytes: number;
    timeoutMs?: number;
    stopAt?: RegExp;
    dispatcher?: Dispatcher;
  },
): Promise<OutboundResponse> {
  const dispatcher = opts.dispatcher ?? currentDispatcher();
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 10000);
  let url = assertPublicUrl(target);

  for (let hop = 0; hop <= 5; hop++) {
    let res;
    try {
      res = await fetch(url, {
        dispatcher,
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: opts.accept,
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      });
    } catch (e) {
      throw new OutboundError(describeFetchError(e));
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      url = assertPublicUrl(new URL(location, url).href);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      // http 网址经代理转发时，认证失败会直接作为响应返回
      if (res.status === 407) throw new OutboundError(PROXY_AUTH);
      throw new OutboundError(`对方返回 ${res.status}`);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    // 只在新到的数据（加上一小段上一块的结尾）里找结束标记，避免反复拼接整个页面
    let tail = "";
    if (res.body) {
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          chunks.push(chunk);
          size += chunk.byteLength;
          if (size >= opts.maxBytes) break;
          if (opts.stopAt) {
            const text = tail + chunk.toString("latin1");
            if (opts.stopAt.test(text)) break;
            tail = text.slice(-32);
          }
        }
      } catch (e) {
        throw new OutboundError(describeFetchError(e));
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    return {
      url: url.href,
      status: res.status,
      headers: res.headers,
      body: Buffer.concat(chunks).subarray(0, opts.maxBytes),
    };
  }
  throw new OutboundError("跳转次数过多");
}

const PROXY_AUTH = "代理要求认证，或用户名密码不正确（407）";

/** undici 的错误层层包裹（fetch failed → Request was cancelled → 真正原因），沿着 cause 找出能看懂的原因 */
function describeFetchError(e: unknown): string {
  const chain: { name?: string; message?: string; code?: unknown }[] = [];
  for (let cur: unknown = e; cur && chain.length < 6; cur = (cur as { cause?: unknown }).cause) {
    if (cur instanceof OutboundError) return cur.message;
    chain.push(cur as (typeof chain)[number]);
  }
  if (chain[0]?.name === "TimeoutError") return "请求超时";
  const messages = chain.map((c) => c.message ?? "").join(" | ");
  const codes = chain.map((c) => String(c.code ?? "")).join(" ");
  // 代理建立隧道失败时，错误信息里带着代理返回的状态码
  const proxy = /Proxy response \((\d+)\)/.exec(messages);
  if (proxy) {
    if (proxy[1] === "407") return PROXY_AUTH;
    if (proxy[1] === "403") {
      return "代理拒绝了请求（403），检查 Tinyproxy 的 Allow 与 ConnectPort 配置";
    }
    return `代理返回 ${proxy[1]}`;
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(codes)) return "域名解析失败";
  if (/ECONNREFUSED/.test(codes)) return "连接被拒绝";
  if (/ECONNRESET|UND_ERR_SOCKET/.test(codes)) return "连接被重置";
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT/.test(codes)) return "连接超时";
  if (chain.some((c) => c.name === "AbortError" || c.name === "TimeoutError")) return "请求超时";
  const deepest = chain.findLast((c) => c.message)?.message;
  return deepest || "请求失败";
}

/**
 * 测试出口：通过 Cloudflare 的 trace 接口查看目标网站看到的 IP。
 * 使用表单里的配置（可能尚未保存），不影响正在使用的连接池
 */
export async function testOutbound(config: OutboundConfig) {
  const dispatcher = createDispatcher(config);
  const started = Date.now();
  try {
    const res = await outboundFetch("https://www.cloudflare.com/cdn-cgi/trace", {
      accept: "text/plain",
      maxBytes: 16 * 1024,
      timeoutMs: 12000,
      dispatcher,
    });
    const fields = Object.fromEntries(
      res.body
        .toString("utf8")
        .split("\n")
        .map((line) => line.split("=") as [string, string])
        .filter(([k, v]) => k && v),
    );
    if (!fields.ip) throw new OutboundError("没有拿到出口 IP");
    return { ip: fields.ip, location: fields.loc ?? "", ms: Date.now() - started };
  } finally {
    void dispatcher.close().catch(() => {});
  }
}

const aiHolder = globalThis as typeof globalThis & {
  __blogAiOutbound?: { key: string; dispatcher: Dispatcher };
};

/** 仅供已认证管理员的 AI POST：允许私网模型，禁止跳转，代理失败不回退。 */
export async function administratorAiPost(
  target: string,
  opts: {
    administratorHeaders: Headers;
    useProxy: boolean;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) {
  const { getAuth } = await import("@/lib/auth");
  if (!(await getAuth().api.getSession({ headers: opts.administratorHeaders }))) {
    throw new OutboundError("请先登录");
  }
  const url = new URL(target);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new OutboundError("AI 服务地址格式不正确");
  }
  const proxy = opts.useProxy ? getSettings().outbound.proxy : "";
  if (opts.useProxy && !proxy) throw new OutboundError("请先在出站设置中配置代理");
  const key = opts.useProxy ? `proxy ${proxy}` : "direct";
  let cached = aiHolder.__blogAiOutbound;
  if (cached?.key !== key) {
    const dispatcher = opts.useProxy
      ? new ProxyAgent({ uri: parseProxy(proxy).href })
      : new Agent({ connect: { timeout: 8000 } });
    void cached?.dispatcher.close().catch(() => {});
    cached = aiHolder.__blogAiOutbound = { key, dispatcher };
  }
  return fetch(url, {
    method: "POST",
    dispatcher: cached.dispatcher,
    redirect: "manual",
    signal: opts.signal,
    headers: opts.headers,
    body: opts.body,
  });
}
