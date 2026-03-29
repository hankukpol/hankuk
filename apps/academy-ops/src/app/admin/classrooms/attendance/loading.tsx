export default function ClassroomAttendanceLoading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-24 rounded-full bg-ink/10" />
        <div className="h-4 w-2 rounded-full bg-ink/10" />
        <div className="h-4 w-20 rounded-full bg-ink/10" />
      </div>
      <div className="h-6 w-20 rounded-full bg-forest/10" />
      <div className="mt-5 h-9 w-52 rounded-2xl bg-ink/10" />
      <div className="mt-2 h-4 w-44 rounded-full bg-ink/10" />
      <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-ink/10" />

      {/* ── 전체 KPI ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="mb-4 h-4 w-32 rounded-full bg-ink/10" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
            >
              <div className="h-3 w-16 rounded-full bg-ink/10" />
              <div className="mt-3 h-9 w-14 rounded-2xl bg-ink/10" />
              <div className="mt-2 h-3 w-20 rounded-full bg-ink/10" />
            </div>
          ))}
        </div>

        {/* 출석률 progress bar */}
        <div className="mt-4 rounded-[20px] border border-ink/10 bg-white p-4 shadow-panel">
          <div className="mb-2 flex items-center justify-between">
            <div className="h-3 w-20 rounded-full bg-ink/10" />
            <div className="h-4 w-8 rounded-full bg-ink/10" />
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
            <div className="h-full w-3/4 rounded-full bg-forest/20" />
          </div>
          <div className="mt-2 h-3 w-40 rounded-full bg-ink/10" />
        </div>
      </section>

      {/* ── 반별 현황 테이블 ─────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 h-4 w-24 rounded-full bg-ink/10" />
        <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  {["반 이름", "담임", "재적", "출석", "라이브", "공결", "결석", "미기록", "출석률", "상세"].map(
                    (col) => (
                      <th key={col} className="px-4 py-4 text-left">
                        <div className="h-3 w-12 rounded-full bg-ink/10" />
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <div className="h-4 w-28 rounded-full bg-ink/10" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-4 w-16 rounded-full bg-ink/10" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="ml-auto h-4 w-8 rounded-full bg-ink/10" />
                    </td>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-4 text-center">
                        <div className="mx-auto h-4 w-6 rounded-full bg-ink/10" />
                      </td>
                    ))}
                    <td className="px-4 py-4">
                      <div className="ml-auto h-5 w-10 rounded-full bg-ink/10" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 하단 링크 ─────────────────────────────────────────────────── */}
      <section className="mt-8 flex flex-wrap items-center gap-3">
        <div className="h-9 w-28 rounded-full bg-forest/10" />
        <div className="h-9 w-24 rounded-full bg-ink/10" />
      </section>
    </div>
  );
}
