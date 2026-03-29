import { TableSkeleton } from "@/components/ui/skeleton";

export default function PaymentsLoading() {
  return (
    <div className="p-8 sm:p-10 space-y-6">
      <div className="space-y-3">
        <div className="animate-pulse h-4 w-28 rounded bg-ink/8" />
        <div className="animate-pulse h-8 w-48 rounded bg-ink/8" />
      </div>
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {Array.from({ length: 11 }).map((_, i) => (
                  <th key={i} className="px-4 py-3 bg-mist/50">
                    <div className="animate-pulse h-3 w-16 rounded bg-ink/8" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              <TableSkeleton rows={8} cols={11} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
