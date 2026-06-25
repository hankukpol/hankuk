import { useEffect, useMemo, useState } from 'react'
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
      return <span className="text-[11px] font-semibold text-slate-300">대상 아님</span>
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
    return <span className="text-[11px] font-semibold text-slate-300">미구매</span>
  }

  const receipt = row.receipts[material.id]
  if (receipt) {
    return (
      <button
        type="button"
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

function MatrixPaginationControls({
  currentPage,
  pageCount,
  totalCount,
  onPageChange,
}: {
  currentPage: number
  pageCount: number
  totalCount: number
  onPageChange: (page: number) => void
}) {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * MATRIX_PAGE_SIZE + 1
  const end = Math.min(currentPage * MATRIX_PAGE_SIZE, totalCount)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>{start}~{end} / {totalCount}명</span>
        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700">
          50명씩 보기
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          이전
        </button>
        <span className="text-sm font-medium text-slate-600">
          {currentPage} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= pageCount}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-ios hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
        >
          다음
        </button>
      </div>
    </div>
  )
}

export function StudentsMatrixPanel({
  tab,
  matrixLoading,
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
  const [currentPage, setCurrentPage] = useState(1)
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
  const distributionBatchItems = useMemo(() => {
    if (!showBatchDistributeButton) {
      return []
    }

    return filteredMatrixRows
      .map((row) => ({
        enrollmentId: row.enrollment.id,
        materialIds: getPendingDistributionMaterials(row, matrixMaterials, tab).map((material) => material.id),
      }))
      .filter((item) => item.materialIds.length > 0)
  }, [filteredMatrixRows, matrixMaterials, showBatchDistributeButton, tab])
  const distributionBatchMaterialCount = useMemo(
    () => distributionBatchItems.reduce((sum, item) => sum + item.materialIds.length, 0),
    [distributionBatchItems],
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [tab, matrixSearch, filterMatId])

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount)
    }
  }, [currentPage, pageCount])

  function handlePageChange(page: number) {
    const nextPage = Math.min(Math.max(page, 1), pageCount)
    if (nextPage !== currentPage) {
      onReplaceSelectedIds(new Set())
    }
    setCurrentPage(nextPage)
  }

  function handleSearchChange(value: string) {
    onMatrixSearchChange(value)
    onReplaceSelectedIds(new Set())
    setCurrentPage(1)
  }
  return (
    <section className="overflow-hidden rounded-[8px] bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <h3 className="text-sm font-bold text-gray-700">{MATRIX_TAB_META[tab].title}</h3>
          <span className="w-fit rounded-[8px] bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-slate-600">
            전체 {filteredMatrixRows.length.toLocaleString('ko-KR')}명
          </span>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {showBatchDistributeButton ? (
            <button
              type="button"
              onClick={() => onDistributeBatch?.(distributionBatchItems)}
              disabled={bulkProcessing || distributionBatchMaterialCount === 0}
              className="rounded-[8px] bg-blue-600 px-3 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-ios hover:bg-blue-700 active:scale-[0.97] disabled:bg-slate-100 disabled:text-slate-400 disabled:active:scale-100 sm:py-2"
            >
              {bulkProcessing
                ? `배부 중... (${bulkProgress.done}/${bulkProgress.total})`
                : distributionBatchMaterialCount > 0
                  ? `${distributionBatchMaterialCount}건 일괄 배부`
                  : '배부할 자료 없음'}
            </button>
          ) : null}
          <input
            type="text"
            value={matrixSearch}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="이름, 연락처, 응시번호 검색"
            className="w-full rounded-[8px] border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 sm:w-64 sm:py-2"
          />
        </div>
      </div>

      {filterMatId !== null ? (
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-2.5">
          <span className="text-xs font-semibold text-blue-700">
            &lsquo;{matrixMaterials.find((material) => material.id === filterMatId)?.name}&rsquo;{' '}
            {tab === 'textbook-assign' ? '미배정 수강생' : '미수령 수강생'} {filteredMatrixRows.length}명
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-all duration-200 ease-ios hover:bg-blue-200 active:scale-[0.97]"
          >
            필터 해제
          </button>
        </div>
      ) : null}

      {matrixLoading ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">불러오는 중...</p>
      ) : matrixMaterials.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-gray-400">
          {tab === 'receipts' ? '활성 배부자료가 없습니다.' : '활성 교재가 없습니다.'}
        </p>
      ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                {bulkActionEnabled ? (
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
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
                {matrixMaterials.map((material) => (
                  <th
                    key={material.id}
                    className={`cursor-pointer select-none px-3 py-3 text-center whitespace-nowrap hover:text-gray-700 ${
                      filterMatId === material.id ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                    onClick={() => onToggleFilterMaterial(material.id)}
                  >
                    {material.name} {filterMatId === material.id ? '↓' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMatrixRows.length === 0 ? (
                <tr>
                  <td colSpan={matrixMaterials.length + 1 + (bulkActionEnabled ? 1 : 0) + (showAllDistributeColumn ? 1 : 0) + (showAllAssignColumn ? 1 : 0)} className="px-5 py-8 text-center text-gray-400">
                    {matrixSearch.trim() || filterMatId !== null ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                  </td>
                </tr>
              ) : pagedMatrixRows.map((row) => (
                <tr key={row.enrollment.id} className="hover:bg-slate-50/60">
                  {bulkActionEnabled ? (
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.enrollment.id)}
                        onChange={(event) => onToggleRowSelection(row.enrollment.id, event.target.checked)}
                        className="h-3.5 w-3.5 rounded"
                      />
                    </td>
                  ) : null}
                  <td className="sticky left-0 bg-white px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {row.enrollment.name}
                    <span className="ml-2 text-xs text-gray-400">{row.enrollment.exam_number || row.enrollment.phone}</span>
                  </td>
                  {showAllDistributeColumn ? (
                    (() => {
                      const pendingMaterials = getPendingDistributionMaterials(row, matrixMaterials, tab)
                      const pendingCount = pendingMaterials.length

                      return (
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={bulkProcessing || pendingCount === 0}
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
                        matrixMaterials.length > 0 &&
                        matrixMaterials.every((material) => Boolean(row.assignments[material.id]))
                      return (
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={bulkProcessing || allAssigned}
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
                  {matrixMaterials.map((material) => (
                    <td key={material.id} className="px-3 py-3 text-center">
                      {renderMatrixCell(
                        row,
                        material,
                        tab,
                        bulkProcessing,
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
          currentPage={visiblePage}
          pageCount={pageCount}
          totalCount={filteredMatrixRows.length}
          onPageChange={handlePageChange}
        />
        </>
      )}

      {bulkActionEnabled && selectedIds.size > 0 ? (
        <div className="sticky bottom-0 flex items-center justify-between border-t border-blue-200 bg-blue-50 px-5 py-3">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size}명 선택</span>
          <button
            type="button"
            onClick={() => void onRunBulkAction()}
            disabled={bulkProcessing}
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
