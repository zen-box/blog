import type { Element } from "hast";
import { s } from "hastscript";

/** Lucide 图标的路径数据，直接内联进渲染结果，前端无需额外脚本 */
const ICONS: Record<string, string[]> = {
  info: ["M12 16v-4", "M12 8h.01"],
  lightbulb: [
    "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
    "M9 18h6",
    "M10 22h4",
  ],
  message: [
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "M12 7v2",
    "M12 13h.01",
  ],
  triangle: [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  octagon: [
    "M12 16h.01",
    "M12 8v4",
    "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",
  ],
  check: ["m9 12 2 2 4-4"],
  pencil: [
    "M13 21h8",
    "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
  ],
  chevron: ["m9 18 6-6-6-6"],
};

const WITH_CIRCLE = new Set(["info", "check"]);

export function icon(name: keyof typeof ICONS, className = "md-icon"): Element {
  const children: Element[] = [];
  if (WITH_CIRCLE.has(name)) {
    children.push(s("circle", { cx: 12, cy: 12, r: 10 }));
  }
  for (const d of ICONS[name]) children.push(s("path", { d }));
  return s(
    "svg",
    {
      className: [className],
      viewBox: "0 0 24 24",
      width: 18,
      height: 18,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
    },
    children,
  );
}
