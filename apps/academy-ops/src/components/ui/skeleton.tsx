export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-ink/8 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-9 w-20 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full max-w-[140px]" />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </>
  );
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded bg-ink/8 w-full"
      style={{ height }}
    />
  );
}
