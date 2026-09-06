'use client'

import { createContext, createElement, useContext, useId, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'

type SectionItem = { value: string; label: string }
const SectionContext = createContext<{ id: string; active: string } | null>(null)

function useSectionContext() {
  const context = useContext(SectionContext)
  if (!context) throw new Error('AdminSectionPanel requires AdminSectionTabs')
  return context
}

/** Panels stay mounted: switching sections must not discard a form or editor draft. */
export function AdminSectionTabs({ label, items, defaultValue, children }: {
  label: string
  items: readonly SectionItem[]
  defaultValue?: string
  children: React.ReactNode
}) {
  const id = useId()
  const [active, setActive] = useState(defaultValue ?? items[0].value)

  function revealInvalidPanel(event: FormEvent<HTMLDivElement>) {
    const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const firstInvalid = field.form?.querySelector('input:invalid, select:invalid, textarea:invalid')
    // A submission can invalidate several panels. Keep the first invalid field visible.
    if (firstInvalid && firstInvalid !== field) {
      event.preventDefault()
      return
    }
    const panel = field.closest<HTMLElement>('[data-admin-section]')
    if (panel?.dataset.adminSectionGroup === id && panel.hidden) {
      flushSync(() => setActive(panel.dataset.adminSection!))
    }
  }

  return createElement(SectionContext.Provider, { value: { id, active } },
      <div className="admin-sections" onInvalidCapture={revealInvalidPanel}>
        <div className="admin-subtabs" role="tablist" aria-label={label}>
          {items.map((item, index) => (
            <button key={item.value} type="button" role="tab"
              id={`${id}-tab-${item.value}`} aria-controls={`${id}-panel-${item.value}`}
              aria-selected={active === item.value} tabIndex={active === item.value ? 0 : -1}
              className="admin-subtab" onClick={() => setActive(item.value)}
              onKeyDown={(event) => {
                let next = index
                if (event.key === 'ArrowRight') next = (index + 1) % items.length
                else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
                else if (event.key === 'Home') next = 0
                else if (event.key === 'End') next = items.length - 1
                else return
                event.preventDefault()
                setActive(items[next].value)
                document.getElementById(`${id}-tab-${items[next].value}`)?.focus()
              }}>
              {item.label}
            </button>
          ))}
        </div>
        {children}
      </div>
  ) as React.ReactElement
}

export function AdminSectionPanel({ value, children, className = '' }: {
  value: string; children: React.ReactNode; className?: string
}) {
  const { id, active } = useSectionContext()
  return (
    <div id={`${id}-panel-${value}`} role="tabpanel" aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0} hidden={active !== value} data-admin-section={value} data-admin-section-group={id}
      className={`admin-section-panel ${className}`}>
      {children}
    </div>
  )
}

/** Shared save action for panels backed by the same form, not independent editors. */
export function AdminSectionActions({ values, children }: { values: readonly string[]; children: React.ReactNode }) {
  const { active } = useSectionContext()
  return <div className="admin-section-actions" hidden={!values.includes(active)}>{children}</div>
}
