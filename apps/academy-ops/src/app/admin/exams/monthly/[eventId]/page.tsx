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

export default async function ExamEventDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

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
              examType: true,
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
      {/* Back */}
      <div className="flex items-center gap-2">
        <Link
          href="/admin/exams/monthly"
          className="text-sm text-slate transition hover:text-ink"
        >
          &larr; 월말평가 목록
        </Link>
      </div>

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            월말평가 접수
          </div>
          <Link
            href={`/admin/exams/monthly/${eventId}/scores`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            성적 입력
          </Link>
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
              총 접수
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
              수납 총액
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

            {/* 성적 입력 button */}
            <Link
              href={`/admin/exams/monthly/${eventId}/scores`}
              className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
            >
              성적 입력
            </Link>
          </div>
        </div>
      </section>

      {/* Registrations table */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">
          등록 학생 목록
          <span className="ml-2 text-sm font-normal text-slate">
            ({activeRegs.length}명)
          </span>
        </h2>

        {activeRegs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            접수된 학생이 없습니다.{" "}
            <Link
              href="/admin/exams/monthly"
              className="text-ember underline hover:text-ember/80"
            >
              접수 페이지로 이동
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {["#", "이름", "학번", "연락처", "구분", "납부", "납부금액", "좌석번호", "접수일시", "영수증"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {activeRegs.map((reg, i) => {
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const phone = reg.student?.phone ?? reg.externalPhone ?? "-";
                  const isStudent = !!reg.student;

                  return (
                    <tr key={reg.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">
                        {i + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="hover:text-forest hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span>
                            {name}
                            <span className="ml-1 rounded-full bg-slate/10 px-1.5 py-0.5 text-xs text-slate">
                              외부
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.examNumber ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {phone}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${DIVISION_BADGE[reg.division]}`}
                        >
                          {DIVISION_LABEL[reg.division]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            reg.isPaid
                              ? "bg-forest/10 text-forest"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {reg.isPaid ? "납부" : "미납"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                        {reg.paidAmount > 0
                          ? `${reg.paidAmount.toLocaleString("ko-KR")}원`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.seatNumber ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {reg.registeredAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="px-4 py-3">
                        {reg.isPaid && (
                          <Link
                            href={`/admin/exams/monthly/${eventId}/receipt/${reg.id}`}
                            target="_blank"
                            className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ember/30 hover:text-ember"
                          >
                            영수증
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-forest text-white">
                  <td className="px-4 py-3 font-bold" colSpan={2}>
                    합계
                  </td>
                  <td colSpan={4} className="px-4 py-3 text-sm">
                    총 {activeRegs.length}명 · 납부 {totalPaid}명 · 미납 {totalUnpaid}명
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">
                    {totalRevenue.toLocaleString("ko-KR")}원
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Cancelled registrations */}
      {cancelledRegs.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-ink">
            취소된 접수
            <span className="ml-2 text-sm font-normal text-slate">
              ({cancelledRegs.length}건)
            </span>
          </h2>
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {["이름", "학번", "구분", "취소일시"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cancelledRegs.map((reg) => {
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const isStudent = !!reg.student;
                  return (
                    <tr key={reg.id} className="opacity-60">
                      <td className="whitespace-nowrap px-4 py-3 text-slate line-through">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="hover:text-forest hover:no-underline hover:opacity-100"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {reg.examNumber ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate/10 px-2 py-0.5 text-xs text-slate">
                          {DIVISION_LABEL[reg.division]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {reg.cancelledAt
                          ? reg.cancelledAt.toISOString().slice(0, 16).replace("T", " ")
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Back to list */}
      <div className="no-print pt-2">
        <Link
          href="/admin/exams/monthly"
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          &larr; 월말평가 목록으로
        </Link>
      </div>
    </div>
  );
}
