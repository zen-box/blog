import "server-only";

import type { ImageMeta } from "@/db/schema";
import { thumbUrl } from "@/lib/images";
import { thumbhashToDataUrl } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/server/storage";

import { FadeImage } from "./fade-image";

/**
 * 封面：底层是 thumbhash 模糊占位；
 * progressive 时再垫一层缩略图（从列表进入时已在浏览器缓存中），原图加载后淡入。
 */
export function Cover({
  src,
  meta,
  alt,
  thumb = false,
  progressive = false,
  priority = false,
  className,
  imgClassName,
}: {
  src: string;
  meta?: ImageMeta | null;
  alt: string;
  thumb?: boolean;
  progressive?: boolean;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const layers: string[] = [];
  // 先推导缩略图的逻辑地址，再换成实际访问地址（S3 直链）
  const full = resolveUploadUrl(src);
  const small = thumbUrl(src);
  const smallUrl = small && small !== src ? resolveUploadUrl(small) : null;
  if (progressive && smallUrl) layers.push(`url(${smallUrl})`);
  const placeholder = meta?.thumbhash ? thumbhashToDataUrl(meta.thumbhash) : undefined;
  if (placeholder) layers.push(`url(${placeholder})`);

  return (
    <div
      className={cn("relative overflow-hidden bg-muted", className)}
      style={
        layers.length
          ? {
              backgroundImage: layers.join(","),
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <FadeImage
        src={thumb ? (smallUrl ?? full) : full}
        alt={alt}
        width={meta?.width}
        height={meta?.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className={cn("size-full object-cover", imgClassName)}
      />
    </div>
  );
}
