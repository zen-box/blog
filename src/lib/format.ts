/** 站点时区：Docker 容器默认是 UTC，这里统一按站点时区显示 */
export const SITE_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Shanghai";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("zh-CN", { timeZone: SITE_TIMEZONE, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

type DateInput = Date | number | string | null | undefined;
const toDate = (d: DateInput) => (d == null ? null : d instanceof Date ? d : new Date(d));

function parts(d: Date) {
  const p = fmt({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** 2026年9月18日 */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  return fmt({ year: "numeric", month: "long", day: "numeric" }).format(d);
}

/** 2026-09-18 */
export function formatDateISO(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 2026-09-18 14:30 */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 09-18 */
export function formatMonthDay(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "";
  const p = parts(d);
  return `${p.month}-${p.day}`;
}

export function yearOf(input: DateInput): number {
  const d = toDate(input);
  return d ? Number(parts(d).year) : 0;
}

/** 刚刚 / 5 分钟前 / 3 天前 / 超过一个月显示日期 */
export function formatRelative(input: DateInput, now = Date.now()): string {
  const d = toDate(input);
  if (!d) return "";
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(d);
}

/** 1234 → 1,234；12345 → 1.2 万 */
export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万`;
  return n.toLocaleString("zh-CN");
}

/** 自某个日期（YYYY-MM-DD）起经过的天数，日期无效时返回 null */
export function daysSince(date: string): { days: number; year: number } | null {
  const start = new Date(`${date}T00:00:00`);
  if (!date || Number.isNaN(start.getTime())) return null;
  return {
    days: Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000)),
    year: yearOf(start),
  };
}

/** 数据库保存的日期 key（站点时区），用于访问统计 */
export function dayKey(input: DateInput = new Date()): string {
  return formatDateISO(input);
}
