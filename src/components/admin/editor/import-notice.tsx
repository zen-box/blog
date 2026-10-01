"use client";

import { WandSparklesIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";

import { detectImportIssues } from "./import-cleanup";

/** 内容像是从其他平台导出时，在编辑区顶部提示一键整理 */
export function ImportNotice({ content, onClean }: { content: string; onClean: () => void }) {
  const deferred = useDeferredValue(content);
  const issues = useMemo(() => detectImportIssues(deferred), [deferred]);
  const [dismissed, setDismissed] = useState(false);

  const parts: string[] = [];
  if (issues?.escapes) parts.push(`${issues.escapes} 处多余的转义`);
  if (issues?.refImages) parts.push(`${issues.refImages} 张显示不出来的图片`);
  if (issues?.tags) parts.push(`${issues.tags} 个其他平台的标签`);
  const unknown = issues?.unknownTags ?? [];
  const show = !dismissed && (parts.length > 0 || unknown.length > 0);

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="import-notice"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm">
            <WandSparklesIcon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1 leading-relaxed">
              {parts.length > 0 && (
                <p className="text-foreground">内容像是从其他平台导出的：{parts.join("、")}。</p>
              )}
              {unknown.length > 0 && (
                <p className="text-muted-foreground">
                  {unknown.map((t) => `{% ${t} %}`).join("、")}{" "}
                  是其他平台的写法，本站不支持，需要手动修改。
                </p>
              )}
              {parts.length > 0 && (
                <button
                  type="button"
                  onClick={onClean}
                  className="mt-2 inline-flex h-7 items-center rounded-md bg-brand px-2.5 text-xs text-brand-foreground transition-opacity hover:opacity-90"
                >
                  一键整理
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="不再提示"
              onClick={() => setDismissed(true)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
