"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { type BrandView, BrandMark } from "./brand-mark";
import { MobileMenu } from "./mobile-menu";
import { NavLinks, type NavItem } from "./nav-links";
import { SearchTrigger } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";

export function HeaderShell({ brand, nav }: { brand: BrandView; nav: NavItem[] }) {
  const title = brand.title;
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 8);
    if (y < 160) setHidden(false);
    else if (y > prev + 6) setHidden(true);
    else if (y < prev - 6) setHidden(false);
  });

  return (
    <motion.header
      data-scrolled={scrolled || undefined}
      initial={false}
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group/header fixed inset-x-0 top-0 z-50 h-(--header-h)"
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-500",
          "group-data-scrolled/header:border-border/70 group-data-scrolled/header:bg-background/75 group-data-scrolled/header:backdrop-blur-xl group-data-scrolled/header:backdrop-saturate-150",
        )}
      />
      <div className="relative container-page flex h-full items-center gap-6">
        <Link
          href="/"
          className="group/logo flex items-center gap-2.5"
          aria-label={`${title} 首页`}
        >
          <BrandMark brand={brand} />
          {brand.showTitle && (
            <span className="font-serif text-[1.07rem] font-semibold tracking-[0.08em] text-foreground transition-colors duration-300 group-hover/logo:text-brand">
              {title}
            </span>
          )}
        </Link>

        <NavLinks items={nav} className="ml-auto hidden md:flex" />

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <SearchTrigger />
          <ThemeToggle />
          <MobileMenu items={nav} title={title} />
        </div>
      </div>
    </motion.header>
  );
}
