'use client'

import type { ReactNode } from 'react'
import { AdminDrawer } from '@/components/admin/AdminDrawer'

type SeatEditModalProps = {
  open: boolean
  title: string
  badge?: string
  description?: string
  /** Kept for caller compatibility; drawers use the shared responsive width. */
  widthClassName?: string
  children: ReactNode
  footer?: ReactNode
  closeDisabled?: boolean
  onClose: () => void
}

/** Admin-only material/seat editors, attendance reasons and absence detail. */
export function SeatEditModal({ widthClassName: _width, ...props }: SeatEditModalProps) {
  return <AdminDrawer {...props} priority={70} />
}
