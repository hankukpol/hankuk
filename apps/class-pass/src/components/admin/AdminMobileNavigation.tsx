'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

/** Disclosure, not a modal: collapsed links are unmounted and never tab stops. */
export function AdminMobileNavigation({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
    }
  }, [open])
  return <div ref={container} className="admin-mobile-navigation lg:hidden" onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus()
  }}>
    <button ref={trigger} type="button" className="admin-button" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />} 관리자 메뉴
    </button>
    {open && <nav id={id} className="admin-mobile-nav" aria-label="모바일 관리자 메뉴" onClick={event => {
      if ((event.target as HTMLElement).closest('a')) setOpen(false)
    }}>{children}</nav>}
  </div>
}
