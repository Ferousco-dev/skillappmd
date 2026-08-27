"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type BadgeImage = { src: string; alt: string };

export interface ImagesBadgeProps {
  images: BadgeImage[];
  /** Images shown in collapsed state. @default 3 */
  maxVisible?: number;
  /** Additional images revealed on hover. @default 2 */
  revealCount?: number;
  /** Optional text label after the stack. */
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Image shape. @default "rounded" */
  shape?: "circle" | "rounded" | "square";
  className?: string;
  imageClassName?: string;
  onClick?: () => void;
}

// ── Size tokens ───────────────────────────────────────────────────────────────
const CFG = {
  sm: {
    px: 32,
    gap: 8,
    pill: "h-9  pl-2   pr-3.5 gap-2   text-[11px]",
    cnt: "text-[9px]",
  },
  md: {
    px: 42,
    gap: 10,
    pill: "h-11 pl-2.5 pr-4   gap-2.5 text-xs",
    cnt: "text-[10px]",
  },
  lg: {
    px: 56,
    gap: 12,
    pill: "h-14 pl-3   pr-5   gap-3   text-sm",
    cnt: "text-[12px]",
  },
} as const;

const SHAPE: Record<string, string> = {
  circle: "rounded-full",
  rounded: "rounded-[10px]",
  square: "rounded-[4px]",
};

const SPRING = { type: "spring" as const, stiffness: 280, damping: 24 };

// ── Rotation table — gives each card a unique hand-placed feel ────────────────
// Index 0 = back of stack (lowest z), higher index = front
const REST_ROT = [-14, -7, -2, 5, 11, -9, 3, -5] as const;
const HOVER_ROT = [-8, -4, -1, 2, 6, -6, 2, -3] as const;

// ── Arc Y-offset in the spread state (outer cards drop, center stays high) ────
function arcY(i: number, total: number): number {
  if (total <= 1) return 0;
  const mid = (total - 1) / 2;
  const t = (i - mid) / mid; // -1 … 0 … +1
  return t * t * (CFG.md.px * 0.22); // parabola: 0 at centre, ~9px at edges
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ImagesBadge({
  images,
  maxVisible = 3,
  revealCount = 2,
  label,
  size = "md",
  shape = "rounded",
  className,
  imageClassName,
  onClick,
}: ImagesBadgeProps) {
  const [hovered, setHovered] = React.useState(false);
  const reduced = useReducedMotion();

  const { px, gap, pill, cnt } = CFG[size];

  const rendered = images.slice(0, maxVisible + revealCount);
  const overflow = Math.max(0, images.length - maxVisible - revealCount);
  const slots: Array<BadgeImage | null> =
    overflow > 0 ? [...rendered, null] : rendered;
  const total = slots.length;

  // ── Collapsed geometry ───────────────────────────────────────────────────
  // Images heavily overlapped; only maxVisible worth of width consumed
  const peekPx = Math.round(px * 0.32); // how much of each card peeks out
  const collapsedW = px + (Math.min(maxVisible, total) - 1) * peekPx;

  // ── Spread geometry ──────────────────────────────────────────────────────
  const spreadW = total * px + (total - 1) * gap;

  // x position in spread state (left-aligned)
  const spreadX = (i: number) => i * (px + gap);

  // x position in collapsed state — visible cards peek from right; hidden cards hide behind
  const collapsedX = (i: number) => {
    if (i >= maxVisible) return (maxVisible - 1) * peekPx; // stack behind last visible
    return i * peekPx;
  };

  return (
    <motion.div
      className={cn(
        "inline-flex cursor-default select-none items-center rounded-full",
        "border border-border/60 bg-background/90 backdrop-blur-sm",
        "shadow-[0_2px_12px_rgba(0,0,0,.10)] dark:shadow-[0_2px_16px_rgba(0,0,0,.35)]",
        "dark:bg-zinc-900/80 dark:border-white/[0.09]",
        "transition-shadow duration-300",
        "hover:shadow-[0_6px_24px_rgba(0,0,0,.16)] dark:hover:shadow-[0_6px_28px_rgba(0,0,0,.55)]",
        pill,
        onClick && "cursor-pointer",
        className,
      )}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      whileHover={reduced ? undefined : { y: -2, scale: 1.015 }}
      transition={SPRING}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      {/* ── Image strip ──────────────────────────────────────── */}
      <motion.div
        className="relative shrink-0"
        style={{ height: px + 12, width: collapsedW }} // extra height for arc + rotation overflow
        initial={false}
        animate={{
          width: reduced ? collapsedW : hovered ? spreadW : collapsedW,
        }}
        transition={SPRING}
      >
        {slots.map((slot, i) => {
          const isHidden = i >= maxVisible && slot !== null;
          const isOverflow = slot === null;

          const tx = hovered ? spreadX(i) : collapsedX(i);
          const ty = hovered ? arcY(i, total) : 0;
          const rotate = reduced
            ? 0
            : hovered
              ? (HOVER_ROT[i] ?? 0)
              : (REST_ROT[i] ?? 0);
          const opacity = isHidden ? (hovered ? 1 : 0) : 1;
          const scale = isHidden ? (hovered ? 1 : 0.6) : 1;
          // Front-most card has highest z when collapsed; all equal when spread
          const zIdx = hovered ? i + 1 : total - i;

          return (
            <motion.div
              key={i}
              className={cn(
                "absolute top-0 left-0 flex shrink-0 items-center justify-center",
                !isOverflow && "overflow-hidden",
                SHAPE[isOverflow ? "circle" : shape],
                "border-2 border-background dark:border-zinc-900",
                "shadow-[0_2px_8px_rgba(0,0,0,.28)]",
                isOverflow && "bg-muted",
                imageClassName,
              )}
              style={{ width: px, height: px, zIndex: zIdx }}
              initial={false}
              animate={{
                x: reduced ? spreadX(i) : tx,
                y: reduced ? 0 : ty,
                rotate: rotate,
                opacity,
                scale,
              }}
              transition={{
                ...SPRING,
                delay: !reduced && isHidden ? (i - maxVisible) * 0.06 : 0,
              }}
            >
              {isOverflow ? (
                <span
                  className={cn("font-semibold text-muted-foreground", cnt)}
                >
                  +{overflow}
                </span>
              ) : (
                <img
                  src={slot!.src}
                  alt={slot!.alt}
                  width={px}
                  height={px}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Label ─────────────────────────────────────────────── */}
      {label && (
        <span className="whitespace-nowrap font-medium text-foreground/80 dark:text-foreground/70 leading-none">
          {label}
        </span>
      )}
    </motion.div>
  );
}

export default ImagesBadge;
