"use client";

import Link, { type LinkProps } from "next/link";
import { useState } from "react";

/**
 * 悬停时才完整预取：点击时页面已就绪，共享元素变形能在同一次提交中完成
 */
export function PostLink({
  children,
  ...props
}: LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: React.ReactNode;
  }) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : false}
      onMouseEnter={(e) => {
        setIntent(true);
        props.onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        props.onFocus?.(e);
      }}
    >
      {children}
    </Link>
  );
}
