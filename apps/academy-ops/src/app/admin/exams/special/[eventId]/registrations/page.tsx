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

export default async function SpecialExamRegistrationsPage({ params }: PageProps) {
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
        orderBy: [{ division: "asc" }, { registeredAt: "asc" }],
      },
    },
  });

  if (!event) notFound();

  const activeRegs = event.registrations.filter((r) => !r.cancelledAt);
  const cancelledRegs = event.registrations.filter((r) => r.cancelledAt);

  const totalPaid = activeRegs.filter((r) => r.isPaid).length;
  const totalUnpaid = activeRegs.filter((r) => !r.isPaid).length;
  const totalRevenue = activeRegs.reduce((s, r) => s + r.paidAmount, 0);
  const attendedCount = activeRegs.filter((r) => r.score !== null).length;

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/exams/special" className="transition hover:text-ink">
          특강모의고사
        </Link>
        <span>/</span>
        <Link
          href={`/admin/exams/special/${eventId}`}
          className="transition hover:text-ink"
        >
          {event.title}
        </Link>
        <span>/</span>
        <span className="text-ink">등록자 목록</span>
      </div>

      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          특강모의고사 — 등록자 목록
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
        </div>
      </div>

      {/* Summary counts */}
      <section>
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
              응시(성적입력)
            </p>
            <p className="mt-3 text-2xl font-bold text-ember">{attendedCount}명</p>
          </div>
        </div>
      </section>

      {/* Active registrations table */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            등록 명단
            <span className="ml-2 text-sm font-normal text-slate">
              ({activeRegs.length}명)
            </span>
          </h2>
        </div>

        {activeRegs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
            접수된 학생이 없습니다.{" "}
            <Link
              href={`/admin/exams/special/${eventId}`}
              className="text-ember underline hover:text-ember/80"
            >
              시험 상세로 이동
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60">
                  {[
                    "#",
                    "학번",
                    "이름",
                    "연락처",
                    "구분",
                    "등록일",
                    "납부",
                    "납부금액",
                    "좌석번호",
                    "응시여부",
                  ].map((h) => (
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
                {activeRegs.map((reg, i) => {
                  const name = reg.student?.name ?? reg.externalName ?? "-";
                  const phone = reg.student?.phone ?? reg.externalPhone ?? "-";
                  const isStudent = !!reg.student;
                  const hasScore = reg.score !== null;

                  return (
                    <tr key={reg.id} className="transition hover:bg-mist/30">
                      <td className="px-4 py-3 tabular-nums text-xs text-slate">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="font-mono text-xs font-semibold text-forest hover:underline"
                          >
                            {reg.examNumber}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
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
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {reg.registeredAt.toISOString().slice(0, 16).replace("T", " ")}
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
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            hasScore
                              ? "bg-forest/10 text-forest"
                              : "bg-slate/10 text-slate"
                          }`}
                        >
                          {hasScore ? "응시" : "미응시"}
                        </span>
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
                  <td colSpan={5} className="px-4 py-3 text-sm">
                    총 {activeRegs.length}명 · 납부 {totalPaid}명 · 미납{" "}
                    {totalUnpaid}명
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">
                    {totalRevenue.toLocaleString("ko-KR")}원
                  </td>
                  <td colSpan={2} />
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
                  {["학번", "이름", "구분", "취소일시"].map((h) => (
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
                      <td className="px-4 py-3 tabular-nums text-slate">
                        {isStudent ? (
                          <Link
                            href={`/admin/students/${reg.examNumber}`}
                            className="font-mono text-xs font-semibold text-forest hover:underline hover:opacity-100"
                          >
                            {reg.examNumber}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>
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

      {/* Back link */}
      <div className="no-print pt-2">
        <Link
          href={`/admin/exams/special/${eventId}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          &larr; 시험 상세로
        </Link>
      </div>
    </div>
  );
}
