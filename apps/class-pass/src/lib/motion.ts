'use client'

import { useReducedMotion } from 'framer-motion'

export const SPRING_DRAWER = { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 } as const
export const SPRING_MODAL = { type: 'spring', stiffness: 420, damping: 28, mass: 0.9 } as const
export const SPRING_TAB = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const
export const EASE_IOS = [0.32, 0.72, 0, 1] as const

export function useReducedMotionDuration(normal: number): number {
  const reduced = useReducedMotion()

  return reduced ? 0 : normal
}

export function useMotionConfig() {
  const reduced = useReducedMotion()

  return {
    drawer: reduced ? { duration: 0 } : SPRING_DRAWER,
    modal: reduced ? { duration: 0 } : SPRING_MODAL,
    tab: reduced ? { duration: 0 } : SPRING_TAB,
  }
}
