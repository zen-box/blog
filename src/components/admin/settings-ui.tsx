import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border bg-card">
      <div className="border-b border-border/70 px-5 py-4">
        <h3 className="font-medium text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-5 px-5 py-5">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", !wide && "md:grid-cols-[10rem_1fr] md:items-start md:gap-6")}>
      <div className="md:pt-1.5">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
