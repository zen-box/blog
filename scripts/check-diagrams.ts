import assert from "node:assert/strict";
import { fromHtml } from "hast-util-from-html";

import { diagramErrorLine } from "../src/lib/markdown/diagram-errors";
import { renderMarkdown } from "../src/lib/markdown";

function elements(html: string, tag: string) {
  const found: { properties: Record<string, unknown>; children: unknown[] }[] = [];
  function walk(node: ReturnType<typeof fromHtml> | object) {
    const n = node as {
      tagName?: string;
      properties?: Record<string, unknown>;
      children?: object[];
    };
    if (n.tagName === tag)
      found.push({ properties: n.properties ?? {}, children: n.children ?? [] });
    n.children?.forEach(walk);
  }
  walk(fromHtml(html, { fragment: true }));
  return found;
}

async function main() {
  assert.equal(diagramErrorLine("Parse error on line 3:", "graph TD\nA --> B\nB ->"), 3);
  assert.equal(diagramErrorLine("Parse error on line 3:", "flowchart TD\nA[没有闭合"), 2);
  assert.equal(diagramErrorLine("Parse error on line 5:", "flowchart LR\n\nA --> B[坏的节点\n"), 3);
  assert.equal(diagramErrorLine("Parse error on line 4:", "flowchart LR\n\nA --> B[坏的节点\n"), 3);
  assert.equal(diagramErrorLine("JSON5: invalid character at 2:5", "{\nx: }"), 2);
  assert.equal(diagramErrorLine("数据第 1 行第 2 列不是数字", "\n机器,分数\n\nA,错"), 4);
  assert.equal(diagramErrorLine("数据第 1 行第 2 列不是数字", "|机器|分数|\n|---|---|\n|A|错|"), 3);
  assert.equal(diagramErrorLine("line 999", "one line"), undefined);

  for (const type of ["bar", "line", "area", "pie", "radar"]) {
    const { html } = await renderMarkdown(
      `\`\`\`chart ${type}\n指标,分数\nCPU,3\n内存,4\n磁盘,5\n\`\`\``,
    );
    const figure = elements(html, "figure").find((n) => n.properties.dataChart);
    assert.ok(figure, `${type}: should produce a chart`);
    assert.equal(JSON.parse(String(figure.properties.dataChart)).type, type);
    assert.equal(elements(html, "table").length, 1, `${type}: accessible data table`);
    assert.ok(figure.properties.dataSource, `${type}: source retained for runtime errors`);
  }

  const csv = await renderMarkdown("```chart bar\n机器,分数\n\nA,错\n```");
  assert.equal(
    elements(csv.html, "span").filter((n) => n.properties.dataErrorLine === "").length,
    1,
  );
  assert.ok(csv.html.includes("不是数字"));
  assert.ok(csv.html.includes("md-diagram-line-number"));

  const json = await renderMarkdown("```echarts\n\n{\n  series: @\n}\n```");
  const highlighted = elements(json.html, "span").filter((n) => n.properties.dataErrorLine === "");
  assert.equal(
    highlighted.length,
    1,
    "JSON5 error includes one highlighted source line, accounting for leading blank line",
  );
  assert.ok(json.html.includes("配置格式不正确"));

  const valid = await renderMarkdown(
    '```echarts\n{ xAxis: {data:["A"]}, yAxis: {}, series: [{type:"bar",data:[1]}] }\n```\n\n```markmap\n# 主题\n- 一级\n  - 二级\n```\n\n```mermaid\ngraph TD\nA --> B\n```',
  );
  assert.ok(valid.html.includes("data-echarts="));
  assert.ok(valid.html.includes("data-markmap="));
  assert.ok(valid.html.includes("data-mermaid"));

  const unsafe = await renderMarkdown(
    "```chart\n机器,分数\n<script>alert(1)</script>,不是数字\n```",
  );
  assert.ok(!unsafe.html.includes("<script>"), "source in error UI is escaped");
  console.log(
    "图表回归检查通过：5 种数据图、错误行定位、JSON5、Mermaid、Markmap、无障碍表格及错误源码转义。",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
