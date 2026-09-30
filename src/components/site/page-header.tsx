import { Stagger } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** 列表类页面的统一标题区 */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const items: React.ReactNode[] = [];
  if (eyebrow) {
    items.push(
      <p
        key="eyebrow"
        className="flex items-center gap-3 text-[0.8rem] tracking-[0.22em] text-muted-foreground"
      >
        <span className="h-px w-8 bg-brand/60" />
        {eyebrow}
      </p>,
    );
  }
  items.push(
    <h1
      key="title"
      className="mt-4 font-serif text-[clamp(1.9rem,4.6vw,2.8rem)] leading-tight font-bold tracking-[0.02em] text-balance text-foreground"
    >
      {title}
    </h1>,
  );
  if (description) {
    items.push(
      <div key="desc" className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-muted-foreground">
        {description}
      </div>,
    );
  }
  if (children) items.push(<div key="extra">{children}</div>);

  return (
    <section className={cn("container-page pt-14 pb-10 sm:pt-20 sm:pb-14", className)}>
      <Stagger>{items}</Stagger>
    </section>
  );
}
