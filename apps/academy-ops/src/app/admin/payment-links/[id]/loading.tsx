export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-4 w-28 rounded-full bg-ink/10" />
        <div className="h-3 w-3 rounded-full bg-ink/10" />
        <div className="h-4 w-12 rounded-full bg-ink/10" />
      </div>

      {/* Badge */}
      <div className="h-6 w-24 rounded-full bg-ember/10" />

      {/* Title + status badge */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="h-9 w-56 rounded-2xl bg-ink/10" />
        <div className="h-6 w-14 rounded-full bg-ink/10" />
      </div>

      {/* Three-column grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Main 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Link info card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-24 rounded-full bg-ink/10" />
                  <div className="h-4 w-32 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Payment history card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-4 h-5 w-32 rounded-full bg-ink/10" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded-2xl bg-ink/10" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar 1/3 */}
        <div className="space-y-4">
          {/* URL + QR card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-5 w-20 rounded-full bg-ink/10" />
            <div className="mt-3 h-8 rounded-lg bg-ink/10" />
            <div className="mt-4 mx-auto h-36 w-36 rounded-xl bg-ink/10" />
            <div className="mt-2 mx-auto h-3 w-28 rounded-full bg-ink/10" />
            <div className="mt-4 space-y-2">
              <div className="h-10 rounded-full bg-ink/10" />
            </div>
          </div>

          {/* Auto-enrollment config card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-4 h-5 w-36 rounded-full bg-ink/10" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-20 rounded-full bg-ink/10" />
                  <div className="h-4 w-24 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Stats card */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-4 h-5 w-12 rounded-full bg-ink/10" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-20 rounded-full bg-ink/10" />
                  <div className="h-4 w-16 rounded-full bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
