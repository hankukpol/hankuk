import { formatDateTime } from '@/lib/utils'
import type { Material } from '@/types/database'
import { MATRIX_TAB_META, type BulkProgressState, type MatrixMode, type MatrixRow } from './students-page-types'

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
  onUndo: (logId: number, studentName: string, materialName: string) => void
  onAssignTextbook: (enrollmentId: number, materialId: number, checked: boolean) => void
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
          className="inline-flex flex-col items-center gap-0.5 text-emerald-600 hover:text-emerald-700"
        >
          <span className="text-base">✓</span>
          <span className="text-[10px] text-gray-400">{formatDateTime(receipt.distributed_at).split(' ')[0]}</span>
        </button>
      )
    }

    return (
      <button
        type="button"
        disabled={bulkProcessing}
        onClick={() => void onDistribute(row.enrollment.id, material.id)}
        className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
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
        className="inline-flex flex-col items-center gap-0.5 text-emerald-600 hover:text-emerald-700"
      >
        <span className="text-base">✓</span>
        <span className="text-[10px] text-gray-400">{formatDateTime(receipt.distributed_at).split(' ')[0]}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={bulkProcessing}
      onClick={() => void onDistribute(row.enrollment.id, material.id)}
      className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
    >
      배부
    </button>
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
  onUndo,
  onAssignTextbook,
  onRunBulkAction,
}: StudentsMatrixPanelProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-gray-700">{MATRIX_TAB_META[tab].title}</h3>
        <input
          type="text"
          value={matrixSearch}
          onChange={(event) => onMatrixSearchChange(event.target.value)}
          placeholder="이름, 연락처, 응시번호 검색"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-56"
        />
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
            className="rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-200"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-gray-400">
                {bulkActionEnabled ? (
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={filteredMatrixRows.length > 0 && selectedIds.size === filteredMatrixRows.length}
                      onChange={(event) => {
                        if (event.target.checked) {
                          onReplaceSelectedIds(new Set(filteredMatrixRows.map((row) => row.enrollment.id)))
                          return
                        }

                        onReplaceSelectedIds(new Set())
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                  </th>
                ) : null}
                <th className="sticky left-0 bg-white px-5 py-3">수강생</th>
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
                  <td colSpan={matrixMaterials.length + 1 + (bulkActionEnabled ? 1 : 0)} className="px-5 py-8 text-center text-gray-400">
                    {matrixSearch.trim() || filterMatId !== null ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                  </td>
                </tr>
              ) : filteredMatrixRows.map((row) => (
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
      )}

      {bulkActionEnabled && selectedIds.size > 0 ? (
        <div className="sticky bottom-0 flex items-center justify-between border-t border-blue-200 bg-blue-50 px-5 py-3">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size}명 선택</span>
          <button
            type="button"
            onClick={() => void onRunBulkAction()}
            disabled={bulkProcessing}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-blue-700"
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
