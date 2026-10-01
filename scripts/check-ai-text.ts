import assert from "node:assert/strict";
import {
  protectText,
  restoreProtected,
  wordDiff,
  proseText,
  parseMetadata,
  sectionChanges,
} from "../src/lib/ai-text";
import { richTextToMarkdown } from "../src/lib/rich-text";

const fixtures = [
  "正文错别字\n\n```mermaid\nflowchart TD\nA --> B\n```\n\n继续正文",
  "正文\n\n```terminal\nCPU Model: x86\n$ code\n```",
  "段落\n\n$$x=1$$\n\n公式 $a+b$ 和 `code`",
  "正文\n\n::card[https://example.com]\n\n正文",
  "正文\n\nNodeQuality 报告\nCPU Model: 测试\n########\n\n其他文字",
  "正文\n\n```echarts\n{series: [{data:[1]}]}\n```",
  "正文\n\n~~~chart bar\n指标,分数\nCPU,1\n~~~",
  "正文\n\n```未关闭\n$test$\n正文",
  "终端\n\n```text\nCheck.Place\n系统信息\n```\n\n保留下一节",
];
for (const source of fixtures) {
  const protectedText = protectText(source);
  assert.ok(protectedText.pieces.length);
  assert.equal(restoreProtected(protectedText.text, protectedText), source);
  assert.throws(() =>
    restoreProtected(protectedText.text.replace(protectedText.pieces[0].token, ""), protectedText),
  );
  assert.throws(() =>
    restoreProtected(protectedText.text + protectedText.pieces[0].token, protectedText),
  );
  assert.throws(() =>
    restoreProtected(
      protectedText.text.replace(protectedText.pieces[0].token, "__BLOG_AI_KEEP_bad__"),
      protectedText,
    ),
  );
}
const parts = protectText("先 `code` 再 $$formula$$ 后\n\n```chart\nx,y\n```");
assert.equal(parts.pieces.length, 3);
assert.equal(
  restoreProtected(parts.text, parts),
  "先 `code` 再 $$formula$$ 后\n\n```chart\nx,y\n```",
);
const diff = wordDiff("今天我们学习写作。", "今天我们认真学习写作。");
assert.equal(
  diff
    .filter((part) => part.kind !== "add")
    .map((part) => part.text)
    .join(""),
  "今天我们学习写作。",
);
assert.equal(
  diff
    .filter((part) => part.kind !== "remove")
    .map((part) => part.text)
    .join(""),
  "今天我们认真学习写作。",
);
assert.ok(diff.some((part) => part.kind === "same" && part.text.includes("学习")));
assert.equal(proseText("标题\n正文"), proseText("# 标题\n\n正文"));
assert.notEqual(proseText("原来文字"), proseText("新的文字"));
assert.throws(() => parseMetadata('{"slug":"恶意","tags":[]}', []));
assert.throws(() =>
  parseMetadata(
    JSON.stringify({
      excerpt: "摘要",
      seoDescription: "介绍",
      slug: "valid-slug",
      tags: [],
      categoryId: 99,
    }),
    [],
  ),
);
assert.equal(
  parseMetadata(
    JSON.stringify({
      excerpt: "摘要",
      seoDescription: "介绍",
      slug: "valid-slug",
      tags: ["已有标签"],
      categoryId: 1,
    }),
    [{ id: 1 }],
  ).slug,
  "valid-slug",
);
assert.equal(sectionChanges("# A\n错字\n# B\n错字", "# A\n正确\n# B\n正确").length, 2);
for (const [name, html] of [
  [
    "网页",
    '<h1>标题</h1><p>段落 <strong>粗体</strong> <a href="https://example.com">链接</a></p><ul><li>一<ul><li>子项</li></ul></li></ul><img src="https://example.com/a.png" alt="说明"><pre><code class="language-js">const x = 1;\n</code></pre><table><tr><th>名称</th><th>值</th></tr><tr><td>CPU</td><td>1</td></tr></table>',
  ],
  [
    "Word",
    '<div class="WordSection1"><h1><span>标题</span></h1><p class="MsoNormal">段落 <b>粗体</b> <a href="https://example.com">链接</a></p><ul><li>一</li></ul><img src="https://example.com/a.png" alt="说明"><pre>const x = 1;</pre><table><tr><td>名称</td><td>值</td></tr><tr><td>CPU</td><td>1</td></tr></table></div>',
  ],
  [
    "飞书",
    '<section><h1>标题</h1><div>段落 <strong>粗体</strong><a href="https://example.com">链接</a></div><ol><li>一</li></ol><img src="https://example.com/a.png" alt="说明"><pre><code>const x = 1;</code></pre><table><tbody><tr><th>名称</th><th>值</th></tr><tr><td>CPU</td><td>1</td></tr></tbody></table></section>',
  ],
  [
    "公众号",
    '<section><h1>标题</h1><p>段落 <strong>粗体</strong><a href="https://example.com">链接</a></p><ul><li>一</li></ul><img data-src="https://example.com/a.png" alt="说明"><pre>const x = 1;</pre><table><tr><td>名称</td><td>值</td></tr><tr><td>CPU</td><td>1</td></tr></table></section>',
  ],
]) {
  const md = richTextToMarkdown(html);
  for (const snippet of [
    "# 标题",
    "段落",
    "**粗体**",
    "[链接](https://example.com)",
    "一",
    "![说明](https://example.com/a.png)",
    "const x = 1;",
    "| CPU | 1 |",
    "| --- | --- |",
    "```",
  ])
    assert.ok(md.includes(snippet), `${name}: ${snippet}`);
}
assert.ok(
  !richTextToMarkdown(
    '<script>alert(1)</script><p>正常<a href="javascript:alert(1)">链接</a></p>',
  ).includes("javascript"),
);
assert.equal(
  richTextToMarkdown("<pre><code>line1\n\n\nline2\n</code></pre>"),
  "```\nline1\n\n\nline2\n```",
);
assert.equal(
  richTextToMarkdown(
    '<p class="MsoListParagraph">• 第一项</p><p class="MsoListParagraph">2. 第二项</p>',
  ),
  "- 第一项\n\n2. 第二项",
);
console.log(
  "AI 文本回归通过：保护内容逐字恢复、损坏拒绝、中文分词、分节差异、信息校验、4 类富文本结构转换。",
);
