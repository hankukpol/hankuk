import { CardSkeleton, ChartSkeleton } from "@/components/ui/skeleton";

export default function AdminDashboardLoading() {
  return (
    <div className="p-8 sm:p-10 space-y-8">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="animate-pulse h-4 w-32 rounded bg-ink/8" />
        <div className="animate-pulse h-8 w-64 rounded bg-ink/8" />
        <div className="animate-pulse h-4 w-96 rounded bg-ink/8" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Chart skeleton */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="animate-pulse h-4 w-32 rounded bg-ink/8 mb-6" />
        <ChartSkeleton height={260} />
      </div>

      {/* Second chart row */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="animate-pulse h-4 w-24 rounded bg-ink/8 mb-6" />
          <ChartSkeleton height={200} />
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="animate-pulse h-4 w-24 rounded bg-ink/8 mb-6" />
          <ChartSkeleton height={200} />
        </div>
      </div>
    </div>
  );
}
