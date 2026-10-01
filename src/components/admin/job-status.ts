import type { JobStatus } from "@/lib/reader-ai";
export const READER_JOB_LABELS: Record<JobStatus, string> = {
  pending: "待执行",
  running: "生成中",
  retry: "稍后重试",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};
