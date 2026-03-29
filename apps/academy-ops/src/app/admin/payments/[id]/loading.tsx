export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <div className="h-4 w-20 rounded-full bg-ink/10" />
        <div className="h-3 w-3 rounded-full bg-ink/10" />
        <div className="h-4 w-16 rounded-full bg-ink/10" />
      </div>

      {/* Badge */}
      <div className="h-6 w-24 rounded-full bg-ember/10" />

      {/* Header row */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-9 w-52 rounded-2xl bg-ink/10" />
          <div className="h-4 w-28 rounded-full bg-ink/10" />
        </div>
        <div className="h-10 w-28 rounded-full bg-ink/10" />
      </div>

      {/* Payment detail card */}
      <div className="mt-8 space-y-6">
        {/* Main info card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 rounded-full bg-ink/10" />
                <div className="h-4 w-32 rounded-full bg-ink/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Items card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-20 rounded-full bg-ink/10" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>

        {/* Refund section */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-20 rounded-full bg-ink/10" />
          <div className="h-10 w-36 rounded-full bg-ink/10" />
        </div>
      </div>
    </div>
  );
}
