import { AdminPagination as MatrixPaginationControls } from "@/components/admin/AdminPagination"
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime, formatKoreanMonthDay } from '@/lib/utils'
import type { Material } from '@/types/database'
import {
  MATRIX_TAB_META,
  type BulkProgressState,
  type DistributionBatchItem,
  type MatrixMode,
  type MatrixRow,
} from './students-page-types'

const MATRIX_PAGE_SIZE = 50

type StudentsMatrixPanelProps = {
  tab: MatrixMode
  matrixLoading: boolean
  matrixUnavailable?: boolean
  matrixMaterials: Material[]
  filteredMatrixRows: MatrixRow[]
  matrixSearch: string
  filterMatId: number | null
  selectedIds: Set<number>
  bulkActionEnabled: boolean
  bulkProcessing: boolean
  bulkProgress: BulkProgressState
  onMatrixSearchChange: (value: string) => void
  onToggleFilterMaterial: (materialId: number) => void
  onClearFilter: () => void
  onReplaceSelectedIds: (nextSelectedIds: Set<number>) => void
  onToggleRowSelection: (enrollmentId: number, checked: boolean) => void
  onDistribute: (enrollmentId: number, materialId: number) => void
  onDistributeAll?: (enrollmentId: number, materialIds: number[]) => void
  onDistributeBatch?: (items: DistributionBatchItem[]) => void
  onUndo: (logId: number, studentName: string, materialName: string) => void
  onAssignTextbook: (enrollmentId: number, materialId: number, checked: boolean) => void
  onAssignAllTextbooks?: (enrollmentId: number) => void
  onRunBulkAction: () => void
}

function renderMatrixCell(
  row: MatrixRow,
  material: Material,
  tab: MatrixMode,
  bulkProcessing: boolean,
  onDistribute: (enrollmentId: number, materialId: number) => void,
  onUndo: (logId: number, studentName: string, materialName: string) => void,
  onAssignTextbook: (enrollmentId: number, materialId: number, checked: boolean) => void,
) {
  if (tab === 'receipts') {
    const receipt = row.receipts[material.id]
    if (receipt) {
      return (
        <button
          type="button"
          disabled={bulkProcessing}
          aria-label={`${row.enrollment.name} ${material.name} 수령 취소`}
          onClick={() => void onUndo(receipt.logId, row.enrollment.name, material.name)}
          className="inline-flex flex-col items-center gap-0.5 text-emerald-600 transition-all duration-200 ease-ios hover:text-emerald-700 active:scale-[0.97]"
        >
          <span className="text-base">✓</span>
          <span className="whitespace-nowrap text-[10px] text-gray-400" title={formatDateTime(receipt.distributed_at)}>
            {formatKoreanMonthDay(receipt.distributed_at)}
          </span>
        </button>
      )
    }

    // 과목이 지정된 배부자료는 그 과목 좌석을 배정받은 학생에게만 배부 버튼을 노출한다.
    if (material.subject_id != null && !row.seatSubjects[material.subject_id]) {
      return <span className="admin-material-status">대상 아님</span>
    }

    return (
      <button
        type="button"
        disabled={bulkProcessing}
        onClick={() => void onDistribute(row.enrollment.id, material.id)}
        className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-100 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
      >
        배부
      </button>
    )
  }

  if (tab === 'textbook-assign') {
    const assigned = Boolean(row.assignments[material.id])
    return (
      <label className="inline-flex items-center justify-center">
        <input
          type="checkbox"
          aria-label={`${row.enrollment.name} ${material.name} 구매·배정`}
          checked={assigned}
          disabled={bulkProcessing}
          onChange={(event) => void onAssignTextbook(row.enrollment.id, material.id, event.target.checked)}
          className="h-4 w-4 rounded"
        />
      </label>
    )
  }

  const assigned = Boolean(row.assignments[material.id])
  if (!assigned) {
    return <span className="admin-material-status">미구매</span>
  }

  const receipt = row.receipts[material.id]
  if (receipt) {
    return (
      <button
        type="button"
        disabled={bulkProcessing}
        aria-label={`${row.enrollment.name} ${material.name} 수령 취소`}
        onClick={() => void onUndo(receipt.logId, row.enrollment.name, material.name)}
        className="inline-flex flex-col items-center gap-0.5 text-emerald-600 transition-all duration-200 ease-ios hover:text-emerald-700 active:scale-[0.97]"
      >
        <span className="text-base">✓</span>
        <span className="whitespace-nowrap text-[10px] text-gray-400" title={formatDateTime(receipt.distributed_at)}>
          {formatKoreanMonthDay(receipt.distributed_at)}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={bulkProcessing}
      onClick={() => void onDistribute(row.enrollment.id, material.id)}
      className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-100 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
    >
      배부
    </button>
  )
}

function getPendingDistributionMaterials(row: MatrixRow, materials: Material[], tab: MatrixMode) {
  if (tab === 'textbook-assign') {
    return []
  }

  return materials.filter((material) => {
    if (row.receipts[material.id]) {
      return false
    }

    if (tab === 'textbook-receipts') {
      return Boolean(row.assignments[material.id])
    }

    return material.subject_id == null || Boolean(row.seatSubjects[material.subject_id])
  })
}

type FocusRowKind = 'actionable' | 'done' | 'blocked'
type FocusGroups = Record<FocusRowKind, Material[]>

const FOCUS_LABELS: Record<MatrixMode, { actionable: string; done: string; blocked: string; action: string; pending: string; empty: string }> = {
  receipts: { actionable: '줄 자료', done: '받아감', blocked: '대상 아님', action: '배부', pending: '미배부', empty: '지금 줄 자료가 없습니다.' },
  'textbook-receipts': { actionable: '줄 교재', done: '받아감', blocked: '미구매', action: '배부', pending: '미배부', empty: '지금 줄 교재가 없습니다.' },
  'textbook-assign': { actionable: '미배정 교재', done: '배정됨', blocked: '', action: '배정', pending: '미배정', empty: '배정할 교재가 없습니다.' },
}

// 한 학생만 볼 때는 자료를 세로로 세운다. 줄 것만 위로 모으면 자료가 27개여도 첫 화면에서 끝난다.
function groupMaterialsForStudent(row: MatrixRow, materials: Material[], tab: MatrixMode): FocusGroups {
  const actionable: Material[] = []
  const done: Material[] = []
  const blocked: Material[] = []

  for (const material of materials) {
    if (tab === 'textbook-assign') {
      if (row.assignments[material.id]) done.push(material)
      else actionable.push(material)
      continue
    }

    if (row.receipts[material.id]) {
      done.push(material)
      continue
    }

    // 표의 셀과 같은 판정을 쓴다. 교재는 구매한 사람만, 과목 지정 자료는 그 과목 좌석을 받은 사람만 줄 수 있다.
    const eligible = tab === 'textbook-receipts'
      ? Boolean(row.assignments[material.id])
      : material.subject_id == null || Boolean(row.seatSubjects[material.subject_id])
    if (eligible) actionable.push(material)
    else blocked.push(material)
  }

  return { actionable, done, blocked }
}

type StudentFocusTableProps = {
  row: MatrixRow
  materials: Material[]
  tab: MatrixMode
  disabled: boolean
  onDistribute: (enrollmentId: number, materialId: number) => void
  onDistributeAll?: (enrollmentId: number, materialIds: number[]) => void
  onUndo: (logId: number, studentName: string, materialName: string) => void
  onAssignTextbook: (enrollmentId: number, materialId: number, checked: boolean) => void
  onAssignAllTextbooks?: (enrollmentId: number) => void
  onNextStudent: () => void
  onExit: () => void
}

function StudentFocusTable({
  row,
  materials,
  tab,
  disabled,
  onDistribute,
  onDistributeAll,
  onUndo,
  onAssignTextbook,
  onAssignAllTextbooks,
  onNextStudent,
  onExit,
}: StudentFocusTableProps) {
  const labels = FOCUS_LABELS[tab]
  const [showHandled, setShowHandled] = useState(false)
  const groups = useMemo(() => groupMaterialsForStudent(row, materials, tab), [row, materials, tab])
  const handledCount = groups.done.length + groups.blocked.length
  // 줄 것을 맨 위에 두고, 이미 끝난 자료는 요청할 때만 같은 표에 이어 붙인다.
  const visibleRows = useMemo(() => {
    const ordered: Array<{ material: Material; kind: FocusRowKind }> = groups.actionable.map(
      (material) => ({ material, kind: 'actionable' as const }),
    )

    if (showHandled) {
      for (const material of groups.done) ordered.push({ material, kind: 'done' })
      for (const material of groups.blocked) ordered.push({ material, kind: 'blocked' })
    }

    return ordered
  }, [groups, showHandled])
  const enrollmentId = row.enrollment.id
  const canActAll = tab === 'textbook-assign'
    ? typeof onAssignAllTextbooks === 'function'
    : typeof onDistributeAll === 'function'

  function renderStatus(material: Material, kind: FocusRowKind) {
    if (kind === 'actionable') {
      return <span className="admin-material-status">{labels.pending}</span>
    }

    if (kind === 'blocked') {
      return <span className="admin-material-status">{labels.blocked}</span>
    }

    if (tab === 'textbook-assign') {
      return <span className="admin-material-status">{labels.done}</span>
    }

    const receipt = row.receipts[material.id]
    if (!receipt) {
      return <span className="admin-material-status">{labels.done}</span>
    }

    return <span title={formatDateTime(receipt.distributed_at)}>{formatKoreanMonthDay(receipt.distributed_at)}</span>
  }

  function renderAction(material: Material, kind: FocusRowKind) {
    if (kind === 'blocked') {
      return <span className="admin-material-status">—</span>
    }

    if (kind === 'actionable') {
      return (
        <button
          type="button"
          className="admin-button admin-button-primary"
          disabled={disabled}
          aria-label={`${row.enrollment.name} ${material.name} ${labels.action}`}
          onClick={() => {
            if (tab === 'textbook-assign') {
              onAssignTextbook(enrollmentId, material.id, true)
              return
            }

            onDistribute(enrollmentId, material.id)
          }}
        >
          {labels.action}
        </button>
      )
    }

    if (tab === 'textbook-assign') {
      return (
        <button
          type="button"
          className="admin-button"
          disabled={disabled}
          onClick={() => onAssignTextbook(enrollmentId, material.id, false)}
        >
          배정 해제
        </button>
      )
    }

    const receipt = row.receipts[material.id]
    if (!receipt) {
      return <span className="admin-material-status">—</span>
    }

    return (
      <button
        type="button"
        className="admin-button"
        disabled={disabled}
        aria-label={`${row.enrollment.name} ${material.name} 수령 취소`}
        onClick={() => onUndo(receipt.logId, row.enrollment.name, material.name)}
      >
        취소
      </button>
    )
  }

  return (
    <div className="admin-material-focus">
      <div className="admin-material-focus-head">
        <div className="min-w-0">
          <p className="admin-material-focus-name">{row.enrollment.name}</p>
          <p className="admin-material-focus-meta">{row.enrollment.exam_number || row.enrollment.phone}</p>
        </div>
        <div className="admin-material-actions">
          <button type="button" className="admin-button" disabled={disabled} onClick={onNextStudent}>
            다음 학생
          </button>
          <button type="button" className="admin-button" onClick={onExit}>
            표로 보기
          </button>
        </div>
      </div>

      <div className="admin-table-toolbar admin-material-focus-toolbar">
        <span className="admin-material-focus-count">
          {labels.actionable} {groups.actionable.length}건
        </span>
        <div className="admin-material-actions">
          {canActAll && groups.actionable.length > 1 ? (
            <button
              type="button"
              className="admin-button admin-button-primary"
              disabled={disabled}
              onClick={() => {
                if (tab === 'textbook-assign') {
                  onAssignAllTextbooks?.(enrollmentId)
                  return
                }

                onDistributeAll?.(enrollmentId, groups.actionable.map((material) => material.id))
              }}
            >
              {groups.actionable.length}건 모두 {labels.action}
            </button>
          ) : null}
          {handledCount > 0 ? (
            <button
              type="button"
              className="admin-button"
              aria-pressed={showHandled}
              onClick={() => setShowHandled((current) => !current)}
            >
              {showHandled ? '처리분 숨기기' : `처리분 ${handledCount}건 보기`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-table-frame admin-matrix-scroll">
        <table className="w-full">
          <thead>
            <tr>
              <th>자료명</th>
              <th>상태</th>
              <th>{labels.action}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={3}>{labels.empty}</td>
              </tr>
            ) : visibleRows.map(({ material, kind }) => (
              <tr key={material.id}>
                <td className="admin-table-name">{material.name}</td>
                <td>{renderStatus(material, kind)}</td>
                <td>{renderAction(material, kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StudentsMatrixPanel({
  tab,
  matrixLoading,
  matrixUnavailable = false,
  matrixMaterials,
  filteredMatrixRows,
  matrixSearch,
  filterMatId,
  selectedIds,
  bulkActionEnabled,
  bulkProcessing,
  bulkProgress,
  onMatrixSearchChange,
  onToggleFilterMaterial,
  onClearFilter,
  onReplaceSelectedIds,
  onToggleRowSelection,
  onDistribute,
  onDistributeAll,
  onDistributeBatch,
  onUndo,
  onAssignTextbook,
  onAssignAllTextbooks,
  onRunBulkAction,
}: StudentsMatrixPanelProps) {
  const controlsDisabled = bulkProcessing || matrixLoading || matrixUnavailable
  const [currentPage, setCurrentPage] = useState(1)
  // 검색으로 한 명까지 좁혀지면 표 대신 그 학생만 세로로 편다. 표에서 이름을 눌러도 같은 화면이 열린다.
  const [manualFocusId, setManualFocusId] = useState<number | null>(null)
  const [autoFocusDismissed, setAutoFocusDismissed] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const showAllAssignColumn = tab === 'textbook-assign' && typeof onAssignAllTextbooks === 'function'
  const showAllDistributeColumn = (tab === 'receipts' || tab === 'textbook-receipts') && typeof onDistributeAll === 'function'
  const showBatchDistributeButton = showAllDistributeColumn && typeof onDistributeBatch === 'function'
  const pageCount = Math.max(1, Math.ceil(filteredMatrixRows.length / MATRIX_PAGE_SIZE))
  const visiblePage = Math.min(currentPage, pageCount)
  const pageStart = (visiblePage - 1) * MATRIX_PAGE_SIZE
  const pagedMatrixRows = useMemo(
    () => filteredMatrixRows.slice(pageStart, pageStart + MATRIX_PAGE_SIZE),
    [filteredMatrixRows, pageStart],
  )
  const visiblePageIds = useMemo(
    () => pagedMatrixRows.map((row) => row.enrollment.id),
    [pagedMatrixRows],
  )
  const allVisibleSelected = visiblePageIds.length > 0 && visiblePageIds.every((id) => selectedIds.has(id))
  // 자료 하나를 고르면 그 열만 남긴다. 자료가 많을 때 한 자료만 배부하는 흐름에서 가로 스크롤이 사라진다.
  // 일괄 배부·집계는 아래에서 계속 matrixMaterials(전체)를 기준으로 계산한다.
  const columnMaterials = useMemo(
    () => (filterMatId === null ? matrixMaterials : matrixMaterials.filter((material) => material.id === filterMatId)),
    [filterMatId, matrixMaterials],
  )
  // 이름을 눌러 고른 학생이 우선이고, 그다음이 "검색 결과가 딱 한 명"이다.
  const focusedRow = useMemo(() => {
    if (manualFocusId !== null) {
      return filteredMatrixRows.find((row) => row.enrollment.id === manualFocusId) ?? null
    }

    if (autoFocusDismissed || matrixSearch.trim() === '' || filteredMatrixRows.length !== 1) {
      return null
    }

    return filteredMatrixRows[0]
  }, [autoFocusDismissed, filteredMatrixRows, manualFocusId, matrixSearch])
  const distributionBatchItems = useMemo(() => {
    if (!showBatchDistributeButton) {
      return []
    }

    return filteredMatrixRows
      .map((row) => ({
        enrollmentId: row.enrollment.id,
        materialIds: getPendingDistributionMaterials(row, columnMaterials, tab).map((material) => material.id),
      }))
      .filter((item) => item.materialIds.length > 0)
  }, [filteredMatrixRows, columnMaterials, showBatchDistributeButton, tab])
  const distributionBatchMaterialCount = useMemo(
    () => distributionBatchItems.reduce((sum, item) => sum + item.materialIds.length, 0),
    [distributionBatchItems],
  )

  useEffect(() => {
    setCurrentPage(1)
    setManualFocusId(null)
    setAutoFocusDismissed(false)
  }, [tab, matrixSearch, filterMatId])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  function handlePageChange(page: number) {
    if (controlsDisabled) return
    const nextPage = Math.min(Math.max(page, 1), pageCount)
    if (nextPage !== currentPage) {
      onReplaceSelectedIds(new Set())
    }
    setCurrentPage(nextPage)
  }

  function handleSearchChange(value: string) {
    if (controlsDisabled) return
    onMatrixSearchChange(value)
    onReplaceSelectedIds(new Set())
    setCurrentPage(1)
  }

  // 한 명 처리하고 바로 다음 사람을 부르는 흐름이라, 검색어를 비우고 포커스를 입력칸으로 되돌린다.
  function handleNextStudent() {
    if (controlsDisabled) return
    onMatrixSearchChange('')
    onReplaceSelectedIds(new Set())
    setManualFocusId(null)
    setAutoFocusDismissed(false)
    setCurrentPage(1)
    searchInputRef.current?.focus()
  }

  function handleExitFocus() {
    setManualFocusId(null)
    setAutoFocusDismissed(true)
  }
  return (
    <section className="admin-material-matrix">
      <div className="admin-table-toolbar flex flex-col gap-3 border-b border-slate-100 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <h3 className="admin-section-title">{MATRIX_TAB_META[tab].title}</h3>
          <span className="w-fit rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-slate-600">
            전체 {filteredMatrixRows.length.toLocaleString('ko-KR')}명
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3">
          <input
            ref={searchInputRef}
            type="search"
            disabled={controlsDisabled}
            aria-label="배부·교재 수강생 검색"
            value={matrixSearch}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="이름, 연락처, 응시번호 검색"
            className="admin-students-search rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          {showBatchDistributeButton && focusedRow === null ? (
            <button
              type="button"
              onClick={() => onDistributeBatch?.(distributionBatchItems)}
              disabled={controlsDisabled || distributionBatchMaterialCount === 0}
              className="rounded-[8px] bg-blue-600 px-3 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] disabled:bg-slate-100 disabled:text-slate-400 disabled:active:scale-100 sm:py-2"
            >
              {bulkProcessing
                ? `배부 중... (${bulkProgress.done}/${bulkProgress.total})`
                : distributionBatchMaterialCount > 0
                  ? `${distributionBatchMaterialCount}건 일괄 배부`
                  : '배부할 자료 없음'}
            </button>
          ) : null}
        </div>
      </div>

      {filterMatId !== null ? (
        <div className="admin-material-selection">
          <span className="text-xs font-semibold text-blue-700">
            &lsquo;{matrixMaterials.find((material) => material.id === filterMatId)?.name}&rsquo;{' '}
            {tab === 'textbook-assign' ? '미구매 수강생' : '미수령 수강생'} {filteredMatrixRows.length}명
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            disabled={controlsDisabled}
            className="admin-button"
          >
            필터 해제
          </button>
        </div>
      ) : null}

      {matrixLoading ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">불러오는 중...</p>
      ) : matrixUnavailable ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">현황을 확인하지 못했습니다. 선택한 탭을 다시 눌러 조회해 주세요.</p>
      ) : matrixMaterials.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">
          {tab === 'receipts' ? '활성 배부자료가 없습니다.' : '활성 교재가 없습니다.'}
        </p>
      ) : focusedRow ? (
        <StudentFocusTable
          key={focusedRow.enrollment.id}
          row={focusedRow}
          materials={columnMaterials}
          tab={tab}
          disabled={controlsDisabled}
          onDistribute={onDistribute}
          onDistributeAll={onDistributeAll}
          onUndo={onUndo}
          onAssignTextbook={onAssignTextbook}
          onAssignAllTextbooks={onAssignAllTextbooks}
          onNextStudent={handleNextStudent}
          onExit={handleExitFocus}
        />
      ) : (
        <>
        {/* 자료가 많으면 가로·세로를 함께 스크롤한다. 한 프레임 안에서 스크롤해야 머리글과 이름 열이 같이 고정된다. */}
        <div className="admin-table-frame admin-matrix-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                {bulkActionEnabled ? (
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="현재 페이지 전체 선택"
                      checked={allVisibleSelected}
                      disabled={controlsDisabled}
                      onChange={(event) => {
                        if (event.target.checked) {
                          onReplaceSelectedIds(new Set(visiblePageIds))
                          return
                        }

                        onReplaceSelectedIds(new Set())
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </th>
                ) : null}
                <th className="sticky left-0 bg-white px-5 py-3">수강생</th>
                {showAllDistributeColumn ? (
                  <th className="px-3 py-3 text-center whitespace-nowrap">전체</th>
                ) : null}
                {showAllAssignColumn ? (
                  <th className="px-3 py-3 text-center whitespace-nowrap">전체</th>
                ) : null}
                {columnMaterials.map((material) => (
                  <th
                    key={material.id}
                    className={`px-3 py-3 text-center ${
                      filterMatId === material.id ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <button type="button" className="admin-material-filter" disabled={controlsDisabled}
                      aria-pressed={filterMatId === material.id}
                      title={`${material.name}: ${tab === 'textbook-assign' ? '미구매' : '미수령'} 수강생 필터`}
                      onClick={() => onToggleFilterMaterial(material.id)}>
                      {material.name} {filterMatId === material.id ? '↓' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMatrixRows.length === 0 ? (
                <tr>
                  <td colSpan={columnMaterials.length + 1 + (bulkActionEnabled ? 1 : 0) + (showAllDistributeColumn ? 1 : 0) + (showAllAssignColumn ? 1 : 0)} className="px-5 py-8 text-center text-gray-400">
                    {matrixSearch.trim() || filterMatId !== null ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                  </td>
                </tr>
              ) : pagedMatrixRows.map((row) => (
                <tr key={row.enrollment.id} className="hover:bg-slate-50/60">
                  {bulkActionEnabled ? (
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${row.enrollment.name} 선택`}
                        checked={selectedIds.has(row.enrollment.id)}
                        disabled={controlsDisabled}
                        onChange={(event) => onToggleRowSelection(row.enrollment.id, event.target.checked)}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                  ) : null}
                  {/* 자료가 많으면 가로 폭이 부족하다. 식별자를 아래 줄로 내려 이름 열을 좁힌다. */}
                  <td className="sticky left-0 bg-white px-5 py-3 font-medium text-gray-900">
                    <button
                      type="button"
                      className="admin-material-focus-open"
                      disabled={controlsDisabled}
                      title={`${row.enrollment.name} 한 명만 보기`}
                      onClick={() => setManualFocusId(row.enrollment.id)}
                    >
                      <span className="block whitespace-nowrap">{row.enrollment.name}</span>
                      <span className="block whitespace-nowrap text-xs text-gray-400">{row.enrollment.exam_number || row.enrollment.phone}</span>
                    </button>
                  </td>
                  {showAllDistributeColumn ? (
                    (() => {
                      const pendingMaterials = getPendingDistributionMaterials(row, columnMaterials, tab)
                      const pendingCount = pendingMaterials.length

                      return (
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={controlsDisabled || pendingCount === 0}
                            onClick={() => onDistributeAll?.(
                              row.enrollment.id,
                              pendingMaterials.map((material) => material.id),
                            )}
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100 ${
                              pendingCount === 0
                                ? 'cursor-default bg-slate-100 text-slate-400'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50'
                            }`}
                          >
                            {pendingCount === 0 ? '완료' : `${pendingCount}건 배부`}
                          </button>
                        </td>
                      )
                    })()
                  ) : null}
                  {showAllAssignColumn ? (
                    (() => {
                      const allAssigned =
                        columnMaterials.length > 0 &&
                        columnMaterials.every((material) => Boolean(row.assignments[material.id]))
                      return (
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={controlsDisabled || allAssigned}
                            onClick={() => onAssignAllTextbooks?.(row.enrollment.id)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-all duration-200 ease-ios active:scale-[0.97] disabled:active:scale-100 ${
                              allAssigned
                                ? 'cursor-default bg-slate-100 text-slate-400'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50'
                            }`}
                          >
                            {allAssigned ? '✓ 완료' : '전체 배정'}
                          </button>
                        </td>
                      )
                    })()
                  ) : null}
                  {columnMaterials.map((material) => (
                    <td key={material.id} className="px-3 py-3 text-center">
                      {renderMatrixCell(
                        row,
                        material,
                        tab,
                        controlsDisabled,
                        onDistribute,
                        onUndo,
                        onAssignTextbook,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MatrixPaginationControls
          pageSize={MATRIX_PAGE_SIZE}
          currentPage={visiblePage}
          pageCount={pageCount}
          totalCount={filteredMatrixRows.length}
          onPageChange={handlePageChange}
        />
        </>
      )}

      {bulkActionEnabled && focusedRow === null && selectedIds.size > 0 ? (
        <div className="sticky bottom-0 flex items-center justify-between border-t border-blue-200 bg-blue-50 px-5 py-3">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size}명 선택</span>
          <button
            type="button"
            onClick={() => void onRunBulkAction()}
            disabled={controlsDisabled}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 hover:shadow-md active:scale-[0.97] active:duration-100 disabled:opacity-50 disabled:active:scale-100"
          >
            {bulkProcessing
              ? `${tab === 'receipts' ? '배부' : '배정'} 중... (${bulkProgress.done}/${bulkProgress.total})`
              : tab === 'receipts'
                ? `선택 ${selectedIds.size}명 일괄 배부`
                : `선택 ${selectedIds.size}명 일괄 배정`}
          </button>
        </div>
      ) : null}
    </section>
  )
}
