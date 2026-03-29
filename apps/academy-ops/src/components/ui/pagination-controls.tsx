"use client";

type PaginationControlsProps = {
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string;
  pageSizeOptions?: number[];
};

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
}

export function PaginationControls({
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = "건",
  pageSizeOptions = [30, 50, 100],
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = totalCount === 0 ? 0 : Math.min(totalCount, currentPage * pageSize);
  const pageNumbers = buildPageNumbers(currentPage, totalPages);

  return (
    <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate">
        총 {totalCount.toLocaleString("ko-KR")}
        {itemLabel} 중 {start.toLocaleString("ko-KR")} - {end.toLocaleString("ko-KR")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate">
          <span>페이지당</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-full border border-ink/10 px-3 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
        >
          이전
        </button>
        {pageNumbers.map((pageNumber, index) => {
          const previous = pageNumbers[index - 1];
          const showGap = previous !== undefined && pageNumber - previous > 1;

          return (
            <div key={pageNumber} className="flex items-center gap-2">
              {showGap ? <span className="px-1 text-slate">...</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(pageNumber)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  pageNumber === currentPage
                    ? "bg-ink text-white"
                    : "border border-ink/10 hover:border-ember/30 hover:text-ember"
                }`}
              >
                {pageNumber}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-full border border-ink/10 px-3 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  );
}
