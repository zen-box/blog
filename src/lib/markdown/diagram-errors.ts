/** 解析器报告的行号转换为图表代码块内的源码行（从 1 开始）。 */
export function diagramErrorLine(message: string, source: string): number | undefined {
  const lines = source.split(/\r?\n/);
  const dataRow = /数据第\s*(\d+)\s*行/.exec(message);
  if (dataRow) {
    const rows = lines
      .map((value, index) => ({ value: value.trim(), number: index + 1 }))
      .filter(({ value }) => value && !(/^[|\s:-]+$/.test(value) && value.includes("-")));
    return rows[Number(dataRow[1])]?.number;
  }
  const match =
    /\bline\s+(\d+)\b/i.exec(message) ??
    /\bat\s+(\d+):\d+\b/i.exec(message) ??
    /第\s*(\d+)\s*行/.exec(message);
  const number = match ? Number(match[1]) : undefined;
  // EOF 可能落在末尾空行或虚拟换行，指向最后一个有内容的源码行。
  if (!number || number > lines.length + 1) return undefined;
  if (number >= lines.length) {
    return Math.max(1, lines.findLastIndex((line) => line.trim().length > 0) + 1);
  }
  return number;
}
