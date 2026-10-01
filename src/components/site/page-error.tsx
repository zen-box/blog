"use client";

import { RotateCcwIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PageError({ retry, home = "/" }: { retry: () => void; home?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-6xl px-4 py-12 md:px-8"
    >
      <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center" role="alert">
        <h2 className="font-serif text-2xl font-semibold text-foreground">页面暂时没有加载成功</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          请稍后再试，或者先返回{home === "/admin" ? "后台" : "首页"}。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={retry}>
            <RotateCcwIcon aria-hidden="true" className="size-4" />
            重试
          </Button>
          <Link
            href={home}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            返回{home === "/admin" ? "后台" : "首页"}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
