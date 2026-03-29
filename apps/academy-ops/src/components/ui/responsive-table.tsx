import type { ReactNode } from "react";

type ResponsiveTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  hideOnMobile?: boolean;
  mobileLabel?: ReactNode;
  cellClassName?: string;
};

type ResponsiveTableProps<T> = {
  data: T[];
  columns: ResponsiveTableColumn<T>[];
  keyExtractor: (row: T, index: number) => string;
  caption?: string;
  emptyState?: ReactNode;
  cardTitle?: (row: T) => ReactNode;
  cardDescription?: (row: T) => ReactNode;
};

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  caption,
  emptyState = "데이터가 없습니다.",
  cardTitle,
  cardDescription,
}: ResponsiveTableProps<T>) {
  const mobileColumns = columns.filter((column) => !column.hideOnMobile);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[28px] border border-ink/10 sm:block">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-mist/80 text-left">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className="px-4 py-3 font-semibold">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate">
                  {emptyState}
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={keyExtractor(row, index)}>
                  {columns.map((column) => (
                    <td key={column.id} className={column.cellClassName ?? "px-4 py-3"}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {data.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            {emptyState}
          </div>
        ) : (
          data.map((row, index) => (
            <article
              key={keyExtractor(row, index)}
              className="rounded-[24px] border border-ink/10 bg-white p-4 shadow-sm"
            >
              {cardTitle ? (
                <div className="border-b border-ink/10 pb-3">
                  <h3 className="text-sm font-semibold text-ink">{cardTitle(row)}</h3>
                  {cardDescription ? (
                    <p className="mt-1 text-xs text-slate">{cardDescription(row)}</p>
                  ) : null}
                </div>
              ) : null}
              <dl className={cardTitle ? "mt-3 space-y-3" : "space-y-3"}>
                {mobileColumns.map((column) => (
                  <div key={column.id} className="flex items-start justify-between gap-3">
                    <dt className="text-xs font-medium text-slate">{column.mobileLabel ?? column.header}</dt>
                    <dd className="text-right text-sm font-semibold text-ink">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
      </div>
    </>
  );
}
