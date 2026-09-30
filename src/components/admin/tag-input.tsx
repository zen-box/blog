"use client";

import { XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/** 标签输入：回车或逗号添加，退格删除最后一个，输入时提示已有标签 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "输入后按回车添加",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [suggestions, text, value]);

  function add(raw: string) {
    const tags = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter((t) => t && !value.includes(t));
    if (tags.length) onChange([...value, ...tags]);
    setText("");
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-[border-color,box-shadow] dark:bg-input/30",
          focused && "border-ring ring-3 ring-ring/50",
        )}
      >
        <AnimatePresence initial={false}>
          {value.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="inline-flex items-center gap-1 rounded-md bg-brand-soft py-0.5 pr-1 pl-2 text-xs text-brand"
            >
              {tag}
              <button
                type="button"
                aria-label={`移除 ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="grid size-4 place-items-center rounded opacity-60 transition-opacity hover:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,，]$/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
          placeholder={value.length ? "" : placeholder}
          className="h-6 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {focused && matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-float">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              # {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
