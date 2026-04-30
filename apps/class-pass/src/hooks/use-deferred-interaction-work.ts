'use client'

import { useCallback, useEffect, useRef } from 'react'

type DeferredTask = {
  frameId: number | null
  timeoutId: number | null
}

export function useDeferredInteractionWork() {
  const tasksRef = useRef<DeferredTask[]>([])

  useEffect(() => () => {
    for (const task of tasksRef.current) {
      if (task.frameId !== null) {
        window.cancelAnimationFrame(task.frameId)
      }

      if (task.timeoutId !== null) {
        window.clearTimeout(task.timeoutId)
      }
    }

    tasksRef.current = []
  }, [])

  return useCallback((work: () => void) => {
    if (typeof window === 'undefined') {
      work()
      return
    }

    const task: DeferredTask = {
      frameId: null,
      timeoutId: null,
    }

    task.frameId = window.requestAnimationFrame(() => {
      task.frameId = null
      task.timeoutId = window.setTimeout(() => {
        tasksRef.current = tasksRef.current.filter((entry) => entry !== task)
        work()
      }, 0)
    })

    tasksRef.current.push(task)
  }, [])
}
