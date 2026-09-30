/**
 * xykt 系列脚本（硬件 / IP / 网络质量体检）的纯文本着色。
 * 复制文本时颜色会丢失，这里按脚本源码里的配色规则重新上色：
 * 标签青色、数值绿色、状态徽章、评分刻度条、延迟点阵等，尽量和终端里看到的一致。
 * 参考：github.com/xykt/HardwareQuality、IPQuality、NetQuality
 */
import { type Color, execD, paintCols, type Row, RowText, span, type Style } from "./cells";
import { bannerAt, type Banner } from "./report";

const BLACK = 0;
const RED = 1;
const GREEN = 2;
const YELLOW = 3;
const BLUE = 4;
const MAGENTA = 5;
const CYAN = 6;
const WHITE = 7;

const LABEL: Style = { fg: CYAN };
const VALUE: Style = { fg: GREEN };
const badge = (bg: Color, bold = true): Style => ({ bg, fg: WHITE, bold });

const RULE = /^\s*([#+*=~_-])\1{19,}\s*$/;
const HEADING = /^[一二三四五六七八九十]+、/;
const URL = /https?:\/\/[^\s，。；（）]+/;

type Section =
  | ""
  | "cpu"
  | "gpu"
  | "mem"
  | "disk"
  | "mark"
  | "type"
  | "score"
  | "factor"
  | "media"
  | "mail"
  | "bgp"
  | "local"
  | "conn"
  | "delay"
  | "route"
  | "speed"
  | "iperf";

const SECTIONS: [RegExp, Section][] = [
  [/CPU测评/, "cpu"],
  [/显卡测评/, "gpu"],
  [/内存测评/, "mem"],
  [/硬盘测评/, "disk"],
  [/加权评分/, "mark"],
  [/IP类型属性/, "type"],
  [/风险评分/, "score"],
  [/风险因子/, "factor"],
  [/流媒体/, "media"],
  [/邮局/, "mail"],
  [/BGP信息/, "bgp"],
  [/本地策略/, "local"],
  [/接入信息/, "conn"],
  [/大包延迟/, "delay"],
  [/回程路由/, "route"],
  [/国内测速/, "speed"],
  [/国际互连/, "iperf"],
];

class State {
  section: Section = "";
  /** GB5 基准刻度的起始列 */
  scale?: number;
  /** 风险等级刻度的起始列 */
  risk?: number;
  fio = false;
  /** 接入信息：AS 号那一行，等下一行的运营商名字出现后再一起配色 */
  asns?: { line: RowText; items: AsItem[] };
}

type AsItem = { col: number; len: number; asn: number };

/* ------------------------------------------------------------------ */
/* 工具                                                                  */
/* ------------------------------------------------------------------ */

const firstNonSpace = (t: string, from: number) => {
  const m = /\S/.exec(t.slice(from));
  return m ? from + m.index : t.length;
};

/** 行首的「标签：」，返回标签名和结束下标 */
function labelOf(t: string): { name: string; end: number } | null {
  const m = /^([^\s：]{1,20})：/.exec(t);
  return m ? { name: m[1], end: m[0].length } : null;
}

/** 通用规则：标签青色，数值绿色；一行里可以有多组 */
function labelValue(l: RowText, value: Style = VALUE): boolean {
  const t = l.text;
  const labels = [...l.matches(/(?<=^|\s)[^\s：|]{1,24}：/)];
  if (!labels.length) return false;
  labels.forEach((m, k) => {
    const end = m.index + m[0].length;
    l.paint(m.index, end, LABEL);
    const next = labels[k + 1]?.index ?? t.length;
    const a = firstNonSpace(t, end);
    const b = end + t.slice(end, next).trimEnd().length;
    if (b > a) l.paint(a, b, value);
  });
  l.paintMatches(URL, { underline: true });
  return true;
}

/** 给正则匹配的第 k 组叠加样式 */
function paintGroup(l: RowText, m: RegExpExecArray, k: number, style: Style) {
  const s = span(m, k);
  if (s) l.paint(s[0], s[1], style);
}

/** 把文字连同左右各一个空格涂成徽章（脚本里徽章两侧带空格） */
function paintBadge(l: RowText, start: number, end: number, style: Style) {
  const t = l.text;
  const a = t[start - 1] === " " ? start - 1 : start;
  const b = t[end] === " " ? end + 1 : end;
  l.paint(a, b, style);
}

const colorBy = (v: number, [red, yellow]: [number, number], lowIsBad = true): number =>
  lowIsBad
    ? v < red
      ? RED
      : v < yellow
        ? YELLOW
        : GREEN
    : v > yellow
      ? RED
      : v > red
        ? YELLOW
        : GREEN;

/* ------------------------------------------------------------------ */
/* 横幅、页脚、章节标题                                                     */
/* ------------------------------------------------------------------ */

function styleBanner(lines: RowText[], banner: Banner) {
  if (banner.kind === "nodequality") {
    for (const l of lines) l.paint(0, l.text.length, { fg: CYAN });
    return;
  }
  for (const l of lines.slice(1, -1)) {
    const t = l.text;
    const title = execD(/^\s*(\S.*?：)(.*?)\s*$/, t);
    if (title && /体检报告/.test(title[1])) {
      paintGroup(l, title, 1, { bold: true });
      paintGroup(l, title, 2, { bold: true, fg: CYAN });
    } else if (/^\s*https?:\/\//.test(t)) {
      l.paintMatches(URL, { underline: true });
    }
  }
}

function styleHeading(l: RowText, st: State) {
  const t = l.text;
  const paren = execD(/（([^）]*)）/, t);
  if (paren) {
    const [a, b] = span(paren, 1)!;
    l.paint(a, b, { italic: true });
    if (st.section === "conn") {
      // 图例：绿底 * = Tier1、黄底 * = 非 Tier1、下划线 * = 上游
      const stars = [...t.slice(a, b).matchAll(/\*/g)].map((m) => a + m.index);
      const styles: Style[] = [badge(GREEN), badge(YELLOW), { underline: true }];
      stars.slice(0, 3).forEach((s, k) => l.paint(s, s + 1, styles[k]));
    }
  }
  if (st.section === "speed" || st.section === "iperf") {
    const title = /^\S+/.exec(t)![0].length;
    l.paint(title, t.length, { italic: true });
    l.paintMatches(/发送|接收|Mbps/, { underline: true });
  }
  // 「四、三网TCP大包延迟」标题后面紧跟着第一格数据
  if (st.section === "delay") delayCells(l);
}

/* ------------------------------------------------------------------ */
/* 硬件质量                                                               */
/* ------------------------------------------------------------------ */

const SUMMARY: Style = { bold: true, bg: WHITE, fg: BLACK };
const FIO_LIMITS: [number, number][] = [
  [5, 50],
  [20, 500],
  [100, 1000],
  [150, 2000],
];

/** Fio 条形宽度：1–10000 MB/s 按对数映射到 1–16 格 */
function fioWidth(mb: number) {
  if (mb <= 1) return 1;
  if (mb >= 10000) return 16;
  return Math.min(16, Math.max(1, Math.round((Math.log(mb) / Math.log(10000)) * 16)));
}

function scaleColor(offset: number, width: number, colors: Color[]) {
  return colors[Math.min(colors.length - 1, Math.max(0, Math.floor(offset / width)))];
}

function hardware(l: RowText, st: State): boolean {
  const t = l.text;
  // 硬盘、内存条、显卡的明细行：从第 10 列开始是浅色底
  if (/^ {10}\s*[╠╚║]/.test(t)) {
    paintCols(l.row, 10, l.row.length, SUMMARY);
    return true;
  }
  const label = labelOf(t);
  if (!label) return false;
  const { name, end } = label;
  const paintLabel = () => l.paint(0, end, LABEL);

  if (/^(CPU|显卡|内存|硬盘)$/.test(name)) {
    paintLabel();
    const a = firstNonSpace(t, end);
    if (a < t.length) paintCols(l.row, l.colAt(a), l.row.length, { ...SUMMARY, underline: true });
    return true;
  }
  if (/^(指令集|特性|超开指标)$/.test(name)) {
    paintLabel();
    // 超开指标里「✔」表示检测到超开，反而是坏事
    const invert = name === "超开指标";
    for (const m of l.matches(/ ?([✔✘]) (\S+(?: \S+)*)(?: |$)/)) {
      const good = (m[1] === "✔") !== invert;
      l.paint(m.index, m.index + m[0].length, { bg: good ? GREEN : RED });
    }
    return true;
  }
  if (/^GB\d基准$/.test(name)) {
    paintLabel();
    const start = l.colAt(firstNonSpace(t, end));
    st.scale = start;
    [RED, YELLOW, GREEN].forEach((bg, k) =>
      paintCols(l.row, start + 20 * k, start + 20 * (k + 1), { bg, italic: true }),
    );
    paintCols(l.row, start + 60, l.row.length, VALUE);
    return true;
  }
  if (/^GB\d(单核|多核|成绩)$/.test(name)) {
    paintLabel();
    const pipe = t.indexOf("|", end);
    if (pipe < 0) return labelValue(l);
    const start = st.scale ?? l.colAt(end) + 1;
    const p = l.colAt(pipe);
    const colors = [RED, YELLOW, GREEN];
    for (let c = start; c < p; c++)
      paintCols(l.row, c, c + 1, { bg: scaleColor(c - start, 20, colors) });
    paintCols(l.row, p, p + 1, { bg: scaleColor(p - start, 20, colors), fg: WHITE, bold: true });
    const pos = p - start + 1;
    const score = /^\S+/.exec(t.slice(pipe + 1));
    if (score) {
      const fg = pos <= 20 ? RED : pos <= 40 ? YELLOW : GREEN;
      l.paint(pipe + 1, pipe + 1 + score[0].length, { bold: true, fg });
    }
    return true;
  }
  if (name === "Sysbench" && /读取|写入|延迟/.test(t)) {
    paintLabel();
    for (const m of l.matches(/(读取|写入) ([\d.]+) MB\/s/)) {
      l.paint(m.index, m.index + m[0].length, { fg: colorBy(Number(m[2]), [15000, 30000]) });
    }
    for (const m of l.matches(/延迟 ([\d.]+) ns/)) {
      l.paint(m.index, m.index + m[0].length, { fg: colorBy(Number(m[1]), [100, 200], false) });
    }
    return true;
  }
  if (/^(Fio测试|Crystal|ATTO)$/.test(name)) {
    l.paint(0, t.length, LABEL);
    st.fio = name !== "ATTO";
    return true;
  }
  if (st.fio && /^(读取|写入)$/.test(name)) {
    paintLabel();
    fioRow(l, end);
    return true;
  }
  if (name === "项目") {
    l.paint(0, t.length, LABEL);
    return true;
  }
  if (name === "分数") {
    paintLabel();
    // 每个分数是居中在 9 格宽的青色方块里
    for (const m of l.matches(/\d+|N\/A/)) {
      if (m.index < end) continue;
      const col = l.colAt(m.index) - Math.floor((9 - m[0].length) / 2);
      paintCols(l.row, col, col + Math.max(9, m[0].length), badge(CYAN));
    }
    l.paintMatches(/[=+]/, { bold: true, fg: CYAN });
    return true;
  }
  if (name === "排名") {
    paintLabel();
    l.paint(end, t.length, { bold: true, fg: GREEN });
    return true;
  }
  if (name === "温度") {
    labelValue(l);
    l.paintMatches(/(\d+)℃/, (m) => ({ fg: colorBy(Number(m[1]), [60, 80], false) }));
    return true;
  }
  if (name === "邻居数量") {
    paintLabel();
    const n = /(\d+)/.exec(t.slice(end));
    if (n) l.paint(end, t.length, { fg: colorBy(Number(n[1]), [200, 500], false) });
    return true;
  }
  return false;
}

/** Fio 行：四格用「||」分隔，每格前段是按速度对数长度的色块 */
function fioRow(l: RowText, labelEnd: number) {
  const t = l.text;
  const seps = [...t.matchAll(/\|\|/g)].map((m) => m.index);
  seps.forEach((s) => l.paint(s, s + 2, LABEL));
  const starts = [seps.length ? Math.max(labelEnd, seps[0] - 16) : firstNonSpace(t, labelEnd)];
  seps.forEach((s) => starts.push(s + 2));
  starts.slice(0, 4).forEach((a, k) => {
    const b = seps[k] ?? t.length;
    const m = /([\d.]+)(KB|MB|GB)\/s/.exec(t.slice(a, b));
    if (!m) return;
    const mb = Number(m[1]) * (m[2] === "KB" ? 1 / 1024 : m[2] === "GB" ? 1024 : 1);
    const color = colorBy(mb, FIO_LIMITS[k]);
    const c0 = l.colAt(a);
    const width = fioWidth(mb);
    paintCols(l.row, c0, c0 + width, { bg: color });
    paintCols(l.row, c0 + width, l.colAt(b), { fg: color });
  });
}

/* ------------------------------------------------------------------ */
/* IP 质量                                                                */
/* ------------------------------------------------------------------ */

const IP_TYPES: Record<string, Color> = {
  家宽: GREEN,
  手机: GREEN,
  机房: RED,
  CDN: RED,
  蜘蛛: RED,
};
const MEDIA: Record<string, Color> = {
  解锁: GREEN,
  原生: GREEN,
  屏蔽: RED,
  失败: RED,
  中国: RED,
  禁会员: RED,
};
const RISK: [RegExp, Color][] = [
  [/极低风险|低风险/, GREEN],
  [/极高风险|高风险|存在风险|建议封禁/, RED],
  [/中风险|较高风险|可疑IP/, YELLOW],
];

function ip(l: RowText, st: State): boolean {
  const t = l.text;
  const label = labelOf(t);
  const name = label?.name ?? "";
  const end = label?.end ?? 0;
  const paintLabel = () => l.paint(0, end, LABEL);

  if (name === "IP类型") {
    paintLabel();
    for (const m of l.matches(/(原生|广播)IP/)) {
      paintBadge(l, m.index, m.index + m[0].length, badge(m[1] === "原生" ? GREEN : RED));
    }
    return true;
  }
  if (label && /^(数据库|库|服务商)$/.test(name)) {
    paintLabel();
    l.paint(end, t.length, { fg: CYAN, italic: true });
    return true;
  }
  if (/^(使用类型|公司类型)$/.test(name)) {
    paintLabel();
    for (const m of l.matches(/\S+/)) {
      if (m.index < end) continue;
      paintBadge(l, m.index, m.index + m[0].length, badge(IP_TYPES[m[0]] ?? YELLOW));
    }
    return true;
  }
  if (name === "风险等级") {
    paintLabel();
    const start = l.colAt(firstNonSpace(t, end));
    st.risk = start;
    [GREEN, YELLOW, RED].forEach((bg, k) =>
      paintCols(l.row, start + 16 * k, start + 16 * (k + 1), { bg, fg: WHITE, italic: true }),
    );
    return true;
  }
  if (st.section === "score" && label && t.includes("|", end)) {
    paintLabel();
    const pipe = t.indexOf("|", end);
    const p = l.colAt(pipe);
    const start = st.risk ?? 16;
    paintCols(l.row, l.colAt(end), p + 1, { bold: true, fg: WHITE });
    for (let c = Math.max(start, l.colAt(end)); c <= p; c++) {
      paintCols(l.row, c, c + 1, { bg: scaleColor(c - start, 16, [GREEN, YELLOW, RED]) });
    }
    const word = t.slice(pipe + 1);
    const fg = RISK.find(([re]) => re.test(word))?.[1];
    if (fg !== undefined) l.paint(pipe + 1, t.length, { bold: true, fg });
    return true;
  }
  if (st.section === "factor" && label) {
    paintLabel();
    l.paintMatches(/\[[A-Z]{2}\]/, VALUE);
    l.paintMatches(/(?<=\s)[是否无](?=\s|$)/, (m) => ({
      bold: true,
      fg: m[0] === "是" ? RED : GREEN,
    }));
    return true;
  }
  if (st.section === "media" && label) {
    paintLabel();
    if (name === "地区") {
      l.paint(end, t.length, VALUE);
    } else {
      for (const m of l.matches(/\S+/)) {
        if (m.index < end) continue;
        paintBadge(l, m.index, m.index + m[0].length, badge(MEDIA[m[0]] ?? YELLOW, false));
      }
    }
    return true;
  }
  if (st.section === "mail" && label) {
    paintLabel();
    l.paintMatches(/可用/, { fg: GREEN });
    l.paintMatches(/阻断|不可达|远端25端口不可达/, { fg: RED });
    l.paintMatches(/占用/, { fg: YELLOW });
    // 通信：+Gmail+Outlook-Yahoo，加号表示可达
    for (const m of l.matches(/([+-])([A-Za-z][\w.]*)/)) {
      l.paint(m.index, m.index + 1, { fg: BLACK });
      l.paint(m.index + 1, m.index + m[0].length, badge(m[1] === "+" ? GREEN : RED));
    }
    const counts: Record<string, Color> = { 有效: CYAN, 正常: GREEN, 已标记: YELLOW, 黑名单: RED };
    for (const m of l.matches(/(有效|正常|已标记|黑名单) (\d+)/)) {
      const fg = counts[m[1]];
      l.paint(m.index, m.index + m[1].length, { fg });
      l.paint(m.index + m[1].length + 1, m.index + m[0].length, { fg, bold: true });
    }
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 网络质量                                                               */
/* ------------------------------------------------------------------ */

const TIER1 = new Set([
  174, 701, 1239, 1299, 2828, 2914, 3257, 3320, 3356, 3491, 5511, 6453, 6461, 6762, 6830, 7018,
  12956,
]);
const NAT: [RegExp, Color | undefined][] = [
  [/开放网络无NAT/, GREEN],
  [/全锥形/, undefined],
  [/端口受限锥形|受限锥形|防火墙|未知NAT类型/, YELLOW],
  [/对称型|检测错误|连接失败/, RED],
];
const CARRIER: Record<string, Color> = { 电信: CYAN, 联通: GREEN, 移动: MAGENTA };

const latencyColor = (ms: number) => (ms <= 150 ? GREEN : ms <= 240 ? YELLOW : RED);

/** 盲文点阵：左列点数是第一次采样的档位，右列是第二次，0 档表示丢包 */
function brailleLevels(ch: string): [number, number] {
  const bits = (ch.codePointAt(0) ?? 0x2800) - 0x2800;
  const count = (mask: number) => {
    let n = 0;
    for (let v = bits & mask; v; v &= v - 1) n++;
    return n;
  };
  return [count(0x47), count(0xb8)];
}

/** 延迟格：[省份]⣶⣶⣶⣶⣶169，每个点阵字符单独着色，平均值按阈值着色 */
function delayCells(l: RowText) {
  for (const m of l.matches(/(\p{Script=Han}?)([⠀-⣿]+)(\s*\d+)/u)) {
    paintGroup(l, m, 1, { fg: CYAN });
    const [ba] = span(m, 2)!;
    let lost = false;
    [...m[2]].forEach((ch, k) => {
      const levels = brailleLevels(ch);
      if (levels.includes(0)) lost = true;
      const fg = levels.some((v) => v === 0 || v === 4) ? RED : levels.includes(3) ? YELLOW : GREEN;
      l.paint(ba + k, ba + k + 1, { fg });
    });
    const avg = Number(m[3]);
    paintGroup(l, m, 3, { bold: true, fg: lost || avg > 240 ? RED : avg > 150 ? YELLOW : GREEN });
  }
}

/** 测速数值：带宽下划线，50 / 200 Mbps 分档；ERROR 是带宽和延迟两格拼出来的 */
function speedValues(l: RowText, from: number, to: number, second: "delay" | "retr") {
  const roles = ["mbps", second, "mbps", second] as const;
  let k = 0;
  for (const m of l.matches(/ERROR|SKIP|100G\+|[\d.]+[km]?\+?|-/)) {
    if (m.index < from || m.index >= to || k >= roles.length) continue;
    const a = m.index;
    const b = a + m[0].length;
    if (m[0] === "ERROR") {
      l.paint(a, b, { fg: RED });
      k += 2;
      continue;
    }
    if (m[0] === "SKIP") {
      l.paint(a, b, { fg: GREEN });
      k += 4;
      continue;
    }
    const role = roles[k++];
    const scaled = /k$/.test(m[0]) ? 1e3 : /m$/.test(m[0]) ? 1e6 : 1;
    const v = m[0] === "-" ? -1 : parseFloat(m[0]) * scaled;
    if (role === "mbps") {
      l.paint(a, b, { fg: m[0] === "100G+" ? GREEN : colorBy(v, [50, 200]), underline: true });
    } else if (role === "delay") {
      l.paint(a, b, { fg: v <= 0 ? RED : latencyColor(v) });
    } else {
      l.paint(a, b, { fg: v === 0 ? GREEN : v <= 99 ? YELLOW : RED });
    }
  }
}

function net(l: RowText, st: State): boolean {
  const t = l.text;
  const label = labelOf(t);

  switch (st.section) {
    case "bgp": {
      labelValue(l);
      // 活跃邻居：Prefix/24  218 / 256，按占用比例给方块着色
      for (const m of l.matches(/(?:Subnet|Prefix)\/\d+ ( (\d+) \/ (\d+) )/)) {
        const ratio = Number(m[2]) / Math.max(1, Number(m[3]));
        paintGroup(l, m, 1, badge(ratio < 0.5 ? GREEN : ratio < 0.8 ? YELLOW : RED));
      }
      return true;
    }
    case "local": {
      if (label?.name === "NAT类型") {
        l.paint(0, label.end, LABEL);
        const a = firstNonSpace(t, label.end);
        const b = t.trimEnd().length;
        const color = NAT.find(([re]) => re.test(t))?.[1];
        if (b > a) paintBadge(l, a, b, { ...badge(color ?? WHITE), bg: color });
        return true;
      }
      labelValue(l);
      l.paintMatches(/独立映射|端点独立过滤|端口保留|(?<!不)支持/, { fg: GREEN });
      l.paintMatches(/依赖映射|端口依赖过滤|不支持/, { fg: RED });
      l.paintMatches(/地址依赖过滤|端口随机/, { fg: YELLOW });
      return true;
    }
    case "conn": {
      if (label) return labelValue(l);
      if (/^\s*AS\d+(?:\s+AS\d+)*\s*$/.test(t)) {
        const items = [...l.matches(/AS(\d+)/)].map((m) => ({
          col: l.colAt(m.index),
          len: m[0].length,
          asn: Number(m[1]),
        }));
        st.asns = { line: l, items };
        return true;
      }
      if (st.asns) {
        connRows(st.asns.line, l, st.asns.items);
        st.asns = undefined;
      }
      return true;
    }
    case "delay":
      delayCells(l);
      return true;
    case "route":
      return route(l);
    case "speed":
    case "iperf": {
      // 每行左右两组，用「||」隔开：城市（青色）+ 数值
      const iperf = st.section === "iperf";
      if (iperf) delayCells(l);
      let offset = 0;
      for (const half of t.split("||")) {
        const city = /^\s*\S+?(?=\s|[⠀-⣿]|$)/.exec(half);
        const cityEnd = city ? city[0].length : 0;
        if (city) l.paint(offset, offset + cityEnd, { fg: CYAN });
        // 国际互连：延迟点阵和平均值之后才是带宽数据
        const avg = iperf ? /[⠀-⣿]+\s*\d+/.exec(half) : null;
        const from = offset + (avg ? avg.index + avg[0].length : cityEnd);
        speedValues(l, from, offset + half.length, iperf ? "retr" : "delay");
        offset += half.length + 2;
      }
      return true;
    }
  }
  return false;
}

/**
 * 接入信息：AS 号蓝底，运营商名字绿底（Tier1）或黄底。
 * 脚本把两行里较短的一个居中补齐到同样宽度，这里按同样的规则还原方块范围。
 */
function connRows(asLine: RowText, names: RowText, items: AsItem[]) {
  const words = [...names.matches(/\S+/)];
  if (words.length !== items.length) {
    // 名字里带空格时对不上号，只给 AS 号上色
    for (const a of items) paintCols(asLine.row, a.col, a.col + a.len, badge(BLUE));
    names.paint(0, names.text.length, { bold: true });
    return;
  }
  words.forEach((w, k) => {
    const a = items[k];
    const width = Math.max(a.len, w[0].length);
    const asStart = a.col - Math.floor((width - a.len) / 2);
    paintCols(asLine.row, asStart, asStart + width, badge(BLUE));
    const nameStart = names.colAt(w.index) - Math.ceil((width - w[0].length) / 2);
    paintCols(names.row, nameStart, nameStart + width, badge(TIER1.has(a.asn) ? GREEN : YELLOW));
  });
}

/** 回程路由：汇总行、目标标题行、路径行和逐跳明细 */
function route(l: RowText): boolean {
  const t = l.text;
  const summary = /^(\S{2,4}(?:TCP|UDP)：)/.exec(t);
  if (summary) {
    l.paint(0, summary[0].length, LABEL);
    // 电信 NoData->9929：境外段蓝底（无数据黄底），国内段绿底
    const tone = (v: string, ok: Color): Style => ({
      ...badge(v === "NoData" ? YELLOW : v === "Hidden" ? RED : ok),
      underline: true,
    });
    for (const m of l.matches(/(电信|联通|移动)(\s+)(\S+?)(->)(\S+)/)) {
      paintGroup(l, m, 1, VALUE);
      paintGroup(l, m, 3, tone(m[3], BLUE));
      paintGroup(l, m, 4, VALUE);
      paintGroup(l, m, 5, tone(m[5], GREEN));
    }
    return true;
  }
  const target = execD(/^(  \S+ (电信|联通|移动)  )(  .+? -> \S+  )/, t);
  if (target) {
    const color = CARRIER[target[2]];
    paintGroup(l, target, 1, badge(color));
    paintGroup(l, target, 3, { bg: WHITE, fg: color, bold: true });
    return true;
  }
  if (/^地理路径：/.test(t)) {
    paintCols(l.row, 0, l.row.length, { bg: BLUE, fg: WHITE });
    return true;
  }
  // 逐跳明细：跳数加粗，延迟按 150 / 240 ms 分档，AS 号和网络名加粗
  const hop = execD(/^(\s?\d+(?:-\d+)?)\s+(\d+(?:\.\d+)?ms)\s+\S+\s*(AS\d+)?\s*(\[[^\]]*\])?/, t);
  if (hop) {
    paintGroup(l, hop, 1, { bold: true });
    paintGroup(l, hop, 2, { fg: latencyColor(parseFloat(hop[2])) });
    paintGroup(l, hop, 3, { bold: true });
    paintGroup(l, hop, 4, { bold: true });
    return true;
  }
  return labelValue(l);
}

/* ------------------------------------------------------------------ */
/* 入口                                                                  */
/* ------------------------------------------------------------------ */

function bodyLine(l: RowText, st: State) {
  const t = l.text;
  if (!t.trim() || RULE.test(t)) return;
  if (/^\s*今日.*检测量/.test(t)) {
    l.paint(0, t.length, { italic: true });
    return;
  }
  const link = execD(/^(\s*报告链接[：:])\s*(\S+)/, t);
  if (link) {
    paintGroup(l, link, 1, { italic: true });
    paintGroup(l, link, 2, { italic: true, underline: true });
    return;
  }
  if (HEADING.test(t)) {
    st.section = SECTIONS.find(([re]) => re.test(t))?.[1] ?? "";
    st.fio = false;
    st.asns = undefined;
    styleHeading(l, st);
    return;
  }
  if (hardware(l, st) || ip(l, st) || net(l, st)) return;
  // 没有标签、只有缩进的行是上一项数值的续行（例如第二块芯片组），同样是绿色
  if (!labelValue(l) && /^\s{4,}\S/.test(t)) {
    l.paint(firstNonSpace(t, 0), t.trimEnd().length, VALUE);
  }
}

/** 给 xykt / NodeQuality 报告的纯文本重新上色（就地修改格子样式） */
export function highlightXykt(rows: Row[]) {
  const lines = rows.map((r) => new RowText(r));
  const texts = lines.map((l) => l.text);
  let st = new State();
  for (let i = 0; i < lines.length;) {
    const banner = bannerAt(texts, i);
    if (banner) {
      styleBanner(lines.slice(banner.start, banner.end), banner);
      st = new State();
      i = banner.end;
      continue;
    }
    bodyLine(lines[i], st);
    i++;
  }
}
