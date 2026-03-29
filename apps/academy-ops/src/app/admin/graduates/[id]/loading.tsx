export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-4 w-24 rounded-full bg-ink/10" />
        <div className="h-3 w-3 rounded-full bg-ink/10" />
        <div className="h-4 w-20 rounded-full bg-ink/10" />
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-24 rounded-full bg-amber-100" />
          <div className="h-9 w-48 rounded-2xl bg-ink/10" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-[20px] bg-ink/10" />
          <div className="h-9 w-28 rounded-[20px] bg-ink/10" />
        </div>
      </div>

      {/* Student info + pass info card */}
      <div className="mt-8 space-y-6">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-28 rounded-full bg-ink/10" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 rounded-full bg-ink/10" />
                <div className="h-5 w-24 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Score snapshot section */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-32 rounded-full bg-ink/10" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 rounded-full bg-ink/10" />
                <div className="h-8 w-16 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>

        {/* Testimony card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-20 rounded-full bg-ink/10" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded-2xl bg-ink/10" />
            <div className="h-4 w-4/5 rounded-2xl bg-ink/10" />
            <div className="h-4 w-3/5 rounded-2xl bg-ink/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
