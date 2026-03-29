export default function ScoreSessionsLoading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-20 rounded-full bg-ink/10" />
      </div>
      <div className="h-6 w-20 rounded-full bg-ember/10" />
      <div className="mt-5 h-9 w-56 rounded-2xl bg-ink/10" />
      <div className="mt-4 space-y-2">
        <div className="h-4 w-full max-w-xl rounded-full bg-ink/10" />
        <div className="h-4 w-full max-w-md rounded-full bg-ink/10" />
      </div>

      {/* ── KPI 카드 ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
            >
              <div className="h-3 w-20 rounded-full bg-ink/10" />
              <div className="mt-3 h-9 w-12 rounded-2xl bg-ink/10" />
              <div className="mt-2 h-3 w-28 rounded-full bg-ink/10" />
            </div>
          ))}
        </div>
      </section>

      {/* ── 필터 폼 ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 h-4 w-10 rounded-full bg-ink/10" />
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-3 w-12 rounded-full bg-ink/10" />
                <div className="h-10 w-full rounded-xl bg-ink/10" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-4 w-28 rounded-full bg-ink/10" />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-9 w-16 rounded-full bg-ember/10" />
          </div>
        </div>
      </section>

      {/* ── 세션 목록 — 기수 그룹 스켈레톤 ──────────────────────────── */}
      <section className="mt-10">
        <div className="mb-4 h-4 w-36 rounded-full bg-ink/10" />

        <div className="space-y-6">
          {/* 기수 그룹 1 */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-5 w-32 rounded-full bg-ink/10" />
              <div className="h-5 w-16 rounded-full bg-ink/10" />
              <div className="h-5 w-20 rounded-full bg-amber-100" />
              <div className="flex-1 border-b border-ink/10" />
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <th key={i} className="px-4 py-4">
                          <div className="h-3 w-12 rounded-full bg-ink/10" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-3">
                          <div className="h-4 w-28 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-5 w-16 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-12 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-20 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="ml-auto h-4 w-10 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-5 w-14 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <div className="h-6 w-10 rounded-full bg-ink/10" />
                            <div className="h-6 w-10 rounded-full bg-ember/10" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 기수 그룹 2 */}
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-5 w-28 rounded-full bg-ink/10" />
              <div className="h-5 w-16 rounded-full bg-ink/10" />
              <div className="flex-1 border-b border-ink/10" />
            </div>
            <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[740px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <th key={i} className="px-4 py-4">
                          <div className="h-3 w-12 rounded-full bg-ink/10" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-3">
                          <div className="h-4 w-28 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-5 w-16 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-12 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-20 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="ml-auto h-4 w-10 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-5 w-14 rounded-full bg-ink/10" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <div className="h-6 w-10 rounded-full bg-ink/10" />
                            <div className="h-6 w-10 rounded-full bg-forest/10" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
