'use client'

type AdminPaginationProps = {
  currentPage: number
  pageCount: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeLabel?: string
}

export function AdminPagination({
  currentPage, pageCount, pageSize, totalCount, onPageChange, onPageSizeChange,
  pageSizeLabel = '페이지당 수강생 수',
}: AdminPaginationProps) {
  const lastPage = Math.max(1, pageCount)
  const page = Math.min(Math.max(1, currentPage), lastPage)
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <nav className="admin-pagination" aria-label="목록 페이지 이동">
      <div className="admin-pagination-summary">
        <p className="admin-pagination-range" aria-live="polite" aria-atomic="true">
          <span>조회 {totalCount.toLocaleString('ko-KR')}명</span>{' '}
          <span>{start.toLocaleString('ko-KR')}~{end.toLocaleString('ko-KR')}명 표시</span>
        </p>
        {onPageSizeChange ? (
          <select aria-label={pageSizeLabel} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size}명씩 보기</option>)}
          </select>
        ) : <span className="admin-pagination-size">{pageSize}명씩 보기</span>}
      </div>
      <div className="admin-pagination-actions">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>이전</button>
        <span className="admin-pagination-current" aria-label={`${page}페이지, 전체 ${lastPage}페이지`}>{page} / {lastPage}</span>
        <button type="button" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>다음</button>
      </div>
    </nav>
  )
}
