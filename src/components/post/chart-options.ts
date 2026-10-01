import type { EChartsOption } from "echarts";

import { type ChartSpec, formatValue, horizontalBarHeight } from "@/lib/markdown/diagram-types";

/**
 * 分类配色：8 种颜色按固定顺序使用，亮 / 暗两套各自调过明度。
 * 已用 dataviz 的 validate_palette 对本站卡片背景（亮 #fffdf9、暗 #1d1f24）校验：
 * 明度带、彩度下限、色弱区分（相邻 ΔE ≥ 8）、正常视觉下限都通过；
 * 亮色下青、黄、粉三色对背景低于 3:1，因此数据图表始终提供表格视图。
 */
const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;

export type VizTokens = {
  dark: boolean;
  palette: readonly string[];
  /** 图表所在卡片的背景 */
  surface: string;
  /** 次一级背景（分组框等） */
  surfaceMuted: string;
  page: string;
  popover: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  /** 网格线 */
  grid: string;
  /** 坐标轴基线：比网格线略深 */
  baseline: string;
  brand: string;
  font: string;
};

let probe: CanvasRenderingContext2D | null | undefined;

/** 任意 CSS 颜色（oklch、color(...) 等）转成 #rrggbb，ECharts 和 Mermaid 只认识十六进制 / rgb */
export function toHex(css: string, fallback = "#888888"): string {
  const value = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (probe === undefined) {
    probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  }
  if (!probe || !value) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = fallback;
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** 两个十六进制颜色按比例混合（t 为 b 的占比） */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 从当前主题的 CSS 变量读出图表要用的颜色 */
export function readTokens(el: Element = document.documentElement): VizTokens {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback?: string) => toHex(root.getPropertyValue(name), fallback);
  const dark = document.documentElement.classList.contains("dark");
  const text = v("--foreground", dark ? "#e9e6df" : "#1f1d1a");
  const grid = v("--border", dark ? "#2d3037" : "#e4ddd1");
  return {
    dark,
    palette: dark ? PALETTE.dark : PALETTE.light,
    surface: v("--card", dark ? "#1d1f24" : "#fffdf9"),
    surfaceMuted: v("--muted", dark ? "#25272d" : "#efeae0"),
    page: v("--background", dark ? "#16171b" : "#f7f4ee"),
    popover: v("--popover", dark ? "#1f2126" : "#fffdf9"),
    text,
    textMuted: v("--muted-foreground", dark ? "#9a958b" : "#6e685e"),
    textSubtle: v("--subtle", dark ? "#6f6b64" : "#9a948a"),
    grid,
    baseline: mix(grid, text, dark ? 0.16 : 0.2),
    brand: v("--brand", dark ? "#9db4e0" : "#3d5a8f"),
    font: getComputedStyle(el).fontFamily || "sans-serif",
  };
}

/** 注册给 ECharts 的主题：`echarts` 代码块里没写的样式都从这里继承 */
export function echartsTheme(t: VizTokens) {
  const axis = {
    axisLine: { show: true, lineStyle: { color: t.baseline } },
    axisTick: { show: false },
    axisLabel: { color: t.textMuted },
    splitLine: { show: false, lineStyle: { color: t.grid, type: "solid", width: 1 } },
    splitArea: { show: false },
    nameTextStyle: { color: t.textMuted },
  };
  const valueAxis = {
    ...axis,
    axisLine: { show: false, lineStyle: { color: t.baseline } },
    splitLine: { show: true, lineStyle: { color: t.grid, type: "solid", width: 1 } },
  };
  return {
    color: [...t.palette],
    backgroundColor: "transparent",
    textStyle: { fontFamily: t.font, color: t.textMuted },
    title: {
      textStyle: { color: t.text, fontSize: 14, fontWeight: 600 },
      subtextStyle: { color: t.textMuted },
    },
    legend: {
      textStyle: { color: t.textMuted },
      inactiveColor: t.grid,
      pageTextStyle: { color: t.textMuted },
      pageIconColor: t.textMuted,
      pageIconInactiveColor: t.grid,
    },
    tooltip: {
      backgroundColor: t.popover,
      borderColor: t.grid,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: "border-radius: 10px; box-shadow: 0 12px 32px -14px rgba(0, 0, 0, 0.3);",
    },
    axisPointer: {
      lineStyle: { color: t.baseline },
      crossStyle: { color: t.baseline },
      shadowStyle: { color: withAlpha(t.text, 0.04) },
      label: { backgroundColor: t.text, color: t.surface },
    },
    categoryAxis: axis,
    timeAxis: axis,
    valueAxis,
    logAxis: valueAxis,
    line: { symbol: "circle", symbolSize: 8, lineStyle: { width: 2 } },
    bar: { barMaxWidth: 24 },
    pie: { itemStyle: { borderColor: t.surface, borderWidth: 2 } },
    gauge: {
      axisLine: { lineStyle: { color: [[1, t.surfaceMuted]] } },
      axisTick: { lineStyle: { color: t.baseline } },
      splitLine: { lineStyle: { color: t.baseline } },
      axisLabel: { color: t.textMuted },
      title: { color: t.textMuted },
      detail: { color: t.text },
      anchor: { itemStyle: { borderColor: t.surface } },
    },
    dataZoom: { textStyle: { color: t.textMuted }, borderColor: t.grid },
    visualMap: { textStyle: { color: t.textMuted } },
  };
}

/* ------------------------------------------------------------------ */
/* 提示框：数值在前、名称在后；名称来自文章数据，一律用 textContent 写入          */
/* ------------------------------------------------------------------ */

type TipRow = { color: string; name: string; value: string };

function tooltip(header: string | undefined, rows: TipRow[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "viz-tip";
  if (header) {
    const head = document.createElement("div");
    head.className = "viz-tip-head";
    head.textContent = header;
    root.append(head);
  }
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "viz-tip-row";
    const key = document.createElement("span");
    key.className = "viz-tip-key";
    key.style.background = r.color;
    const value = document.createElement("strong");
    value.textContent = r.value;
    const name = document.createElement("span");
    name.className = "viz-tip-name";
    name.textContent = r.name;
    row.append(key, value, name);
    root.append(row);
  }
  return root;
}

type TipParam = {
  color?: unknown;
  name?: string;
  seriesName?: string;
  value?: unknown;
  percent?: number;
  axisValueLabel?: string;
};

const colorOf = (p: TipParam) => (typeof p.color === "string" ? p.color : "currentColor");

/* ------------------------------------------------------------------ */
/* chart 代码块 → ECharts 配置                                             */
/* ------------------------------------------------------------------ */

const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

function axisFormatter(spec: ChartSpec) {
  const peak = Math.max(0, ...spec.series.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0))));
  return (v: number) => (peak >= 1e5 ? compact.format(v) : v.toLocaleString("zh-CN"));
}

/** 雷达图每个指标的上限：取各系列最大值，向上取到整齐的数 */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value * 1.08;
  const step = 10 ** Math.floor(Math.log10(raw)) / 2;
  return Math.ceil(raw / step) * step;
}

const MAX_PIE_SLICES = 8;

/** 估算 12px 字号下文字的宽度：中日韩字符算一个字宽，其余按六成 */
const WIDE =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
function textWidth(text: string, size = 12): number {
  let w = 0;
  for (const ch of text) w += WIDE.test(ch) ? size : size * 0.6;
  return w;
}

/** 最后一个有数值的点 */
function lastValue(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) return v;
  }
  return null;
}

/**
 * 折线末端的名称标签：只有末端彼此离得够远（不会互相遮挡）时才显示，
 * 否则交给图例，避免只剩部分标签、显得没有规律
 */
function endLabelsFit(spec: ChartSpec, plotHeight: number): boolean {
  const ends = spec.series.map((s) => lastValue(s.values));
  if (ends.some((v) => v == null)) return false;
  let positions = ends as number[];
  let peak = Math.max(...spec.series.flatMap((s) => s.values.map((v) => v ?? 0)));
  if (spec.stack) {
    let acc = 0;
    positions = positions.map((v) => (acc += v));
    peak = Math.max(
      ...spec.categories.map((_, i) => spec.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)),
    );
  }
  const values = spec.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const low = spec.type === "line" && !spec.stack ? Math.min(...values) : Math.min(0, ...values);
  // 坐标轴会取整到整齐的刻度，比数据范围略大，这里按偏保守的范围估算
  const span = (peak - low) * 1.3 || 1;
  const sorted = [...positions].sort((a, b) => a - b);
  const gap = Math.min(...sorted.slice(1).map((v, i) => v - sorted[i]));
  return (gap / span) * plotHeight >= 18;
}

export type ChartLayout = {
  option: EChartsOption;
  /** 是否画成横向条形图（指定的，或者纵向放不下时自动改的） */
  horizontal: boolean;
  /** 自动改成横向条形图时需要的高度 */
  height?: number;
};

export function chartOption(
  spec: ChartSpec,
  t: VizTokens,
  size: { width: number; height: number; animate: boolean },
): ChartLayout {
  const multi = spec.series.length > 1;
  const fmt = (v: unknown) => formatValue(typeof v === "number" ? v : null, spec.unit);
  const base: EChartsOption = {
    animation: size.animate,
    animationDuration: 700,
    animationEasing: "cubicOut",
    color: [...t.palette],
    textStyle: { fontFamily: t.font },
  };
  const legend = multi
    ? {
        top: 0,
        left: 0,
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 18,
        icon: spec.type === "bar" || spec.type === "pie" ? "roundRect" : undefined,
      }
    : undefined;

  if (spec.type === "pie") {
    const values = spec.series[0].values;
    let data = spec.categories
      .map((name, i) => ({ name, value: values[i] ?? 0 }))
      .filter((d) => d.value > 0) as {
      name: string;
      value: number;
      itemStyle?: { color: string };
    }[];
    // 扇区太多时，把最小的几块合并成「其他」（保持原有顺序，颜色不因合并而改变）
    if (data.length > MAX_PIE_SLICES) {
      const keep = new Set(
        [...data]
          .sort((a, b) => b.value - a.value)
          .slice(0, MAX_PIE_SLICES - 1)
          .map((d) => d.name),
      );
      const rest = data.filter((d) => !keep.has(d.name)).reduce((sum, d) => sum + d.value, 0);
      data = [
        ...data.filter((d) => keep.has(d.name)),
        { name: "其他", value: rest, itemStyle: { color: t.textSubtle } },
      ];
    }
    return {
      option: {
        ...base,
        tooltip: {
          trigger: "item",
          formatter: (p) => {
            const q = p as TipParam;
            return tooltip(undefined, [
              { color: colorOf(q), name: q.name ?? "", value: `${fmt(q.value)} · ${q.percent}%` },
            ]);
          },
        },
        series: [
          {
            type: "pie",
            radius: ["48%", "70%"],
            center: ["50%", "50%"],
            percentPrecision: 1,
            avoidLabelOverlap: true,
            itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
            label: { color: t.textMuted, formatter: "{b}  {d}%" },
            labelLine: { lineStyle: { color: t.baseline }, length: 10, length2: 10 },
            emphasis: { scale: true, scaleSize: 4, label: { color: t.text } },
            data,
          },
        ],
      },
      horizontal: false,
    };
  }

  if (spec.type === "radar") {
    return {
      option: {
        ...base,
        legend,
        tooltip: {
          trigger: "item",
          formatter: (p) => {
            const q = p as TipParam;
            const values = Array.isArray(q.value) ? q.value : [];
            return tooltip(
              q.name,
              spec.categories.map((c, i) => ({
                color: colorOf(q),
                name: c,
                value: fmt(values[i]),
              })),
            );
          },
        },
        radar: {
          indicator: spec.categories.map((name, i) => ({
            name,
            min: spec.min,
            max: spec.max ?? niceMax(Math.max(...spec.series.map((s) => s.values[i] ?? 0))),
          })),
          radius: "64%",
          center: ["50%", multi ? "56%" : "52%"],
          splitNumber: 4,
          shape: "polygon",
          axisName: { color: t.textMuted, fontSize: 12 },
          splitLine: { lineStyle: { color: t.grid } },
          splitArea: { show: false },
          axisLine: { lineStyle: { color: t.grid } },
        },
        series: [
          {
            type: "radar",
            symbol: "circle",
            symbolSize: 8,
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.1 },
            itemStyle: { borderColor: t.surface, borderWidth: 2 },
            emphasis: { focus: "self", areaStyle: { opacity: 0.2 } },
            data: spec.series.map((s) => ({ name: s.name, value: s.values.map((v) => v ?? 0) })),
          },
        ],
      },
      horizontal: false,
    };
  }

  // 柱状 / 折线 / 面积：一个数值轴（永远不用双轴）
  const isLine = spec.type !== "bar";
  // 纵向柱子放不下分类名（每格太窄，或名字要折成三行以上）时，自动改成横向条形图
  const band = Math.max(1, (size.width - 56) / Math.max(1, spec.categories.length));
  const longest = Math.max(0, ...spec.categories.map((c) => textWidth(c)));
  const horizontal =
    spec.type === "bar" &&
    (!!spec.horizontal || band < 40 || Math.ceil(longest / Math.max(1, band - 8)) > 2);
  const height = horizontal && !spec.horizontal ? horizontalBarHeight(spec) : undefined;

  const top = multi ? 40 : 12;
  // 不超过 4 条线、且末端不会互相遮挡时，在末端直接标出名称（图例仍然保留）
  const endLabels =
    isLine && multi && spec.series.length <= 4 && endLabelsFit(spec, size.height - top - 28);
  const endSpace = endLabels
    ? Math.min(120, Math.max(...spec.series.map((s) => textWidth(s.name))) + 16)
    : 16;

  const categoryAxis = {
    type: "category" as const,
    data: spec.categories,
    boundaryGap: !isLine,
    inverse: horizontal,
    axisLine: { show: true, lineStyle: { color: t.baseline } },
    axisTick: { show: false },
    axisLabel: horizontal
      ? {
          color: t.textMuted,
          width: Math.min(160, size.width * 0.34),
          overflow: "truncate" as const,
        }
      : isLine
        ? { color: t.textMuted, hideOverlap: true }
        : {
            color: t.textMuted,
            interval: 0,
            width: band - 8,
            overflow: "break" as const,
            lineHeight: 16,
          },
  };
  const valueAxis = {
    type: "value" as const,
    min: spec.min,
    max: spec.max,
    // 折线看的是变化，纵轴从数据范围附近开始；柱子和面积表示数量，必须从 0 开始
    scale: spec.type === "line" && spec.min == null,
    // 窄屏的横向条形图，横轴刻度少一些，避免挤在一起
    splitNumber: horizontal && size.width < 520 ? 3 : undefined,
    axisLabel: { color: t.textMuted, formatter: axisFormatter(spec), hideOverlap: true },
    splitLine: { lineStyle: { color: t.grid, type: "solid" as const } },
  };

  const lastIndex = spec.series.length - 1;
  const radius = (i: number) =>
    spec.stack && i !== lastIndex ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  const valueLabel = (position: "top" | "right") =>
    spec.labels
      ? {
          show: true,
          position,
          color: t.textMuted,
          fontSize: 11,
          formatter: (p: TipParam) => fmt(p.value),
        }
      : undefined;

  const option = {
    ...base,
    legend,
    grid: {
      left: 4,
      right: horizontal ? 24 : endSpace,
      top,
      bottom: 4,
      outerBoundsMode: "same",
      outerBoundsContain: "all",
    },
    tooltip: isLine
      ? {
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: t.baseline, width: 1 } },
          formatter: (params: unknown) => {
            const list = (Array.isArray(params) ? params : [params]) as TipParam[];
            return tooltip(
              list[0]?.axisValueLabel ?? list[0]?.name,
              list.map((p) => ({
                color: colorOf(p),
                name: p.seriesName ?? "",
                value: fmt(p.value),
              })),
            );
          },
        }
      : {
          trigger: "item",
          formatter: (p: unknown) => {
            const q = p as TipParam;
            return tooltip(q.name, [
              { color: colorOf(q), name: q.seriesName ?? "", value: fmt(q.value) },
            ]);
          },
        },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: spec.series.map((s, i) =>
      isLine
        ? {
            type: "line" as const,
            name: s.name,
            data: s.values,
            stack: spec.stack ? "total" : undefined,
            smooth: spec.smooth,
            symbol: "circle",
            symbolSize: 8,
            showSymbol: spec.categories.length <= 16,
            lineStyle: { width: 2 },
            itemStyle: { borderColor: t.surface, borderWidth: 2 },
            areaStyle: spec.type === "area" ? { opacity: 0.1 } : undefined,
            emphasis: { focus: multi ? ("series" as const) : ("none" as const) },
            endLabel: endLabels
              ? { show: true, color: t.textMuted, fontSize: 12, formatter: "{a}" }
              : undefined,
            label: valueLabel("top"),
          }
        : {
            type: "bar" as const,
            name: s.name,
            data: s.values,
            stack: spec.stack ? "total" : undefined,
            barMaxWidth: 24,
            barGap: "16%",
            barCategoryGap: multi ? "32%" : "44%",
            itemStyle: {
              borderRadius: radius(i),
              borderColor: t.surface,
              borderWidth: spec.stack ? 1 : 0,
            },
            emphasis: {
              focus: multi ? ("series" as const) : ("none" as const),
              itemStyle: { opacity: 0.86 },
            },
            label: valueLabel(horizontal ? "right" : "top"),
          },
    ),
  } as EChartsOption;
  return { option, horizontal, height };
}
