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
          <div className="h-6 w-28 rounded-full bg-forest/10" />
          <div className="h-9 w-64 rounded-2xl bg-ink/10" />
          <div className="h-4 w-48 rounded-full bg-ink/10" />
        </div>
        <div className="h-10 w-28 rounded-full bg-ink/10" />
      </div>

      {/* Two-column layout */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Left column */}
        <div className="flex flex-col gap-6">
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

          {/* Note details card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-5 h-4 w-24 rounded-full bg-ink/10" />
            <div className="space-y-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-28 shrink-0 rounded-full bg-ink/10" />
                  <div className="h-4 flex-1 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Attachments card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-4 w-24 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-ink/10" />
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Actions card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-4 w-20 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              <div className="h-10 rounded-full bg-ink/10" />
              <div className="h-10 rounded-full bg-ink/10" />
            </div>
          </div>

          {/* Quick links card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-4 w-24 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              <div className="h-10 rounded-full bg-ink/10" />
              <div className="h-10 rounded-full bg-ink/10" />
            </div>
          </div>

          {/* Record meta card */}
          <div className="rounded-[28px] border border-ink/10 bg-mist p-6">
            <div className="h-4 w-20 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-16 rounded-full bg-ink/10" />
                  <div className="h-4 w-32 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
