"use client";

import Link from "next/link";
import { useState } from "react";
import type { ExamEventRow } from "./page";

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채(남)",
  GONGCHAE_F: "공채(여)",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

// ── 비용 포맷 헬퍼 ────────────────────────────────────────────────────────────

function formatFee(amount: number): string {
  if (amount === 0) return "0원";
  if (amount >= 10_000) {
    const man = Math.floor(amount / 10_000);
    const rest = amount % 10_000;
    return rest === 0 ? `${man.toLocaleString()}만원` : `${amount.toLocaleString()}원`;
  }
  return `${amount.toLocaleString()}원`;
}

// ── ExamCard (확장 가능한 카드) ───────────────────────────────────────────────

function ExamCard({ event }: { event: ExamEventRow }) {
  const [expanded, setExpanded] = useState(false);
  const { stats } = event;

  const examDateObj = new Date(event.examDate);
  const now = new Date();
  const isPast = examDateObj < now;
  const daysFromNow = Math.ceil(
    (examDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  const scorePct =
    stats.total > 0 ? Math.round((stats.scored / stats.total) * 100) : 0;

  return (
    <div
      className={`overflow-hidden rounded-[28px] border transition ${
        expanded ? "border-purple-300 bg-purple-50/30" : "border-ink/10 bg-white"
      } shadow-panel`}
    >
      {/* 카드 헤더 */}
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* D-day / 경과 배지 */}
              {!isPast ? (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    daysFromNow <= 7
                      ? "bg-red-50 text-red-600"
                      : daysFromNow <= 30
                        ? "bg-amber-50 text-amber-700"
                        : "bg-purple-50 text-purple-600"
                  }`}
                >
                  D-{daysFromNow}
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-ink/5 px-2.5 py-0.5 text-xs text-slate">
                  종료
                </span>
              )}
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  event.isActive
                    ? "bg-forest/10 text-forest"
                    : "bg-ink/5 text-slate"
                }`}
              >
                {event.isActive ? "활성" : "비활성"}
              </span>
            </div>

            <Link
              href={`/admin/exams/external/${event.id}`}
              className="mt-2 block text-lg font-semibold text-ink transition hover:text-forest"
            >
              {event.title}
            </Link>

            <p className="mt-1 text-sm text-slate">
              {examDateObj.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
              {event.venue && ` · ${event.venue}`}
              {event.registrationFee > 0 && (
                <span className="ml-2 text-ember">
                  참가비 {formatFee(event.registrationFee)}
                </span>
              )}
            </p>
          </div>

          {/* 우측 액션 버튼 */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/admin/exams/external/${event.id}/scores`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#C55A11] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b04e0f]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              결과 입력
            </Link>
            <Link
              href={`/admin/exams/external/${event.id}`}
              className="inline-flex items-center rounded-full border border-purple-200 px-4 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-50"
            >
              상세보기
            </Link>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold text-slate transition hover:border-purple-200 hover:text-purple-700"
              aria-expanded={expanded}
            >
              응시자 현황
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`ml-1.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {/* 미니 KPI 바 */}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-ink/5 pt-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-slate">총 응시</span>
            <span className="font-semibold text-ink">{stats.total}명</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate">재원생</span>
            <span className="font-semibold text-forest">{stats.internalStudents}명</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate">외부</span>
            <span className="font-semibold text-slate">{stats.externalApplicants}명</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate">납부</span>
            <span className="font-semibold text-ember">{stats.paid}명</span>
            {stats.unpaid > 0 && (
              <span className="text-xs text-amber-600">(미납 {stats.unpaid}명)</span>
            )}
          </div>
          {stats.totalFees > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate">납부 합계</span>
              <span className="font-semibold text-ember">{formatFee(stats.totalFees)}</span>
            </div>
          )}
          {/* 성적 입력 진행률 */}
          {isPast && stats.total > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate">성적 입력</span>
              <div className="h-2 w-20 overflow-hidden rounded-full bg-ink/10">
                <div
                  className={`h-full rounded-full ${
                    scorePct === 100
                      ? "bg-forest"
                      : scorePct > 0
                        ? "bg-amber-400"
                        : "bg-ink/20"
                  }`}
                  style={{ width: `${scorePct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate">
                {stats.scored}/{stats.total}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 확장 응시자 현황 섹션 */}
      {expanded && (
        <div className="border-t border-purple-200/70 bg-white px-6 py-5">
          <h3 className="mb-4 text-sm font-semibold text-ink">응시자 현황 세부</h3>

          {stats.total === 0 ? (
            <p className="text-sm text-slate">등록된 응시자가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {/* 구분별 인원 */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
                  구분별 인원
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.divisionCounts).map(([div, count]) => (
                    <span
                      key={div}
                      className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700"
                    >
                      {DIVISION_LABEL[div] ?? div}
                      <span className="rounded-full bg-purple-200 px-1.5 py-0.5 text-xs font-bold text-purple-800">
                        {count}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 납부 현황 */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
                  납부 현황
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-forest" />
                      <span className="text-sm text-slate">
                        납부 완료{" "}
                        <span className="font-semibold text-forest">{stats.paid}명</span>
                      </span>
                    </div>
                    {stats.unpaid > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-sm text-slate">
                          미납{" "}
                          <span className="font-semibold text-amber-700">{stats.unpaid}명</span>
                        </span>
                      </div>
                    )}
                    {stats.totalFees > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-ember" />
                        <span className="text-sm text-slate">
                          납부 합계{" "}
                          <span className="font-semibold text-ember">
                            {formatFee(stats.totalFees)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 납부율 바 */}
                  {stats.total > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-slate">납부율</span>
                      <div className="h-3 w-28 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-forest transition-all"
                          style={{
                            width: `${Math.round((stats.paid / stats.total) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-forest">
                        {Math.round((stats.paid / stats.total) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 성적 입력 현황 */}
              {isPast && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
                    성적 입력 현황
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-40 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={`h-full rounded-full transition-all ${
                          scorePct === 100
                            ? "bg-forest"
                            : scorePct > 0
                              ? "bg-amber-400"
                              : "bg-ink/20"
                        }`}
                        style={{ width: `${scorePct}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate">
                      <span className="font-semibold text-ink">{stats.scored}</span> /{" "}
                      {stats.total}명 입력 완료 ({scorePct}%)
                    </span>
                    {scorePct < 100 && (
                      <Link
                        href={`/admin/exams/external/${event.id}/scores`}
                        className="ml-auto inline-flex items-center rounded-full bg-[#C55A11] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#b04e0f]"
                      >
                        성적 입력하기 →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* 상세 링크 */}
              <div className="border-t border-ink/5 pt-3">
                <Link
                  href={`/admin/exams/external/${event.id}`}
                  className="text-sm font-semibold text-purple-700 transition hover:text-purple-900"
                >
                  전체 응시자 목록 보기 →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 매니저 컴포넌트 ──────────────────────────────────────────────────────

export function ExternalExamManager({ initialEvents }: { initialEvents: ExamEventRow[] }) {
  const [events, setEvents] = useState<ExamEventRow[]>(initialEvents);
  const [showNewModal, setShowNewModal] = useState(false);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "past">("all");

  const now = new Date();

  const filtered = events.filter((e) => {
    if (filterActive === "active") return e.isActive && new Date(e.examDate) >= now;
    if (filterActive === "past") return new Date(e.examDate) < now;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 필터 + 등록 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "past"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                filterActive === f
                  ? "border-purple-600 bg-purple-600 text-white"
                  : "border-ink/10 text-slate hover:border-purple-200 hover:text-purple-700"
              }`}
            >
              {f === "all" ? "전체" : f === "active" ? "예정/진행" : "종료"}
              <span className="ml-1.5 text-xs opacity-70">
                {f === "all"
                  ? events.length
                  : f === "active"
                    ? events.filter((e) => e.isActive && new Date(e.examDate) >= now).length
                    : events.filter((e) => new Date(e.examDate) < now).length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded-2xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
        >
          + 외부시험 등록
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-panel">
          <p className="text-sm text-slate">
            {filterActive === "all"
              ? "등록된 외부시험이 없습니다."
              : filterActive === "active"
                ? "예정된 시험이 없습니다."
                : "종료된 시험이 없습니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((e) => (
            <ExamCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewEventModal
          onClose={() => setShowNewModal(false)}
          onCreated={(event) => {
            setEvents((prev) => [event, ...prev]);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── 신규 시험 등록 모달 ───────────────────────────────────────────────────────

function NewEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: ExamEventRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [venue, setVenue] = useState("");
  const [registrationFee, setRegistrationFee] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/exams/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          examDate,
          venue: venue || null,
          registrationFee: registrationFee ? parseInt(registrationFee, 10) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      onCreated({
        ...data.event,
        examDate: data.event.examDate,
        registrationDeadline: null,
        _count: { registrations: 0 },
        stats: {
          total: 0,
          paid: 0,
          unpaid: 0,
          scored: 0,
          internalStudents: 0,
          externalApplicants: 0,
          totalFees: 0,
          divisionCounts: {},
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">외부시험 등록</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate">시험명 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="예: 2026 경찰청 순경 공개채용 필기"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate">시험일 *</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate">시험장소</label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="선택 입력"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate">참가비 (원)</label>
            <input
              type="number"
              value={registrationFee}
              onChange={(e) => setRegistrationFee(e.target.value)}
              placeholder="0 (무료)"
              min="0"
              step="1000"
              className="mt-1 block w-full rounded-2xl border border-ink/20 bg-mist/30 px-4 py-2.5 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-ink/20 py-2.5 text-sm hover:bg-mist"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
