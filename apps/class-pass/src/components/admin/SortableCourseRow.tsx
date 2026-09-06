'use client'

import { useEffect, useRef } from 'react'
import { Reorder, useDragControls, useMotionValue, useReducedMotion } from 'framer-motion'
import { GripVertical } from 'lucide-react'

export function SortableCourseRow({ id, name, disabled, dragging, onBegin, onEnd, onCancel, onMove, onOpen, children }: {
  id: number; name: string; disabled: boolean; dragging: boolean
  onBegin: () => boolean; onEnd: () => void; onCancel: () => void
  onMove: (direction: 'up' | 'down') => void; onOpen: () => void
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const controls = useDragControls()
  const y = useMotionValue(0)
  const reducedMotion = useReducedMotion()
  const active = useRef(false)
  const suppressClick = useRef(false)
  useEffect(() => {
    if (!dragging) return
    function cancel() {
      // stop cleans up Reorder's gesture; jump also clears the leftover drag offset.
      // The queued onDragEnd must not persist a cancelled draft.
      active.current = false
      controls.stop()
      y.jump(0)
      onCancel()
    }
    function key(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); cancel() } }
    window.addEventListener('keydown', key)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel) }
  }, [dragging, controls, onCancel, y])
  const handle = (
    <button type="button" className="admin-course-grip" aria-label={`${name} 순서 변경`}
      aria-describedby="course-order-help" aria-keyshortcuts="ArrowUp ArrowDown" aria-disabled={disabled}
      title="드래그하여 이동 · 키보드 위/아래 방향키"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (disabled || event.button !== 0) return
        event.currentTarget.focus({ preventScroll: true })
        controls.start(event)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault(); event.stopPropagation()
        if (!disabled && !dragging) onMove(event.key === 'ArrowUp' ? 'up' : 'down')
      }}><GripVertical aria-hidden="true" size={20} /></button>
  )
  return (
    <Reorder.Item as="tr" value={id} dragListener={false} dragControls={controls}
      style={{ y }}
      className="admin-course-sortable" data-dragging={dragging}
      onPointerDownCapture={() => { suppressClick.current = false }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.15 }}
      onDragStart={() => { active.current = onBegin(); suppressClick.current = active.current; if (!active.current) controls.cancel() }}
      onDragEnd={() => { if (active.current) { active.current = false; onEnd() } }}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return }; if (!disabled && !dragging) onOpen() }}>
      {children(handle)}
    </Reorder.Item>
  )
}
