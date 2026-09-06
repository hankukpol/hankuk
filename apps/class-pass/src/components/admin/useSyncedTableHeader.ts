'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * 가로로 넘치는 표의 머리글을 페이지 기준으로 고정한다.
 *
 * 한 요소가 가로 스크롤을 가지면 세로 스크롤 컨테이너도 함께 만들어지므로,
 * 그 안의 thead는 페이지가 아니라 프레임을 기준으로 붙는다. 프레임은 세로로
 * 스크롤하지 않으니 결국 머리글이 페이지와 함께 밀려 올라간다.
 *
 * 그래서 머리글을 한 벌 더 그려 프레임 밖에 sticky로 띄우고, 가로 위치만
 * 본체와 맞춘다. 띄운 머리글도 React가 그린 것이라 자료명 필터 버튼이 살아 있다.
 * 열 너비는 본체를 실측해 옮긴다. 내용에 따라 달라지므로 크기가 바뀔 때마다 다시 잰다.
 */
export function useSyncedTableHeader() {
  const frame = useRef<HTMLDivElement | null>(null)
  const bar = useRef<HTMLDivElement | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  const sync = useCallback(() => {
    const frameNode = frame.current
    const barNode = bar.current
    if (!frameNode || !barNode) return

    const source = frameNode.querySelector('thead')
    const clone = barNode.querySelector('thead')
    const sourceTable = frameNode.querySelector('table')
    const cloneTable = barNode.querySelector('table')
    if (!source || !clone || !sourceTable || !cloneTable) return

    // 본체 열 너비를 그대로 옮긴다. 띄운 머리글에는 본문이 없어 스스로는 같은 너비가 나오지 않는다.
    const sourceCells = source.querySelectorAll('th')
    const cloneCells = clone.querySelectorAll('th')
    if (sourceCells.length !== cloneCells.length) return
    cloneTable.style.width = `${sourceTable.getBoundingClientRect().width}px`
    cloneTable.style.tableLayout = 'fixed'
    sourceCells.forEach((cell, index) => {
      const width = `${cell.getBoundingClientRect().width}px`
      const target = cloneCells[index] as HTMLElement
      target.style.width = width
      target.style.minWidth = width
      target.style.maxWidth = width
    })

    // 띄운 머리글이 본체 머리글을 정확히 덮게 한다.
    // 높이를 본체와 같게 잡고 그만큼 본체를 끌어올리면, 자리를 두 번 차지하지 않으면서
    // 표 끝에서 머리글이 아래 내용 위로 비어져 나오지도 않는다(sticky가 부모 안에서 멈춘다).
    const headHeight = source.getBoundingClientRect().height
    if (headHeight > 0) {
      barNode.style.height = `${headHeight}px`
      frameNode.style.marginTop = `-${headHeight}px`
    }
    barNode.scrollLeft = frameNode.scrollLeft
  }, [])

  const attach = useCallback((node: HTMLDivElement | null, which: 'frame' | 'bar') => {
    if (which === 'frame') frame.current = node
    else bar.current = node

    cleanup.current?.()
    cleanup.current = null
    const frameNode = frame.current
    const barNode = bar.current
    if (!frameNode || !barNode) return

    const onScroll = () => { barNode.scrollLeft = frameNode.scrollLeft }
    frameNode.addEventListener('scroll', onScroll, { passive: true })

    // 자료 필터·검색·창 크기 변화로 열 너비가 달라지면 다시 잰다.
    // 테스트 환경에는 ResizeObserver가 없다. 없으면 렌더마다 도는 맞춤만으로 간다.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync())
    observer?.observe(frameNode)
    const sourceTable = frameNode.querySelector('table')
    if (sourceTable) observer?.observe(sourceTable)

    sync()
    cleanup.current = () => {
      frameNode.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      frameNode.style.marginTop = ''
    }
  }, [sync])

  const frameRef = useCallback((node: HTMLDivElement | null) => attach(node, 'frame'), [attach])
  const barRef = useCallback((node: HTMLDivElement | null) => attach(node, 'bar'), [attach])

  // 행이 바뀌면 열 너비도 바뀔 수 있다. 렌더 후 한 번 더 맞춘다.
  useEffect(() => {
    sync()
  })

  useEffect(() => () => {
    cleanup.current?.()
    cleanup.current = null
  }, [])

  return { frameRef, barRef }
}
