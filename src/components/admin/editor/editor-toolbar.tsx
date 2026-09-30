"use client";

import type { EditorView } from "@codemirror/view";
import {
  BoldIcon,
  CodeIcon,
  FileCodeIcon,
  Heading2Icon,
  Heading3Icon,
  ImagePlusIcon,
  InfoIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PanelsTopLeftIcon,
  QuoteIcon,
  ScissorsIcon,
  SigmaIcon,
  SquareTerminalIcon,
  StrikethroughIcon,
  TableIcon,
} from "lucide-react";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { insertBlock, insertLink, setHeading, toggleLinePrefix, wrap } from "./commands";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Btn({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && (
          <span className="ml-2 opacity-60">{shortcut.replace("Mod", isMac() ? "⌘" : "Ctrl")}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const Sep = () => <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />;

const CALLOUTS = [
  { type: "tip", label: "提示" },
  { type: "info", label: "信息" },
  { type: "warning", label: "注意" },
  { type: "danger", label: "危险" },
  { type: "success", label: "完成" },
  { type: "details", label: "折叠内容" },
];

export function EditorToolbar({
  getView,
  onPickImages,
  className,
}: {
  getView: () => EditorView | null;
  onPickImages: (files: File[]) => void;
  className?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const run = (fn: (v: EditorView) => void) => () => {
    const v = getView();
    if (v) fn(v);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      <Btn label="二级标题" onClick={run((v) => setHeading(v, 2))}>
        <Heading2Icon />
      </Btn>
      <Btn label="三级标题" onClick={run((v) => setHeading(v, 3))}>
        <Heading3Icon />
      </Btn>
      <Sep />
      <Btn label="加粗" shortcut="Mod+B" onClick={run((v) => wrap(v, "**"))}>
        <BoldIcon />
      </Btn>
      <Btn label="斜体" shortcut="Mod+I" onClick={run((v) => wrap(v, "*"))}>
        <ItalicIcon />
      </Btn>
      <Btn label="删除线" shortcut="Mod+Shift+X" onClick={run((v) => wrap(v, "~~"))}>
        <StrikethroughIcon />
      </Btn>
      <Btn label="行内代码" shortcut="Mod+E" onClick={run((v) => wrap(v, "`", "`", "code"))}>
        <CodeIcon />
      </Btn>
      <Btn label="链接" shortcut="Mod+K" onClick={run(insertLink)}>
        <LinkIcon />
      </Btn>
      <Sep />
      <Btn label="引用" onClick={run((v) => toggleLinePrefix(v, "> ", /^>\s?/))}>
        <QuoteIcon />
      </Btn>
      <Btn label="无序列表" onClick={run((v) => toggleLinePrefix(v, "- ", /^[-*+]\s+(?!\[)/))}>
        <ListIcon />
      </Btn>
      <Btn
        label="有序列表"
        onClick={run((v) => toggleLinePrefix(v, (i) => `${i + 1}. `, /^\d+\.\s+/))}
      >
        <ListOrderedIcon />
      </Btn>
      <Btn
        label="任务列表"
        onClick={run((v) => toggleLinePrefix(v, "- [ ] ", /^[-*+]\s+\[[ xX]\]\s+/))}
      >
        <ListChecksIcon />
      </Btn>
      <Sep />
      <Btn label="代码块" onClick={run((v) => insertBlock(v, "```ts\n\n```", 3, 5))}>
        <FileCodeIcon />
      </Btn>
      <Btn
        label="表格"
        onClick={run((v) =>
          insertBlock(v, "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |", 2, 5),
        )}
      >
        <TableIcon />
      </Btn>
      <Btn label="公式" onClick={run((v) => insertBlock(v, "$$\nE = mc^2\n$$", 3, 11))}>
        <SigmaIcon />
      </Btn>
      <Btn
        label="标签页"
        onClick={run((v) => {
          const block =
            ":::: tabs\n::: tab-item 标签一\n内容\n:::\n::: tab-item 标签二\n内容\n:::\n::::";
          const start = block.indexOf("标签一");
          insertBlock(v, block, start, start + 3);
        })}
      >
        <PanelsTopLeftIcon />
      </Btn>
      <Btn
        label="终端输出（支持 ANSI 颜色，测评报告可直接粘贴）"
        onClick={run((v) => {
          const block = "```terminal\n粘贴终端输出\n```";
          const start = block.indexOf("粘贴");
          insertBlock(v, block, start, start + 6);
        })}
      >
        <SquareTerminalIcon />
      </Btn>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                aria-label="提示框"
                onMouseDown={(e) => e.preventDefault()}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted [&_svg]:size-4"
              />
            }
          >
            <InfoIcon />
          </TooltipTrigger>
          <TooltipContent>提示框</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-36">
          {CALLOUTS.map((c) => (
            <DropdownMenuItem
              key={c.type}
              onClick={run((v) => {
                const title = c.type === "details" ? "[点击展开]" : "";
                const block = `:::${c.type}${title}\n内容\n:::`;
                const start = block.indexOf("内容");
                insertBlock(v, block, start, start + 2);
              })}
            >
              {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Sep />
      <Btn label="插入图片或附件" onClick={() => fileInput.current?.click()}>
        <ImagePlusIcon />
      </Btn>
      <Btn label="分隔线" onClick={run((v) => insertBlock(v, "---"))}>
        <MinusIcon />
      </Btn>
      <Btn
        label="摘要分隔（之前的内容作为摘要）"
        onClick={run((v) => insertBlock(v, "<!-- more -->"))}
      >
        <ScissorsIcon />
      </Btn>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onPickImages(files);
        }}
      />
    </div>
  );
}
