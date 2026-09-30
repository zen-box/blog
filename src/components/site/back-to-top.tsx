"use client";

import { ArrowUpIcon } from "lucide-react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useState } from "react";

import { scrollToTop } from "./smooth-scroll";

/** 回到顶部按钮，外圈同时显示阅读进度 */
export function BackToTop() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setVisible(y > 640));

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="回到顶部"
          initial={{ opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 12 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="fixed right-5 bottom-6 z-40 grid size-11 place-items-center rounded-full border border-border/80 bg-card/85 text-muted-foreground shadow-soft backdrop-blur-md transition-colors hover:text-brand md:right-8 md:bottom-8"
        >
          <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <motion.circle
              cx="22"
              cy="22"
              r="20.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-brand"
              style={{ pathLength: progress }}
            />
          </svg>
          <ArrowUpIcon className="size-[1.05rem]" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
