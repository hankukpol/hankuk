'use client'

import { motion } from 'framer-motion'
import { EASE_IOS, useReducedMotionDuration } from '@/lib/motion'

export default function Template({ children }: { children: React.ReactNode }) {
  const duration = useReducedMotionDuration(0.35)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, ease: EASE_IOS }}
    >
      {children}
    </motion.div>
  )
}
