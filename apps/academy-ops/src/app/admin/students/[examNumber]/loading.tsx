export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Back link skeleton */}
      <div className="h-4 w-24 rounded-full bg-ink/10" />

      {/* Header */}
      <div className="mt-3 space-y-2">
        <div className="h-9 w-56 rounded-2xl bg-ink/10" />
        <div className="h-5 w-72 rounded-full bg-ink/10" />
      </div>

      {/* Action buttons row */}
      <div className="mt-3 flex gap-2">
        <div className="h-7 w-24 rounded-full bg-ink/10" />
        <div className="h-7 w-24 rounded-full bg-ink/10" />
      </div>

      {/* Tabs bar */}
      <div className="mt-8 flex gap-1 border-b border-ink/10 pb-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 w-16 rounded-t-2xl bg-ink/10" />
        ))}
      </div>

      {/* Tab content area */}
      <div className="mt-6 space-y-6">
        {/* Top content card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="h-5 w-32 rounded-full bg-ink/10" />
          <div className="mt-4 space-y-3">
            <div className="h-4 w-full rounded-2xl bg-ink/10" />
            <div className="h-4 w-4/5 rounded-2xl bg-ink/10" />
            <div className="h-4 w-3/5 rounded-2xl bg-ink/10" />
          </div>
        </div>

        {/* Main score table card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-10 flex-1 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
