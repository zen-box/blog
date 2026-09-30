"use client";

import { useRef } from "react";

import { useImageZoom } from "@/components/post/image-zoom";
import { FadeImage } from "@/components/site/fade-image";
import { cn } from "@/lib/utils";

export type MomentImageView = {
  /** 原图的实际访问地址 */
  url: string;
  /** 缩略图的实际访问地址 */
  thumb: string;
  width: number;
  height: number;
  placeholder?: string;
};

/** 说说配图：1 张按原比例显示，多张为九宫格；点击放大 */
export function MomentImages({ images }: { images: MomentImageView[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const zoom = useImageZoom();
  if (!images.length) return null;
  const single = images.length === 1;
  const cols = images.length === 2 || images.length === 4 ? 2 : 3;

  function open(index: number) {
    const list = Array.from(ref.current?.querySelectorAll<HTMLImageElement>("img") ?? []);
    if (list[index]) zoom.open(list, index);
  }

  return (
    <>
      <div
        ref={ref}
        className={cn("mt-3 grid gap-1.5", single ? "max-w-sm" : "max-w-md")}
        style={single ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => open(i)}
            aria-label={`查看第 ${i + 1} 张图片`}
            className={cn(
              "group/img relative cursor-zoom-in overflow-hidden rounded-xl bg-muted",
              !single && "aspect-square",
            )}
            style={{
              ...(single && img.width && img.height
                ? { aspectRatio: `${img.width} / ${Math.min(img.height, img.width * 1.4)}` }
                : null),
              ...(img.placeholder
                ? { backgroundImage: `url(${img.placeholder})`, backgroundSize: "cover" }
                : null),
            }}
          >
            <FadeImage
              src={single ? img.url : img.thumb}
              data-full={img.url}
              width={img.width || undefined}
              height={img.height || undefined}
              loading="lazy"
              className="size-full object-cover transition-transform duration-700 ease-out-expo group-hover/img:scale-[1.04]"
            />
          </button>
        ))}
      </div>
      {zoom.element}
    </>
  );
}
