export default function Loading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* Badge */}
      <div className="h-6 w-20 rounded-full bg-ember/10" />

      {/* Header row */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="h-9 w-56 rounded-2xl bg-ink/10" />
        <div className="h-4 w-16 rounded-full bg-ink/10" />
      </div>

      {/* Lecture detail content */}
      <div className="mt-8 space-y-6">
        {/* Info card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 h-5 w-24 rounded-full bg-ink/10" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 rounded-full bg-ink/10" />
                <div className="h-5 w-24 rounded-2xl bg-ink/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Subjects table card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-24 rounded-full bg-ink/10" />
            <div className="h-8 w-24 rounded-full bg-ink/10" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>

        {/* Enrollment list card */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-28 rounded-full bg-ink/10" />
            <div className="h-8 w-24 rounded-full bg-ink/10" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-2xl bg-ink/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
