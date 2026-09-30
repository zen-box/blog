"use client";

import { motion, type HTMLMotionProps } from "motion/react";

import { useArrivedByNavigation } from "./navigation-state";

const EASE = [0.16, 1, 0.3, 1] as const;

/** 进入视口时上浮淡入，只播放一次（站内导航进入时跳过，交给页面转场） */
export function Reveal({
  delay = 0,
  y = 18,
  children,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  const skip = useArrivedByNavigation();
  return (
    <motion.div
      initial={skip ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** 首屏元素依次入场 */
export function Stagger({
  children,
  className,
  delay = 0,
  step = 0.08,
}: {
  children: React.ReactNode[];
  className?: string;
  delay?: number;
  step?: number;
}) {
  const skip = useArrivedByNavigation();
  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={skip ? false : { opacity: 0, y: 16, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, delay: delay + i * step, ease: EASE }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
