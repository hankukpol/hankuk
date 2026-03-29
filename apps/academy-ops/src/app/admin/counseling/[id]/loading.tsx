export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 rounded-full bg-ink/10" />
        <div className="h-3 w-3 rounded-full bg-ink/10" />
        <div className="h-4 w-24 rounded-full bg-ink/10" />
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-20 rounded-full bg-forest/10" />
          <div className="h-9 w-56 rounded-2xl bg-ink/10" />
          <div className="h-4 w-48 rounded-full bg-ink/10" />
        </div>
        <div className="h-10 w-28 rounded-full bg-ink/10" />
      </div>

      {/* Two-column layout */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Student info card */}
          <div className="rounded-[28px] border border-ink/10 bg-white">
            <div className="border-b border-ink/10 px-6 py-4">
              <div className="h-4 w-20 rounded-full bg-ink/10" />
            </div>
            <div className="divide-y divide-ink/10">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-4 px-6 py-4">
                  <div className="h-4 w-28 rounded-full bg-ink/10" />
                  <div className="h-4 w-32 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Counseling record card */}
          <div className="space-y-2">
            <div className="h-6 w-28 rounded-full bg-ink/10" />
            <div className="h-4 w-64 rounded-full bg-ink/10" />
            <div className="mt-2 rounded-[28px] border border-ink/10 bg-white p-6">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 rounded-2xl bg-ink/10" style={{ width: `${70 + (i % 3) * 10}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Other records card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-4 w-40 rounded-full bg-ink/10" />
            <div className="mt-4 divide-y divide-ink/10">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="h-3 w-20 shrink-0 rounded-full bg-ink/10" />
                  <div className="h-4 flex-1 rounded-full bg-ink/10" />
                  <div className="h-3 w-12 shrink-0 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick links */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-4 w-24 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              <div className="h-10 rounded-full bg-ink/10" />
              <div className="h-10 rounded-full bg-ink/10" />
            </div>
          </div>

          {/* Record meta */}
          <div className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <div className="h-4 w-20 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-16 rounded-full bg-ink/10" />
                  <div className="h-4 w-28 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
