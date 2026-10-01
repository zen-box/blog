"use client";

import { LoaderIcon, SaveIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** 页面底部的浮动保存条：有未保存的修改时出现 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  label = "保存设置",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  label?: string;
}) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-popover/95 py-2 pr-2 pl-4 text-sm shadow-float backdrop-blur md:left-[calc(50%+var(--sidebar-width,0px)/2)]"
        >
          <span className="text-muted-foreground">有未保存的修改</span>
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="h-8 rounded-lg px-3 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            撤销
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-background hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <SaveIcon className="size-3.5" />
            )}
            {label}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
