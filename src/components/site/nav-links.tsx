"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type NavItem = { label: string; href: string };

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/page/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

const spring = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

export function NavLinks({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav
      aria-label="主导航"
      onMouseLeave={() => setHovered(null)}
      className={cn("items-center gap-0.5", className)}
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const external = /^https?:\/\//.test(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            onMouseEnter={() => setHovered(item.href)}
            onFocus={() => setHovered(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-3.5 py-1.5 text-[0.9rem] tracking-wide transition-colors duration-300 outline-none",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <AnimatePresence>
              {hovered === item.href && (
                <motion.span
                  layoutId="nav-hover"
                  className="absolute inset-0 -z-10 rounded-full bg-foreground/[0.06]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={spring}
                />
              )}
            </AnimatePresence>
            {item.label}
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-x-3.5 -bottom-1 h-[2px] rounded-full bg-brand"
                transition={spring}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
