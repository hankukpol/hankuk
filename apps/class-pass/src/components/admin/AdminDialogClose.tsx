'use client'

import type { ButtonHTMLAttributes } from 'react'
import { X } from 'lucide-react'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  /** Shared student confirmations retain their original text-only presentation. */
  preserveTextOutsideAdmin?: boolean
}

export function AdminDialogClose({ className = '', preserveTextOutsideAdmin = false, ...props }: Props) {
  return (
    <button {...props} type="button" aria-label={props['aria-label'] ?? '닫기'}
      title={props.title ?? '닫기'} className={`admin-dialog-close ${className}`}>
      <span className={preserveTextOutsideAdmin ? 'admin-dialog-close-label' : 'sr-only'}>닫기</span>
      <X aria-hidden="true" size={20} className={preserveTextOutsideAdmin ? 'admin-dialog-close-icon hidden' : 'admin-dialog-close-icon'} />
    </button>
  )
}
