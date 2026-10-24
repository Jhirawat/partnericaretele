import type { CSSProperties } from "react";

export const MOTION = {
  fast: "140ms",
  normal: "220ms",
  slow: "360ms",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export function motionStyle(delay = 0): CSSProperties {
  return {
    "--motion-duration": MOTION.normal,
    "--motion-ease": MOTION.ease,
    "--motion-delay": `${delay}ms`,
  } as CSSProperties;
}

export function motionClass(kind: "page" | "section" | "card" = "section"): string {
  return `motion-${kind}`;
}
