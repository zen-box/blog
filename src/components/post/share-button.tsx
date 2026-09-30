"use client";

import { CheckIcon, Link2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = location.href.split("#")[0];
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* 用户取消 */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm text-muted-foreground transition-[color,border-color] duration-300 hover:border-foreground/25 hover:text-foreground"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "ok" : "link"}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="grid place-items-center"
        >
          {copied ? (
            <CheckIcon className="size-4 text-[#3e7355] dark:text-[#86c09b]" />
          ) : (
            <Link2Icon className="size-4" />
          )}
        </motion.span>
      </AnimatePresence>
      {copied ? "链接已复制" : "分享"}
    </button>
  );
}
