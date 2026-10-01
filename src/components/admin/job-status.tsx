import { BanIcon, CheckIcon, Clock3Icon, LoaderIcon, RotateCcwIcon, XIcon } from "lucide-react";

import type { JobStatus } from "@/lib/reader-ai";

/** 后台任务状态：文字、图标和配色（任务页与编辑器的读者 AI 面板共用） */
export const JOB_STATUS: Record<JobStatus, { label: string; icon: React.ReactNode; tone: string }> =
  {
    pending: {
      label: "排队中",
      icon: <Clock3Icon className="size-3.5" />,
      tone: "bg-muted text-muted-foreground",
    },
    running: {
      label: "生成中",
      icon: <LoaderIcon className="size-3.5 animate-spin" />,
      tone: "bg-brand/10 text-brand",
    },
    retry: {
      label: "稍后重试",
      icon: <RotateCcwIcon className="size-3.5" />,
      tone: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    },
    succeeded: {
      label: "已完成",
      icon: <CheckIcon className="size-3.5" />,
      tone: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    },
    failed: {
      label: "失败",
      icon: <XIcon className="size-3.5" />,
      tone: "bg-destructive/10 text-destructive",
    },
    cancelled: {
      label: "已取消",
      icon: <BanIcon className="size-3.5" />,
      tone: "bg-muted text-subtle",
    },
  };

export const ACTIVE_JOB: JobStatus[] = ["pending", "running", "retry"];
