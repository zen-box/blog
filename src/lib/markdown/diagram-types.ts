/** 图表代码块在服务端解析后交给浏览器渲染的数据（前后端共用） */

export const CHART_TYPES = ["bar", "line", "area", "pie", "radar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** `chart` 代码块：一列分类 + 若干列数值 */
export type ChartSpec = {
  type: ChartType;
  title?: string;
  /** 数值单位，例如 MB/s、ms、% */
  unit?: string;
  /** 条形图横向显示（分类名较长或较多时） */
  horizontal?: boolean;
  /** 堆叠（柱状、折线、面积） */
  stack?: boolean;
  /** 平滑曲线（折线、面积） */
  smooth?: boolean;
  /** 在图形上直接标出数值 */
  labels?: boolean;
  min?: number;
  max?: number;
  /** 第一列的表头，例如「机器」 */
  category: string;
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
};

/** `markmap` 代码块：思维导图节点，content 是节点的 HTML */
export type MindNode = { content: string; children: MindNode[] };

/** 最多几个系列：分类配色只有 8 种，再多就分不清了 */
export const MAX_SERIES = 8;

/** 横向条形图需要的高度：按分类数量和每组柱子的数量增长 */
export function horizontalBarHeight(spec: ChartSpec): number {
  const legend = spec.series.length > 1 ? 36 : 0;
  const per = spec.stack ? 34 : 18 + 14 * spec.series.length;
  return Math.min(720, Math.max(180, spec.categories.length * per + legend + 48));
}

/** 数值格式：千分位 + 单位；英文单位前加空格 */
export function formatValue(value: number | null | undefined, unit?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  if (!unit) return text;
  return /^[A-Za-z/µμ]/.test(unit) ? `${text} ${unit}` : `${text}${unit}`;
}
