import { cn } from "cn";

/** 与页面加载骨架同一种墨色占位（带一道扫过的柔光） */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("sk rounded-md", className)} {...props} />;
}

export { Skeleton };
