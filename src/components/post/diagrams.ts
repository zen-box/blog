import { diagramErrorLine } from "@/lib/markdown/diagram-errors";
import type { ChartSpec, MindNode } from "@/lib/markdown/diagram-types";

import { chartOption, echartsTheme, mix, readTokens, type VizTokens } from "./chart-options";
import type { ViewerControls, ViewerRequest } from "./diagram-viewer";

/**
 * 正文里的图表：Mermaid、数据图表（ECharts）、思维导图（markmap）。
 * 各自的库都按需加载；前台在图表快滚动到视野里时才渲染，后台预览立即渲染。
 */

export type DiagramContext = {
  /** 后台编辑器的实时预览：不播放动画、立即渲染 */
  preview: boolean;
  onZoom: (req: ViewerRequest) => void;
};

const SELECTOR = "[data-mermaid], [data-chart], [data-echarts], [data-markmap]";

type Cleanup = () => void;

/** 一次渲染任务：所在的 setupDiagrams 已经清理时（例如预览内容又变了）就放弃，不再改动页面 */
type Job = DiagramContext & { cancelled: () => boolean };

const SVG_NS = "http://www.w3.org/2000/svg";

export function setupDiagrams(root: HTMLElement, ctx: DiagramContext): Cleanup {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  if (!blocks.length) return () => {};
  const tokens = readTokens(root);
  const animate = !ctx.preview && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups = new Set<Cleanup>();
  let disposed = false;

  const job: Job = { ...ctx, cancelled: () => disposed };

  const run = async (el: HTMLElement) => {
    let cleanup: Cleanup | void = undefined;
    try {
      if (el.hasAttribute("data-mermaid")) cleanup = await renderMermaid(el, tokens, job);
      else if (el.hasAttribute("data-markmap"))
        cleanup = await renderMarkmap(el, tokens, job, animate);
      else cleanup = await renderChart(el, tokens, job, animate);
    } catch (e) {
      console.error(e);
      if (el.isConnected && !disposed) showError(el, "图表渲染失败", errorMessage(e));
    }
    if (!cleanup) return;
    if (disposed) cleanup();
    else cleanups.add(cleanup);
  };

  let observer: IntersectionObserver | undefined;
  if (ctx.preview) {
    blocks.forEach((el) => void run(el));
  } else {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          void run(entry.target as HTMLElement);
        }
      },
      { rootMargin: "600px 0px" },
    );
    blocks.forEach((el) => observer!.observe(el));
  }

  return () => {
    disposed = true;
    observer?.disconnect();
    cleanups.forEach((c) => c());
    cleanups.clear();
  };
}

/* ------------------------------------------------------------------ */
/* 公用的小部件                                                            */
/* ------------------------------------------------------------------ */

const icon = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  maximize: icon(
    '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  ),
  table: icon(
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  ),
  chart: icon(
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  ),
};

function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.trim() || "未知错误";
}

function showError(el: HTMLElement, title: string, detail: string, source?: string) {
  const box = document.createElement("div");
  box.className = "md-diagram-error";
  box.setAttribute("role", "note");
  const head = document.createElement("p");
  head.className = "md-diagram-error-title";
  head.textContent = title;
  const msg = document.createElement("pre");
  msg.className = "md-diagram-error-detail";
  msg.textContent = detail;
  box.append(head, msg);
  if (source) {
    const src = document.createElement("pre");
    src.className = "md-diagram-error-source";
    const errorLine = diagramErrorLine(detail, source);
    for (const [index, value] of source.split(/\r?\n/).entries()) {
      const row = document.createElement("span");
      row.className = "md-diagram-source-line";
      if (index + 1 === errorLine) row.dataset.errorLine = "";
      const number = document.createElement("span");
      number.className = "md-diagram-line-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1);
      row.append(number, document.createTextNode(value || " "));
      src.append(row);
    }
    box.append(src);
  }
  el.dataset.error = "";
  el.replaceChildren(box);
}

/** 「放大查看」按钮；Mermaid 图本身也可以点击放大 */
function attachZoom(
  el: HTMLElement,
  svg: SVGSVGElement,
  ctx: DiagramContext,
  request: (trigger: HTMLButtonElement) => ViewerRequest,
  clickSvg: boolean,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-diagram-zoom";
  button.setAttribute("aria-label", "放大查看");
  button.title = "放大查看";
  button.innerHTML = ICONS.maximize;
  const open = (e: Event) => {
    // 图里的链接照常打开
    if ((e.target as Element).closest?.("a")) return;
    ctx.onZoom(request(button));
  };
  button.addEventListener("click", open);
  if (clickSvg) svg.addEventListener("click", open);
  el.append(button);
  return () => {
    button.remove();
    svg.removeEventListener("click", open);
  };
}

/* ------------------------------------------------------------------ */
/* Mermaid                                                                */
/* ------------------------------------------------------------------ */

type Mermaid = (typeof import("mermaid"))["default"];

let mermaidLoader: Promise<Mermaid> | null = null;
let mermaidThemeKey = "";
let mermaidSeq = 0;
/** Mermaid 不能并发渲染，排队执行 */
let mermaidQueue: Promise<unknown> = Promise.resolve();
/** 渲染结果缓存：预览时每次输入都会重建正文，没改动的图直接复用 */
const svgCache = new Map<string, string>();

const themeKey = (t: VizTokens) =>
  [t.dark, t.surface, t.text, t.textMuted, t.grid, t.brand, t.font].join("|");

function mermaidConfig(t: VizTokens) {
  const pies = Object.fromEntries(t.palette.map((c, i) => [`pie${i + 1}`, c]));
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    fontFamily: t.font,
    // Mermaid 12 默认 120px 就折行，一行只放得下七八个汉字
    flowchart: { wrappingWidth: 240 },
    themeVariables: {
      darkMode: t.dark,
      fontFamily: t.font,
      fontSize: "14px",
      background: t.surface,
      mainBkg: t.surface,
      primaryColor: t.surface,
      primaryTextColor: t.text,
      primaryBorderColor: t.brand,
      secondaryColor: t.surfaceMuted,
      tertiaryColor: t.page,
      nodeBorder: t.brand,
      lineColor: t.textMuted,
      textColor: t.text,
      titleColor: t.text,
      clusterBkg: mix(t.surface, t.text, 0.03),
      clusterBorder: t.grid,
      edgeLabelBackground: t.surface,
      noteBkgColor: t.surfaceMuted,
      noteBorderColor: t.grid,
      noteTextColor: t.text,
      ...pies,
      pieOpacity: "1",
      pieStrokeColor: t.surface,
      pieStrokeWidth: "2px",
      pieOuterStrokeColor: t.grid,
      pieOuterStrokeWidth: "1px",
      pieTitleTextColor: t.text,
      pieSectionTextColor: "#ffffff",
      pieLegendTextColor: t.text,
      xyChart: {
        backgroundColor: t.surface,
        titleColor: t.text,
        xAxisLabelColor: t.textMuted,
        xAxisTitleColor: t.textMuted,
        xAxisTickColor: t.grid,
        xAxisLineColor: t.baseline,
        yAxisLabelColor: t.textMuted,
        yAxisTitleColor: t.textMuted,
        yAxisTickColor: t.grid,
        yAxisLineColor: t.baseline,
        plotColorPalette: t.palette.join(","),
      },
    },
  };
}

function remember(key: string, svg: string) {
  svgCache.delete(key);
  svgCache.set(key, svg);
  if (svgCache.size > 60) svgCache.delete(svgCache.keys().next().value!);
}

function renderQueued<T>(task: () => Promise<T>): Promise<T> {
  const next = mermaidQueue.then(task, task);
  mermaidQueue = next.catch(() => {});
  return next;
}

async function renderMermaid(el: HTMLElement, t: VizTokens, job: Job) {
  const source = el.dataset.source ?? el.querySelector(".mermaid-source")?.textContent ?? "";
  el.dataset.source = source;
  const key = `${themeKey(t)}\n${source}`;
  let svg = svgCache.get(key);
  if (!svg) {
    const result = await renderQueued<{ svg: string } | { error: string }>(async () => {
      mermaidLoader ??= import("mermaid").then((m) => m.default);
      const mermaid = await mermaidLoader;
      const themed = themeKey(t);
      if (themed !== mermaidThemeKey) {
        mermaid.initialize(mermaidConfig(t));
        mermaidThemeKey = themed;
      }
      const id = `mermaid-${++mermaidSeq}`;
      try {
        return { svg: (await mermaid.render(id, source)).svg };
      } catch (e) {
        // 渲染失败时 Mermaid 可能把临时节点留在 body 里
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        return { error: errorMessage(e) };
      }
    });
    if (job.cancelled() || !el.isConnected) return;
    if ("error" in result) {
      showError(el, "Mermaid 语法有误", result.error, source);
      return;
    }
    svg = result.svg;
    remember(key, svg);
  }
  if (job.cancelled() || !el.isConnected) return;
  el.innerHTML = svg;
  delete el.dataset.error;
  el.dataset.rendered = "";
  const node = el.querySelector<SVGSVGElement>(":scope > svg");
  return node
    ? attachZoom(el, node, job, (trigger) => ({ svg: node, origin: node, trigger }), true)
    : undefined;
}

/* ------------------------------------------------------------------ */
/* 数据图表：chart（CSV）与 echarts（完整配置）                              */
/* ------------------------------------------------------------------ */

type ECharts = typeof import("echarts");

let echartsLoader: Promise<ECharts> | null = null;
const registeredThemes = new Map<string, string>();

function attachTableToggle(el: HTMLElement): Cleanup {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-chart-toggle";
  const update = () => {
    const table = el.dataset.view === "table";
    button.innerHTML = `${table ? ICONS.chart : ICONS.table}<span>${table ? "图表" : "表格"}</span>`;
    button.title = table ? "显示图表" : "以表格查看数据";
    button.setAttribute("aria-pressed", String(table));
  };
  button.addEventListener("click", () => {
    if (el.dataset.view === "table") delete el.dataset.view;
    else el.dataset.view = "table";
    update();
  });
  const onDataFocus = (event: FocusEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest(".md-chart-data")) return;
    el.dataset.view = "table";
    update();
  };
  el.addEventListener("focusin", onDataFocus);
  update();
  el.append(button);
  return () => {
    el.removeEventListener("focusin", onDataFocus);
    button.remove();
  };
}

async function renderChart(el: HTMLElement, t: VizTokens, job: Job, animate: boolean) {
  echartsLoader ??= import("echarts");
  const echarts = await echartsLoader;
  const plot = el.querySelector<HTMLElement>(":scope > .md-chart-plot");
  if (!plot || job.cancelled() || !el.isConnected) return;

  const themeName = t.dark ? "blog-dark" : "blog-light";
  const key = themeKey(t);
  if (registeredThemes.get(themeName) !== key) {
    echarts.registerTheme(themeName, echartsTheme(t));
    registeredThemes.set(themeName, key);
  }

  const spec = el.dataset.chart ? (JSON.parse(el.dataset.chart) as ChartSpec) : null;
  let option: Record<string, unknown>;
  let horizontal = false;
  let width = plot.clientWidth;
  if (spec) {
    // 布局取决于实际宽度：纵向放不下分类名时自动改成横向条形图，高度随之变化
    const layout = chartOption(spec, t, { width, height: plot.clientHeight, animate });
    plot.style.height = layout.height ? `${layout.height}px` : "";
    horizontal = layout.horizontal;
    option = layout.option as Record<string, unknown>;
  } else {
    option = JSON.parse(el.dataset.echarts ?? "{}") as Record<string, unknown>;
    if (!animate) option.animation = false;
  }

  const chart = echarts.init(plot, themeName, { renderer: "svg", locale: "ZH" });
  try {
    chart.setOption(option);
  } catch (e) {
    chart.dispose();
    showError(el, "ECharts 配置有误", errorMessage(e), el.dataset.source);
    return;
  }
  el.dataset.rendered = "";

  const relayout = () => {
    if (!spec || Math.abs(plot.clientWidth - width) < 2) return;
    width = plot.clientWidth;
    const layout = chartOption(spec, t, { width, height: plot.clientHeight, animate: false });
    plot.style.height = layout.height ? `${layout.height}px` : "";
    // 横竖方向变了要整体重建，否则合并更新即可（不会重播动画）
    chart.setOption(layout.option, { notMerge: layout.horizontal !== horizontal });
    horizontal = layout.horizontal;
  };
  const observer = new ResizeObserver(() => {
    relayout();
    chart.resize();
  });
  observer.observe(plot);
  const toggle = spec ? attachTableToggle(el) : undefined;
  const svg = plot.querySelector<SVGSVGElement>("svg");
  const zoom = svg
    ? attachZoom(el, svg, job, (trigger) => ({ svg, origin: plot, trigger }), false)
    : undefined;
  return () => {
    observer.disconnect();
    chart.dispose();
    toggle?.();
    zoom?.();
    plot.style.height = "";
    delete el.dataset.rendered;
  };
}

/* ------------------------------------------------------------------ */
/* 思维导图                                                                */
/* ------------------------------------------------------------------ */

type MarkmapModule = typeof import("markmap-view");

let markmapLoader: Promise<MarkmapModule> | null = null;

type MarkmapInstance = InstanceType<MarkmapModule["Markmap"]>;
type MarkmapOptions = ConstructorParameters<MarkmapModule["Markmap"]>[1];

/**
 * 创建思维导图并在数据就绪后居中。销毁时先停掉还在进行的缩放动画、并跳过还没执行的居中，
 * 否则动画会在已经脱离文档的节点上继续运行，算出 NaN
 */
function createMarkmap(
  Markmap: MarkmapModule["Markmap"],
  svg: SVGSVGElement,
  options: MarkmapOptions,
  data: MindNode,
): { mm: MarkmapInstance; dispose: () => void } {
  const mm = new Markmap(svg, options);
  let alive = true;
  void mm.setData(data).then(() => {
    if (alive) void mm.fit();
  });
  return {
    mm,
    dispose: () => {
      alive = false;
      (mm.svg as unknown as { interrupt?: () => void }).interrupt?.();
      mm.destroy();
    },
  };
}

async function renderMarkmap(el: HTMLElement, t: VizTokens, job: Job, animate: boolean) {
  markmapLoader ??= import("markmap-view");
  const { Markmap, deriveOptions } = await markmapLoader;
  const plot = el.querySelector<HTMLElement>(":scope > .md-markmap-plot");
  if (!plot || job.cancelled() || !el.isConnected) return;

  const data = JSON.parse(el.dataset.markmap ?? "null") as MindNode | null;
  if (!data) return;
  const expand = Number(el.dataset.expand);
  const common = {
    ...deriveOptions({ color: [...t.palette], colorFreezeLevel: 2 }),
    paddingX: 10,
    nodeMinHeight: 18,
    fitRatio: 0.92,
  };

  const svg = document.createElementNS(SVG_NS, "svg");
  // d3-zoom 从 width / height 属性读取尺寸，用像素值（百分比在节点脱离文档时会读取失败）
  const size = () => {
    svg.setAttribute("width", String(plot.clientWidth));
    svg.setAttribute("height", String(plot.clientHeight));
  };
  size();
  plot.replaceChildren(svg);
  // 页面里不接管滚轮和拖动（避免滚动页面时误缩放），点节点可以折叠
  const inline = createMarkmap(
    Markmap,
    svg,
    {
      ...common,
      autoFit: true,
      zoom: false,
      pan: false,
      duration: animate ? 450 : 0,
      initialExpandLevel: expand > 0 ? expand : -1,
      maxWidth: 260,
      spacingHorizontal: 72,
      spacingVertical: 10,
    },
    data,
  );
  el.dataset.rendered = "";
  const observer = new ResizeObserver(() => {
    size();
    void inline.mm.fit();
  });
  observer.observe(plot);

  // 放大查看时重新渲染一份全部展开、可以自由缩放拖动的
  const mount = (host: HTMLElement): ViewerControls => {
    const big = document.createElementNS(SVG_NS, "svg");
    big.style.display = "block";
    // d3-zoom 从 width / height 属性读取尺寸，百分比在这里会读取失败，所以写成像素并跟随容器更新
    const size = () => {
      big.setAttribute("width", String(host.clientWidth));
      big.setAttribute("height", String(host.clientHeight));
    };
    size();
    host.replaceChildren(big);
    const view = createMarkmap(
      Markmap,
      big,
      {
        ...common,
        autoFit: false,
        zoom: true,
        pan: true,
        duration: 300,
        initialExpandLevel: -1,
        maxWidth: 320,
        maxInitialScale: 2.5,
        spacingHorizontal: 80,
        spacingVertical: 12,
      },
      data,
    );
    let width = host.clientWidth;
    const resize = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - width) < 2) return;
      width = host.clientWidth;
      size();
      void view.mm.fit();
    });
    resize.observe(host);
    return {
      zoom: (factor) => void view.mm.rescale(factor),
      fit: () => void view.mm.fit(),
      destroy: () => {
        resize.disconnect();
        view.dispose();
      },
    };
  };
  const zoom = attachZoom(el, svg, job, (trigger) => ({ mount, origin: svg, trigger }), false);
  return () => {
    observer.disconnect();
    zoom();
    inline.dispose();
    plot.replaceChildren();
    delete el.dataset.rendered;
  };
}
