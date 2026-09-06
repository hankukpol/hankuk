'use client'

import { useRef, useState } from 'react'

type OrderedCourse = { id: number; status: string; sort_order: number }

/** Reorder only the visible partition; the API still requires every course ID. */
function reorderVisible<T extends OrderedCourse>(courses: T[], filter: string, ids: number[]): T[] | null {
  const visible = courses.filter((course) => course.status === filter)
  const byId = new Map(visible.map((course) => [course.id, course]))
  if (ids.length !== visible.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) return null
  let index = 0
  return courses.map((course, sort_order) => ({
    ...(course.status === filter ? byId.get(ids[index++])! : course), sort_order,
  }))
}

export function useCourseOrdering<T extends OrderedCourse>({ courses, filter, onChange, onFeedback }: {
  courses: T[]; filter: string; onChange: (courses: T[]) => void
  onFeedback: (message: string, error: boolean) => void
}) {
  const [pending, setPending] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const saving = useRef(false)
  const session = useRef<{ id: number; before: T[]; latest: T[]; filter: string } | null>(null)

  async function persist(before: T[], next: T[]) {
    if (saving.current || (next.length === before.length && next.every((course, index) => course.id === before[index].id))) return
    saving.current = true
    setPending(true)
    onChange(next)
    onFeedback('', false)
    try {
      const response = await fetch('/api/courses/reorder', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: next.map((course) => course.id) }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? '강좌 순서를 저장하지 못했습니다.')
      }
      onFeedback('강좌 순서를 저장했습니다.', false)
    } catch (error) {
      onChange(before)
      onFeedback(error instanceof Error ? error.message : '강좌 순서를 저장하지 못했습니다. 다시 시도해 주세요.', true)
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  function beginDrag(id: number) {
    if (saving.current || session.current || !courses.some((course) => course.id === id && course.status === filter)) return false
    session.current = { id, before: courses, latest: courses, filter }
    setDraggingId(id)
    onFeedback('', false)
    return true
  }
  function preview(ids: number[]) {
    const draft = session.current
    if (!draft) return
    const next = reorderVisible(draft.before, draft.filter, ids)
    if (next) { draft.latest = next; onChange(next) }
  }
  function cancelDrag() {
    if (session.current) onChange(session.current.before)
    session.current = null
    setDraggingId(null)
  }
  async function endDrag() {
    const draft = session.current
    session.current = null
    setDraggingId(null)
    if (draft) await persist(draft.before, draft.latest)
  }
  async function move(id: number, direction: 'up' | 'down') {
    if (saving.current || session.current) return
    const ids: number[] = []
    for (const course of courses) if (course.status === filter) ids.push(course.id)
    const from = ids.indexOf(id)
    const to = from + (direction === 'up' ? -1 : 1)
    if (from < 0 || to < 0 || to >= ids.length) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    const next = reorderVisible(courses, filter, ids)
    if (next) await persist(courses, next)
  }
  return { pending, draggingId, beginDrag, preview, cancelDrag, endDrag, move }
}
