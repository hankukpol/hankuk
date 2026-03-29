export default function AdminMemosLoading() {
  return (
    <div className="animate-pulse p-8 sm:p-10">
      {/* ── 헤더 ──────────────────────────────────────────────────────── */}
      <div className="h-6 w-32 rounded-full bg-amber-100" />
      <div className="mt-5 h-9 w-36 rounded-2xl bg-ink/10" />
      <div className="mt-4 space-y-2">
        <div className="h-4 w-full max-w-xl rounded-full bg-ink/10" />
        <div className="h-4 w-full max-w-md rounded-full bg-ink/10" />
      </div>

      {/* ── 메모 보드 ─────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-8">
        {/* 상단: 작성 폼 + 통계 패널 2열 */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          {/* 작성 폼 카드 */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="h-6 w-28 rounded-full bg-forest/10" />
            <div className="mt-4 h-8 w-40 rounded-2xl bg-ink/10" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full max-w-md rounded-full bg-ink/10" />
              <div className="h-4 w-60 rounded-full bg-ink/10" />
            </div>

            <div className="mt-6 space-y-4">
              {/* 제목 입력 */}
              <div>
                <div className="mb-2 h-4 w-10 rounded-full bg-ink/10" />
                <div className="h-11 w-full rounded-2xl bg-ink/10" />
              </div>
              {/* 내용 textarea */}
              <div>
                <div className="mb-2 h-4 w-16 rounded-full bg-ink/10" />
                <div className="h-36 w-full rounded-2xl bg-ink/10" />
              </div>
              {/* 2열 입력 */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 h-4 w-12 rounded-full bg-ink/10" />
                  <div className="h-11 w-full rounded-2xl bg-ink/10" />
                </div>
                <div>
                  <div className="mb-2 h-4 w-12 rounded-full bg-ink/10" />
                  <div className="h-11 w-full rounded-2xl bg-ink/10" />
                </div>
              </div>
              {/* 3열 입력 */}
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <div className="mb-2 h-4 w-14 rounded-full bg-ink/10" />
                    <div className="h-11 w-full rounded-2xl bg-ink/10" />
                  </div>
                ))}
              </div>
              {/* 저장 버튼 */}
              <div className="flex gap-2 pt-1">
                <div className="h-10 w-24 rounded-full bg-ember/10" />
              </div>
            </div>
          </div>

          {/* 통계 패널 */}
          <div className="space-y-4">
            {/* 검색 + 필터 */}
            <div className="rounded-[28px] border border-ink/10 bg-white p-5">
              <div className="h-10 w-full rounded-2xl bg-ink/10" />
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 w-16 rounded-full bg-ink/10" />
                ))}
              </div>
            </div>
            {/* KPI 미니 카드들 */}
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[20px] border border-ink/10 bg-white p-4">
                  <div className="h-3 w-14 rounded-full bg-ink/10" />
                  <div className="mt-2 h-8 w-10 rounded-2xl bg-ink/10" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 메모 카드 목록 */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-4 w-24 rounded-full bg-ink/10" />
            <div className="flex-1 border-b border-ink/10" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 다양한 색상으로 메모 카드 스켈레톤 */}
            {[
              "border-[#E7D3A8] bg-[#FFF8E7]",
              "border-[#BFE2D0] bg-[#F1FFF7]",
              "border-[#BFD8F5] bg-[#F4FAFF]",
              "border-[#EDC2CC] bg-[#FFF5F7]",
              "border-[#CBD5E1] bg-[#F8FAFC]",
              "border-[#E7D3A8] bg-[#FFF8E7]",
            ].map((colorClass, i) => (
              <div
                key={i}
                className={`rounded-[24px] border p-5 ${colorClass}`}
              >
                {/* 상단 메타 */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-5 w-14 rounded-full bg-ink/10" />
                  <div className="h-5 w-12 rounded-full bg-ink/10" />
                </div>
                {/* 제목 */}
                <div className="h-5 w-3/4 rounded-full bg-ink/10" />
                {/* 내용 줄들 */}
                <div className="mt-3 space-y-2">
                  <div className="h-3.5 w-full rounded-full bg-ink/10" />
                  <div className="h-3.5 w-5/6 rounded-full bg-ink/10" />
                  <div className="h-3.5 w-2/3 rounded-full bg-ink/10" />
                </div>
                {/* 하단 메타 */}
                <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
                  <div className="h-4 w-16 rounded-full bg-ink/10" />
                  <div className="flex gap-1">
                    <div className="h-7 w-14 rounded-full bg-ink/10" />
                    <div className="h-7 w-10 rounded-full bg-ink/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
