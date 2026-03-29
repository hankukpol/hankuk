import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamDivision } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIVISION_LABEL: Record<ExamDivision, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const DIVISION_BADGE: Record<ExamDivision, string> = {
  GONGCHAE_M: "bg-blue-50 text-blue-700 border-blue-200",
  GONGCHAE_F: "bg-pink-50 text-pink-700 border-pink-200",
  GYEONGCHAE: "bg-purple-50 text-purple-700 border-purple-200",
  ONLINE: "bg-slate/10 text-slate border-ink/10",
};

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function SpecialExamDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { eventId } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findUnique({
    where: { id: eventId },
    include: {
      registrations: {
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
          score: {
            select: { score: true },
          },
        },
        orderBy: { registeredAt: "asc" },
      },
    },
  });

  if (!event) notFound();

  const activeRegs = event.registrations.filter((r) => !r.cancelledAt);
  const cancelledRegs = event.registrations.filter((r) => r.cancelledAt);

  // 구분별 집계
  const divisionCounts = Object.values(ExamDivision).map((d) => ({
    division: d,
    label: DIVISION_LABEL[d],
    count: activeRegs.filter((r) => r.division === d).length,
    paid: activeRegs.filter((r) => r.division === d && r.isPaid).length,
  }));

  const totalPaid = activeRegs.filter((r) => r.isPaid).length;
  const totalUnpaid = activeRegs.filter((r) => !r.isPaid).length;
  const totalRevenue = activeRegs.reduce((s, r) => s + r.paidAmount, 0);

  // 성적 현황 집계
  const allScores = activeRegs
    .filter((r) => r.score !== null)
    .map((r) => r.score!.score);
  const scoredCount = allScores.length;
  const scoreAvg =
    scoredCount > 0
      ? Math.round((allScores.reduce((s, v) => s + v, 0) / scoredCount) * 10) / 10
      : null;
  const passCount = allScores.filter((s) => s >= 60).length;
  const passRate =
    scoredCount > 0
      ? Math.round((passCount / scoredCount) * 1000) / 10
      : null;

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Breadcrumb / Back */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link
          href="/admin/exams/special"
          className="transition hover:text-ink"
        >
          특강모의고사
        </Link>
        <span>/</span>
        <span className="text-ink">{event.title}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            특강모의고사
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/exams/special/${eventId}/registrations`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-forest/30 hover:text-forest"
            >
              등록자 목록
            </Link>
            <Link
              href={`/admin/exams/special/${eventId}/scores`}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              성적 관리
            </Link>
          </div>
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{event.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate">
          <span>
            시험일:{" "}
            <span className="font-medium text-ink">
              {event.examDate.toISOString().slice(0, 10)}
            </span>
          </span>
          {event.venue && (
            <span>
              장소: <span className="font-medium text-ink">{event.venue}</span>
            </span>
          )}
          {event.registrationDeadline && (
            <span>
              접수 마감:{" "}
              <span className="font-medium text-ink">
                {event.registrationDeadline.toISOString().slice(0, 10)}
              </span>
            </span>
          )}
          {event.registrationFee > 0 && (
            <span>
              참가비:{" "}
              <span className="font-medium text-ember">
                {event.registrationFee.toLocaleString("ko-KR")}원
              </span>
            </span>
          )}
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
              event.isActive
                ? "border-forest/20 bg-forest/10 text-forest"
                : "border-ink/10 bg-ink/5 text-slate"
            }`}
          >
            {event.isActive ? "접수중" : "마감"}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">접수 현황</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              등록자 수
            </p>
            <p className="mt-3 text-2xl font-bold text-ink">{activeRegs.length}명</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              납부 완료
            </p>
            <p className="mt-3 text-2xl font-bold text-forest">{totalPaid}명</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              납부 미완료
            </p>
            <p
              className={`mt-3 text-2xl font-bold ${totalUnpaid > 0 ? "text-amber-600" : "text-ink"}`}
            >
              {totalUnpaid}명
            </p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
              수수료 수입
            </p>
            <p className="mt-3 text-2xl font-bold text-ember">
              {totalRevenue.toLocaleString("ko-KR")}원
            </p>
          </div>
        </div>
      </section>

      {/* Division breakdown */}
      {divisionCounts.some((d) => d.count > 0) && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-ink">구분별 현황</h2>
          <div className="flex flex-wrap gap-3">
            {divisionCounts
              .filter((d) => d.count > 0)
              .map((d) => (
                <div
                  key={d.division}
                  className={`rounded-[20px] border px-4 py-3 ${DIVISION_BADGE[d.division as ExamDivision]}`}
                >
                  <p className="text-xs font-semibold">{d.label}</p>
                  <p className="mt-1 text-xl font-bold">{d.count}명</p>
                  <p className="mt-0.5 text-xs opacity-70">납부 {d.paid}명</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 성적 현황 */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">성적 현황</h2>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Completion indicator */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                성적 입력
              </p>
              <p className="text-2xl font-bold text-ink">
                {scoredCount}{" "}
                <span className="text-base font-normal text-slate">
                  / {activeRegs.length} 성적 입력됨
                </span>
              </p>
              {activeRegs.length > 0 && (
                <div className="mt-1 h-2 w-48 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      scoredCount === activeRegs.length
                        ? "bg-forest"
                        : "bg-amber-400"
                    }`}
                    style={{
                      width: `${Math.round((scoredCount / activeRegs.length) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Score stats */}
            {scoredCount > 0 ? (
              <div className="flex flex-wrap gap-4">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                    평균 점수
                  </p>
                  <p className="mt-1 text-2xl font-bold text-ember">
                    {scoreAvg}점
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                    합격률(60점↑)
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold ${
                      (passRate ?? 0) >= 80
                        ? "text-forest"
                        : (passRate ?? 0) >= 60
                          ? "text-ink"
                          : "text-amber-600"
                    }`}
                  >
                    {passRate}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                    합격 인원
                  </p>
                  <p className="mt-1 text-2xl font-bold text-forest">
                    {passCount}명
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate">
                아직 입력된 성적이 없습니다.
              </p>
            )}

            {/* 성적 관리 버튼 */}
            <Link
              href={`/admin/exams/special/${eventId}/scores`}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              성적 관리
            </Link>
          </div>
        </div>
      </section>

      {/* Navigation Sub-pages */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">세부 관리</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href={`/admin/exams/special/${eventId}/registrations`}
            className="group flex items-start gap-4 rounded-[24px] border border-ink/10 bg-white p-5 transition hover:border-forest/30 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest group-hover:bg-forest group-hover:text-white transition">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">등록자 목록</p>
              <p className="mt-0.5 text-sm text-slate">
                접수 {activeRegs.length}명 · 취소 {cancelledRegs.length}명
              </p>
            </div>
          </Link>
          <Link
            href={`/admin/exams/special/${eventId}/scores`}
            className="group flex items-start gap-4 rounded-[24px] border border-ink/10 bg-white p-5 transition hover:border-ember/30 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ember/10 text-ember group-hover:bg-ember group-hover:text-white transition">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">성적 관리</p>
              <p className="mt-0.5 text-sm text-slate">
                입력 {scoredCount}명 / 전체 {activeRegs.length}명
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* Print Action */}
      <div className="flex items-center gap-3 no-print">
        <Link
          href={`/admin/exams/special/${eventId}/registrations`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          명단 인쇄
        </Link>
        <Link
          href="/admin/exams/special"
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          &larr; 특강모의고사 목록
        </Link>
      </div>
    </div>
  );
}
