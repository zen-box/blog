import { cn } from "@/lib/utils";

/** 一块墨色占位（默认是一行文字的胶囊形） */
export function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn("sk rounded-full", className)} style={style} />;
}

/** 一组占位，延迟后淡入；i 越大越晚出现 */
export function BoneRow({
  i = 0,
  className,
  children,
}: {
  i?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("sk-row", className)} style={{ "--i": i } as React.CSSProperties}>
      {children}
    </div>
  );
}

/** 几行段落文字，宽度按百分比给出，最后一行通常较短 */
export function BoneLines({
  widths,
  className,
  lineClassName = "h-3.5",
}: {
  widths: number[];
  className?: string;
  lineClassName?: string;
}) {
  return (
    <div className={cn("space-y-3.5", className)}>
      {widths.map((w, i) => (
        <Bone key={i} className={lineClassName} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** 加载区域的外层：读屏软件只读到「正在加载」，占位都是空元素 */
export function PendingRegion({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className} style={style}>
      <span className="sr-only">正在加载</span>
      {children}
    </div>
  );
}
