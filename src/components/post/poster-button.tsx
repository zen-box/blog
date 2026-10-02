"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { posterCard, type ShareSource } from "./share-canvas";
import { ShareImageDialog } from "./share-image";

/** 生成分享海报：封面、标题、摘要和二维码，适合发朋友圈 */
export function PosterButton(
  props: ShareSource & { excerpt: string; cover?: string; meta?: string },
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm text-muted-foreground transition-[color,border-color] duration-300 hover:border-foreground/25 hover:text-foreground"
      >
        <ImageIcon className="size-4" />
        海报
      </button>
      <ShareImageDialog
        open={open}
        onOpenChange={setOpen}
        title="分享海报"
        description="扫码就能读到这篇文章，适合发朋友圈或群聊。"
        filename={`海报-${props.title}.png`}
        render={() => posterCard(props)}
      />
    </>
  );
}
