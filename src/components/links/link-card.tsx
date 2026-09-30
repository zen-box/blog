"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function LinkAvatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-brand-soft font-serif font-semibold text-brand",
          className,
        )}
      >
        {Array.from(name.trim())[0] ?? "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
    />
  );
}

export function LinkCard({
  name,
  url,
  avatar,
  description,
}: {
  name: string;
  url: string;
  avatar: string | null;
  description: string | null;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="group/link flex h-full items-center gap-4 rounded-2xl border border-border/80 bg-card/60 p-4 transition-[translate,box-shadow,border-color,background-color] duration-500 ease-out-expo hover:-translate-y-1 hover:border-transparent hover:bg-card hover:shadow-soft"
    >
      <LinkAvatar
        src={avatar}
        name={name}
        className="size-12 text-lg ring-1 ring-border transition-transform duration-700 ease-out-expo group-hover/link:scale-105 group-hover/link:rotate-[8deg]"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground transition-colors group-hover/link:text-brand">
          {name}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[0.82rem] leading-relaxed text-muted-foreground">
          {description || url.replace(/^https?:\/\//, "")}
        </span>
      </span>
    </a>
  );
}
