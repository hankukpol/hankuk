'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { mountModalDialog } from './modal-dialog-controller'

type Options = { open: boolean; onClose: () => void; closeDisabled?: boolean; priority?: number }

/** One lifecycle for central dialogs and drawers, including asynchronously rendered panels. */
export function useModalDialog<T extends HTMLElement = HTMLDivElement>(options: Options) {
  const [panel, setPanel] = useState<T | null>(null)
  const latest = useRef(options)
  // Only committed callbacks/guards may be observed by the active dialog.
  useLayoutEffect(() => { latest.current = options })
  const ref = useCallback((element: T | null) => { setPanel(element) }, [])

  useLayoutEffect(() => {
    if (!options.open || !panel) return
    return mountModalDialog(panel, {
      onClose: () => latest.current.onClose(),
      get closeDisabled() { return latest.current.closeDisabled },
      get priority() { return latest.current.priority },
    })
  }, [options.open, panel])

  return ref
}
