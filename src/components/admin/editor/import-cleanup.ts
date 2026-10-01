/**
 * 整理从其他平台导出的内容（Typecho、Hexo 主题、富文本编辑器导出的 Markdown 等）：
 * - 富文本导出时多加的转义：行首的 `&#x20;`、`\[`、`\*` 之类的反斜杠
 * - 被转义的引用式图片：`!\[说明]\[1]` 与文末的 `&#x20; \[1]: 地址`
 * - 其他平台的标签：`{% urlcard 网址 %}` → `::card[网址]`，`{% mermaid %}` → mermaid 代码块
 * 只在确实像导出内容时才处理转义，避免误改正常文章里刻意写的转义；代码块里的内容保持不变。
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ENTITY_SPACE = /&#x0*20;|&#0*32;|&nbsp;/gi;
const LEADING_ENTITY = /^(?:&#x0*20;|&#0*32;|&nbsp;)/im;
const ESCAPED_REF = /(?:^|\n)[ \t]*(?:&#x0*20;\s*)?\\\[[^\]\n]+\]:\s*\S/;
const ESCAPED_REF_IMAGE = /!\\\[[^\]\n]*\]\\\[[^\]\n]+\]/;
/** Markdown 里可以被反斜杠转义的标点 */
const ESCAPE = /\\([\\`*_{}[\]()#+\-.!<>|~])/g;
const TAG = /\{%-?\s*([A-Za-z_][\w-]*)([^%]*?)-?%\}/g;

/** 能自动改写的标签 */
const KNOWN_TAGS = new Set(["urlcard", "mermaid", "endmermaid"]);

export type ImportIssues = {
  /** 导出时多加的转义（实体空格、反斜杠） */
  escapes: number;
  /** 被转义、显示不出来的引用式图片 */
  refImages: number;
  /** 能自动改写的标签 */
  tags: number;
  /** 需要手动处理的标签名 */
  unknownTags: string[];
};

/** 内容是否像富文本导出的（出现了导出工具特有的写法） */
function looksExported(text: string): boolean {
  return LEADING_ENTITY.test(text) || ESCAPED_REF.test(text) || ESCAPED_REF_IMAGE.test(text);
}

/** 逐行处理，跳过代码块；返回不在代码块里的行号 */
function proseLines(lines: string[]): boolean[] {
  const prose: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (fence) {
      prose.push(false);
      if (
        m &&
        m[1][0] === fence[0] &&
        m[1].length >= fence.length &&
        !line.slice(m[0].length).trim()
      ) {
        fence = null;
      }
    } else if (m) {
      fence = m[1];
      prose.push(false);
    } else {
      prose.push(true);
    }
  }
  return prose;
}

export function detectImportIssues(text: string): ImportIssues | null {
  const exported = looksExported(text);
  const lines = text.split("\n");
  const prose = proseLines(lines);
  let escapes = 0;
  let refImages = 0;
  let tags = 0;
  const unknown = new Set<string>();
  lines.forEach((line, i) => {
    if (!prose[i]) return;
    if (exported) {
      escapes += (line.match(ENTITY_SPACE)?.length ?? 0) + (line.match(ESCAPE)?.length ?? 0);
      refImages += line.match(new RegExp(ESCAPED_REF_IMAGE.source, "g"))?.length ?? 0;
    }
    for (const m of line.matchAll(TAG)) {
      const name = m[1].toLowerCase();
      if (KNOWN_TAGS.has(name)) tags++;
      else unknown.add(name);
    }
  });
  if (!escapes && !refImages && !tags && !unknown.size) return null;
  return { escapes, refImages, tags, unknownTags: [...unknown] };
}

function unescapeLine(line: string): string {
  return line.replace(ENTITY_SPACE, " ").replace(ESCAPE, "$1");
}

/** 返回整理后的全文；不需要整理时原样返回 */
export function cleanImported(text: string): string {
  const exported = looksExported(text);
  const lines = text.split("\n");
  const prose = proseLines(lines);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!prose[i]) {
      out.push(line);
      continue;
    }
    if (exported) line = unescapeLine(line);

    // {% mermaid %} … {% endmermaid %} → mermaid 代码块（去掉导出时每行之间多出来的空行）
    const open = /^\s*\{%-?\s*mermaid\b[^%]*%\}\s*$/i.exec(line);
    if (open) {
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (/^\s*\{%-?\s*endmermaid\s*-?%\}\s*$/i.test(lines[j])) break;
        body.push(exported ? unescapeLine(lines[j]) : lines[j]);
      }
      if (j < lines.length) {
        out.push("```mermaid", ...body.filter((l) => l.trim()), "```");
        i = j;
        continue;
      }
    }

    line = line.replace(
      /\{%-?\s*urlcard\s+["']?(https?:\/\/[^\s"'%]+)["']?[^%]*-?%\}/gi,
      (_, url: string) => `::card[${url}]`,
    );
    out.push(line);
  }

  // 导出时常在段落之间留下一串空行，最多保留一行（代码块里不动）
  const result: string[] = [];
  const outProse = proseLines(out);
  let blank = 0;
  out.forEach((line, i) => {
    if (outProse[i] && !line.trim()) {
      blank++;
      if (blank > 1) return;
      result.push("");
      return;
    }
    blank = 0;
    result.push(line);
  });
  return result.join("\n");
}
