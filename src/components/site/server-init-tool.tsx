"use client";

import { CheckIcon, ClipboardIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";

export function ServerInitTool({ command, script }: { command: string; script: string }) {
  const [copied, setCopied] = useState<"command" | "script" | null>(null);

  async function copy(value: string, type: "command" | "script") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard permissions can be unavailable in an insecure context.
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TerminalIcon className="size-4 text-brand" />
          一行命令
        </div>
        <div className="mt-3 flex items-stretch gap-2 rounded-xl bg-foreground px-3 py-2 text-sm text-background">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre py-1 font-mono text-[0.78rem] leading-6">
            {command}
          </code>
          <button
            type="button"
            onClick={() => copy(command, "command")}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-background/70 transition-colors hover:bg-background/10 hover:text-background"
            aria-label="复制一行命令"
            title="复制一行命令"
          >
            {copied === "command" ? (
              <CheckIcon className="size-4" />
            ) : (
              <ClipboardIcon className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          下载后直接交给 Bash 执行。脚本会在终端里显示菜单，建议逐项确认；需要 root 权限时由 sudo 提示输入密码。
        </p>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">脚本源码</h2>
            <p className="mt-1 text-sm text-muted-foreground">当前版本内容，便于运行前快速查看。</p>
          </div>
          <button
            type="button"
            onClick={() => copy(script, "script")}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied === "script" ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <ClipboardIcon className="size-3.5" />
            )}
            复制源码
          </button>
        </div>
        <pre className="max-h-[38rem] overflow-auto bg-[#17191d] p-4 text-[0.72rem] leading-5 text-[#e4e7eb] sm:p-6 sm:text-xs">
          <code>{script}</code>
        </pre>
      </section>
    </>
  );
}
