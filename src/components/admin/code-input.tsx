"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const LENGTH = 6;

/**
 * 6 位动态码输入框：一个透明的原生输入框盖在 6 个格子上，
 * 粘贴、短信/密码管理器自动填充、移动端数字键盘都按原生行为工作
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 输满 6 位时调用，可以直接提交 */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, LENGTH - 1);

  // 验证期间输入框被禁用会失去焦点；验证失败恢复可用后重新聚焦，方便直接重输
  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus();
  }, [autoFocus, disabled]);

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
          onChange(digits);
          if (digits.length === LENGTH && digits !== value) onComplete?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        spellCheck={false}
        disabled={disabled}
        aria-label="6 位动态码"
        aria-invalid={invalid || undefined}
        // 16px 字号避免 iOS 聚焦时自动放大页面
        className="absolute inset-0 z-10 w-full cursor-text text-base opacity-0 disabled:cursor-not-allowed"
      />
      <div aria-hidden className="flex items-center gap-2">
        {Array.from({ length: LENGTH }, (_, i) => {
          const char = value[i];
          const current = focused && !disabled && i === active && !(i === LENGTH - 1 && char);
          return (
            <div
              key={i}
              className={cn(
                "grid h-12 min-w-0 flex-1 place-items-center rounded-xl border bg-background font-mono text-xl font-medium tabular-nums transition-[border-color,box-shadow] duration-200",
                // 3 + 3 分组，和身份验证器里的显示一致
                i === LENGTH / 2 && "ml-2",
                current ? "border-brand ring-3 ring-brand/15" : "border-border",
                invalid && !current && "border-destructive/60",
                disabled && "opacity-60",
              )}
            >
              {char ? (
                <motion.span
                  key={char}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {char}
                </motion.span>
              ) : (
                current && <span className="h-5 w-px animate-caret-blink bg-foreground" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
