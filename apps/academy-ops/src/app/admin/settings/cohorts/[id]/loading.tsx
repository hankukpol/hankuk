export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Breadcrumb nav */}
      <div className="flex items-center gap-3">
        <div className="h-4 w-24 rounded-full bg-ink/10" />
        <div className="h-3 w-2 rounded-full bg-ink/10" />
        <div className="h-4 w-32 rounded-full bg-ink/10" />
      </div>

      {/* Badge + header */}
      <div className="mt-4 h-6 w-28 rounded-full bg-forest/10" />
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="space-y-2">
          <div className="h-9 w-56 rounded-2xl bg-ink/10" />
          <div className="h-4 w-32 rounded-full bg-ink/10" />
        </div>
        <div className="ml-auto flex gap-2">
          <div className="h-9 w-24 rounded-[20px] bg-ink/10" />
          <div className="h-9 w-32 rounded-full bg-ink/10" />
        </div>
      </div>

      {/* Edit panel skeleton */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded-full bg-ink/10" />
              <div className="h-9 rounded-2xl bg-ink/10" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-10 w-24 rounded-full bg-ink/10" />
        </div>
      </div>

      {/* Capacity stats row */}
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[28px] border border-ink/10 bg-white p-5">
            <div className="h-3 w-16 rounded-full bg-ink/10" />
            <div className="mt-2 h-8 w-12 rounded-2xl bg-ink/10" />
          </div>
        ))}
      </div>

      {/* Student list table */}
      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="mb-4 h-5 w-28 rounded-full bg-ink/10" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-2xl bg-ink/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
