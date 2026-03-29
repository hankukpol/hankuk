export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Badge skeleton */}
      <div className="h-6 w-24 rounded-full bg-forest/10" />

      {/* Header row */}
      <div className="mt-4 flex items-center gap-4">
        <div className="h-9 w-40 rounded-2xl bg-ink/10" />
        <div className="h-4 w-16 rounded-full bg-ink/10" />
        <div className="h-4 w-28 rounded-full bg-ink/10" />
      </div>

      {/* Detail card */}
      <div className="mt-8 max-w-3xl space-y-6">
        {/* Status + course type row */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-28 rounded-full bg-ink/10" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 rounded-full bg-ink/10" />
                <div className="h-5 w-32 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Fee section */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-20 rounded-full bg-ink/10" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 rounded-full bg-ink/10" />
                <div className="h-4 w-28 rounded-full bg-ink/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Audit log section */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
