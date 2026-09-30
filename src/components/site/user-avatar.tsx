"use client";

import { useState, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"img">, "onError" | "src"> & { src?: string; fallback: string };

export function UserAvatar({ src, fallback, alt = "", ...props }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = src && src !== failedSrc ? src : fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={image}
      alt={alt}
      onError={image === fallback ? undefined : () => setFailedSrc(src ?? null)}
    />
  );
}
