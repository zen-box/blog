import { cn } from "@/lib/utils";

/** 后台页面的统一容器：标题、说明与操作区 */
export function AdminPage({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", className)}>
      {(title || actions) && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            {title && (
              <h2 className="font-serif text-2xl font-semibold tracking-wide text-foreground">
                {title}
              </h2>
            )}
            {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
          {title && <h3 className="text-sm font-medium text-foreground">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
