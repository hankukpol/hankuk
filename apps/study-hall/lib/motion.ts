import type { Transition } from "framer-motion";

/**
 * DESIGN.md 6절 — 공유 모션.
 * 위치는 transform, 투명도는 opacity로 처리한다.
 * 정적 운영 화면에 장식 애니메이션을 추가하지 않는다.
 */
export const DRAWER_SPRING: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.9,
};

export const MODAL_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 28,
  mass: 0.9,
};

export const TAB_SPRING: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.8,
};

export const OVERLAY_FADE: Transition = {
  duration: 0.15,
  ease: "easeOut",
};

/** reduced-motion 이면 전환 시간을 0으로 만든다. */
export function withReducedMotion(
  transition: Transition,
  shouldReduceMotion: boolean | null,
): Transition {
  return shouldReduceMotion ? { duration: 0 } : transition;
}
