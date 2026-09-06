'use client'

import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'

export type AdminActionMenuItem = {
  id: string
  label: string
  description?: string
  disabled?: boolean
  danger?: boolean
  onSelect?: () => void
  href?: string
}

type AdminActionMenuProps = {
  label: string
  items: readonly AdminActionMenuItem[]
  contextLabel?: string
  portalled?: boolean
}

const isModifiedClick = (event: MouseEvent<HTMLElement>) =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

export function AdminActionMenu({ label, items, contextLabel, portalled = false }: AdminActionMenuProps) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{top:number;left:number;maxHeight:number} | null>(null)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const pendingFocusIndexRef = useRef<number | null>(null)
  const enabledIndices = useMemo(
    () => items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0),
    [items],
  )

  const focusTrigger = () => triggerRef.current?.focus({ preventScroll: true })
  const focusItem = (index: number) => itemRefs.current[index]?.focus({ preventScroll: true })
  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) focusTrigger()
  }
  const selectItem = (item: AdminActionMenuItem) => {
    if (item.disabled) return
    close(true)
    item.onSelect?.()
  }
  const focusByKey = (key: string) => {
    if (enabledIndices.length === 0) return
    const activeIndex = itemRefs.current.findIndex((node) => node === document.activeElement)
    const activePosition = enabledIndices.indexOf(activeIndex)
    let nextPosition = 0

    if (key === 'ArrowUp') nextPosition = activePosition <= 0 ? enabledIndices.length - 1 : activePosition - 1
    else if (key === 'End') nextPosition = enabledIndices.length - 1
    else if (key !== 'Home' && activePosition >= 0) nextPosition = (activePosition + 1) % enabledIndices.length

    focusItem(enabledIndices[nextPosition])
  }

  useEffect(() => {
    if (!open) return

    const handleOutsidePress = (event: globalThis.MouseEvent | TouchEvent) => {
      const target = event.target
      if (target instanceof Node && (wrapperRef.current?.contains(target) || panelRef.current?.contains(target))) return
      setOpen(false)
    }
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener('mousedown', handleOutsidePress, true)
    document.addEventListener('touchstart', handleOutsidePress, true)
    document.addEventListener('keydown', handleDocumentKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', handleOutsidePress, true)
      document.removeEventListener('touchstart', handleOutsidePress, true)
      document.removeEventListener('keydown', handleDocumentKeyDown, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portalled || !triggerRef.current || !panelRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 32)
    const below = window.innerHeight - rect.bottom - 24
    const above = rect.top - 24
    const height = Math.min(panelRef.current.scrollHeight, 480)
    const upward = below < height && above > below
    const available = Math.max(44, upward ? above : below)
    setPosition({
      top: upward ? Math.max(16, rect.top - 8 - Math.min(height, available)) : rect.bottom + 8,
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      maxHeight: available,
    })
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open, portalled])

  useEffect(() => {
    if (!open || pendingFocusIndexRef.current === null) return
    itemRefs.current[pendingFocusIndexRef.current]?.focus({ preventScroll: true })
    pendingFocusIndexRef.current = null
  }, [open])

  const openAndFocus = (index: number) => {
    pendingFocusIndexRef.current = index
    setOpen(true)
  }
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    if (open) return focusByKey(event.key)

    const firstIndex = event.key === 'ArrowUp' || event.key === 'End'
      ? enabledIndices[enabledIndices.length - 1]
      : enabledIndices[0]
    if (firstIndex !== undefined) openAndFocus(firstIndex)
  }
  const handleItemKeyDown = (event: KeyboardEvent<HTMLElement>, item: AdminActionMenuItem) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      focusByKey(event.key)
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (item.href && event.key === ' ') {
      event.preventDefault()
      event.currentTarget.click()
      return
    }
    if (item.href && event.key === 'Enter') return
    event.preventDefault()
    selectItem(item)
  }
  const handleWrapperBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (!open || (nextTarget instanceof Node && (event.currentTarget.contains(nextTarget) || panelRef.current?.contains(nextTarget)))) return
    setOpen(false)
  }
  const renderContent = (item: AdminActionMenuItem) => (
    <>
      <span>{item.label}</span>
      {item.description ? <span className="admin-action-menu-description">{item.description}</span> : null}
    </>
  )

  const panel = open ? (
        <div ref={panelRef} id={menuId} className="admin-action-menu-panel" role="menu" aria-label={contextLabel ? `${contextLabel} ${label}` : label}
          style={portalled ? {position:'fixed',right:'auto',...position,visibility:position ? 'visible' : 'hidden'} : undefined}>
          {contextLabel ? <p className="admin-action-menu-context" role="presentation">{contextLabel}</p> : null}
          {items.map((item, index) => {
            const ref = (node: HTMLElement | null) => {
              itemRefs.current[index] = node
            }
            const shared = {
              role: 'menuitem' as const,
              className: 'admin-action-menu-item',
              'data-danger': item.danger ? 'true' : undefined,
              'aria-disabled': item.disabled ? true : undefined,
              onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleItemKeyDown(event, item),
            }

            return item.href && !item.disabled ? (
              <a
                key={item.id}
                {...shared}
                ref={ref}
                href={item.href}
                onClick={(event) => {
                  if (!isModifiedClick(event)) selectItem(item)
                }}
              >
                {renderContent(item)}
              </a>
            ) : (
              <button
                key={item.id}
                {...shared}
                ref={ref}
                type="button"
                disabled={item.disabled}
                onClick={(event) => {
                  event.preventDefault()
                  selectItem(item)
                }}
              >
                {renderContent(item)}
              </button>
            )
          })}
        </div>
      ) : null
  const portalRoot = portalled ? wrapperRef.current?.closest('.admin-shell') : null

  return (
    <div className="admin-action-menu" ref={wrapperRef} onBlur={handleWrapperBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="admin-action-menu-trigger"
        aria-label={contextLabel ? `${contextLabel} ${label}` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {portalRoot ? createPortal(panel, portalRoot) : panel}
    </div>
  )
}
