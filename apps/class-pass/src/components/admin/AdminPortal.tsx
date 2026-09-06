'use client'

import { createPortal } from 'react-dom'

/** Keep overlays in the administrator theme without extending its CSS to body. */
export function AdminPortal({ children }: { children: React.ReactNode }) {
  const root = typeof document === 'undefined' ? null : document.getElementById('admin-portal-root')
  // Standalone/SSR consumers stay inline; never escape their theme into document.body.
  return <>{root ? createPortal(children, root) : children}</>
}
