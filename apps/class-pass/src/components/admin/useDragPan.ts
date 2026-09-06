'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Ctrl(맥은 Cmd)을 누른 채 표를 끌면 화면을 움직인다.
 * 가로는 늘 프레임이 맡고, 세로는 프레임이 스크롤할 수 있으면 프레임이 아니면 페이지가 맡는다.
 *
 * 수식어 키를 요구하므로 셀 안의 배부·취소 버튼과 다툴 일이 없다.
 * 그래도 끌고 난 직후의 click은 한 번 삼켜 의도치 않은 배부를 막는다.
 * 터치·펜은 브라우저가 이미 관성 스크롤을 주므로 마우스에만 건다.
 *
 * 표는 불러오는 동안 렌더되지 않으므로 useEffect가 아니라 콜백 ref로 붙인다.
 * 마운트 시점에 노드가 없으면 effect는 다시 돌지 않아 영영 붙지 않는다.
 */
const DRAG_THRESHOLD_PX = 4

export function useDragPan<T extends HTMLElement>() {
  const detach = useRef<(() => void) | null>(null)

  useEffect(() => () => {
    detach.current?.()
    detach.current = null
  }, [])

  return useCallback((node: T | null) => {
    detach.current?.()
    detach.current = null
    if (!node) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let startScrollLeft = 0
    let startScrollTop = 0
    let startPageY = 0
    let frameScrollsY = false
    let dragging = false
    let suppressClick = false

    function stop() {
      if (pointerId !== null && node!.hasPointerCapture?.(pointerId)) {
        node!.releasePointerCapture(pointerId)
      }
      pointerId = null
      dragging = false
      node!.removeAttribute('data-panning')
    }

    function onPointerDown(event: PointerEvent) {
      // 끌기 뒤에 click이 오지 않는 경우(포인터가 밖에서 놓이는 등)가 있어
      // 플래그가 남으면 다음 클릭을 삼킨다. 새 상호작용이 시작되면 반드시 푼다.
      suppressClick = false
      if (event.pointerType !== 'mouse' || event.button !== 0 || pointerId !== null) return
      // Ctrl(맥은 Cmd)을 누른 채로만 끌기를 시작한다.
      if (!event.ctrlKey && !event.metaKey) return
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      startScrollLeft = node!.scrollLeft
      startScrollTop = node!.scrollTop
      startPageY = window.scrollY
      // 누르는 순간 기준으로 정한다. 화면 크기에 따라 프레임이 세로로 스크롤될 수도, 아닐 수도 있다.
      frameScrollsY = node!.scrollHeight > node!.clientHeight
    }

    function onPointerMove(event: PointerEvent) {
      if (pointerId !== event.pointerId) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
        dragging = true
        suppressClick = true
        node!.setPointerCapture?.(pointerId)
        node!.setAttribute('data-panning', 'true')
      }
      // 끄는 방향과 내용이 같이 움직이도록 시작 위치에서 이동량을 뺀다.
      node!.scrollLeft = startScrollLeft - dx
      // 세로는 프레임이 스크롤할 수 있으면 프레임이, 아니면 페이지가 맡는다.
      if (frameScrollsY) node!.scrollTop = startScrollTop - dy
      else window.scrollTo({ top: startPageY - dy })
      event.preventDefault()
    }

    function onPointerUp(event: PointerEvent) {
      if (pointerId !== event.pointerId) return
      stop()
    }

    /** 끌기가 끝난 자리에서 발생하는 click 한 번만 막는다. */
    function onClickCapture(event: MouseEvent) {
      if (!suppressClick) return
      suppressClick = false
      event.stopPropagation()
      event.preventDefault()
    }

    /** 맥에서 Ctrl+클릭은 우클릭이라 끌던 도중 메뉴가 뜬다. */
    function onContextMenu(event: MouseEvent) {
      if (dragging) event.preventDefault()
    }

    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointermove', onPointerMove)
    node.addEventListener('pointerup', onPointerUp)
    node.addEventListener('pointercancel', onPointerUp)
    node.addEventListener('click', onClickCapture, true)
    node.addEventListener('contextmenu', onContextMenu)

    detach.current = () => {
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', onPointerUp)
      node.removeEventListener('pointercancel', onPointerUp)
      node.removeEventListener('click', onClickCapture, true)
      node.removeEventListener('contextmenu', onContextMenu)
      node.removeAttribute('data-panning')
    }
  }, [])
}
