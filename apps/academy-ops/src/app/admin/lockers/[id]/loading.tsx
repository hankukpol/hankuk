export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Back link */}
      <div className="h-4 w-28 rounded-full bg-ink/10" />

      {/* Badge + header */}
      <div className="mt-4 h-6 w-20 rounded-full bg-ink/10" />
      <div className="mt-5 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-9 w-48 rounded-2xl bg-ink/10" />
          <div className="h-4 w-20 rounded-full bg-ink/10" />
        </div>
        <div className="h-7 w-20 rounded-full bg-ink/10" />
      </div>

      {/* Locker info card */}
      <div className="mt-8 space-y-6">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-28 rounded-full bg-ink/10" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 rounded-full bg-ink/10" />
                <div className="h-5 w-24 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
          {/* Assign / release button area */}
          <div className="mt-6 flex gap-2">
            <div className="h-10 w-32 rounded-full bg-ink/10" />
          </div>
        </div>

        {/* Rental history card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
