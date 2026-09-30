import { cn } from "@/lib/utils";

/** 站名首字做成的一枚小印章 */
export function Seal({ text, className }: { text: string; className?: string }) {
  const char = Array.from(text.trim())[0] ?? "拾";
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-7 place-items-center rounded-[0.45rem] bg-brand font-serif text-[0.95rem] font-semibold text-brand-foreground",
        "shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--brand-foreground)_28%,transparent)]",
        "transition-transform duration-500 ease-out-expo group-hover/logo:scale-105 group-hover/logo:-rotate-6",
        className,
      )}
    >
      {char}
    </span>
  );
}
