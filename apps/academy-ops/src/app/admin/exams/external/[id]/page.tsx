import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남",
  GONGCHAE_F: "공채 여",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

export default async function ExternalExamDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { id } = await params;
  const prisma = getPrisma();

  const event = await prisma.examEvent.findUnique({
    where: { id },
    include: {
      registrations: {
        orderBy: [{ division: "asc" }, { registeredAt: "asc" }],
        include: {
          student: {
            select: {
              examNumber: true,
              name: true,
              phone: true,
            },
          },
          score: {
            select: {
              score: true,
              rank: true,
              note: true,
            },
          },
        },
      },
    },
  });

  if (!event || event.eventType !== ExamEventType.EXTERNAL) notFound();

  const totalRegistrations = event.registrations.length;
  const cancelledCount = event.registrations.filter((r) => r.cancelledAt !== null).length;
  const activeRegistrations = event.registrations.filter((r) => r.cancelledAt === null);
  const scoredCount = activeRegistrations.filter((r) => r.score !== null).length;
  const paidCount = activeRegistrations.filter((r) => r.isPaid).length;

  // Group by division
  const byDivision = new Map<string, typeof activeRegistrations>();
  for (const reg of activeRegistrations) {
    const div = reg.division;
    if (!byDivision.has(div)) byDivision.set(div, []);
    byDivision.get(div)!.push(reg);
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/exams/external" className="hover:text-forest">
          외부모의고사
        </Link>
        <span>/</span>
        <span className="text-ink">{event.title}</span>
      </nav>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
            외부시험 상세
          </div>
          <h1 className="mt-5 text-3xl font-semibold">{event.title}</h1>
          <p className="mt-4 text-sm leading-7 text-slate">
            {new Date(event.examDate).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
            {event.venue && ` · ${event.venue}`}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-3">
          <Link
            href={`/admin/exams/external/${id}/scores`}
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b04e0f]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
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
            성적 입력
          </Link>
          <Link
            href="/admin/exams/external"
            className="inline-flex items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            목록으로
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 접수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{totalRegistrations}명</p>
          {cancelledCount > 0 && (
            <p className="mt-1 text-xs text-red-500">취소 {cancelledCount}명 포함</p>
          )}
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">유효 응시</p>
          <p className="mt-2 text-3xl font-semibold text-forest">{activeRegistrations.length}명</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">납부 완료</p>
          <p className="mt-2 text-3xl font-semibold text-[#C55A11]">{paidCount}명</p>
          <p className="mt-1 text-xs text-slate">
            미납 {activeRegistrations.length - paidCount}명
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">성적 입력</p>
          <p className="mt-2 text-3xl font-semibold text-purple-600">{scoredCount}명</p>
          <p className="mt-1 text-xs text-slate">
            미입력 {activeRegistrations.length - scoredCount}명
          </p>
        </div>
      </div>

      {/* Registration List */}
      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">응시 등록 현황</h2>
          <span className="rounded-full bg-mist px-3 py-1 text-xs font-medium text-slate">
            {activeRegistrations.length}명
          </span>
        </div>

        {activeRegistrations.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-12 text-center text-sm text-slate">
            등록된 응시자가 없습니다.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {Array.from(byDivision.entries()).map(([division, regs]) => (
              <div key={division}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700">
                    {DIVISION_LABEL[division] ?? division}
                  </span>
                  <span className="text-slate font-normal">{regs.length}명</span>
                </h3>
                <div className="overflow-x-auto rounded-[20px] border border-ink/10">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist text-left">
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                          좌석
                        </th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                          학번
                        </th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                          이름
                        </th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                          연락처
                        </th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                          납부
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                          점수
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                          순위
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {regs.map((reg) => {
                        const isInternal = reg.student !== null;
                        const displayName = isInternal
                          ? reg.student!.name
                          : (reg.externalName ?? "-");
                        const displayPhone = isInternal
                          ? (reg.student!.phone ?? "-")
                          : (reg.externalPhone ?? "-");
                        const displayId = isInternal
                          ? reg.student!.examNumber
                          : "외부";

                        return (
                          <tr key={reg.id} className="transition-colors hover:bg-mist/60">
                            <td className="px-5 py-3 font-mono text-xs text-slate">
                              {reg.seatNumber ?? "-"}
                            </td>
                            <td className="px-5 py-3">
                              {isInternal ? (
                                <Link
                                  href={`/admin/students/${displayId}`}
                                  className="font-mono text-forest hover:underline"
                                >
                                  {displayId}
                                </Link>
                              ) : (
                                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-slate">
                                  외부
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 font-medium text-ink">{displayName}</td>
                            <td className="px-5 py-3 font-mono text-xs text-slate">
                              {displayPhone}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  reg.isPaid
                                    ? "bg-forest/10 text-forest"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {reg.isPaid ? "납부" : "미납"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-mono">
                              {reg.score !== null ? (
                                <span className="font-semibold text-ink">
                                  {reg.score.score.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-slate">
                              {reg.score?.rank ?? "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Event Info */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate">시험 정보</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <div>
            <dt className="font-medium text-slate">시험 유형</dt>
            <dd className="mt-1 font-semibold text-ink">외부모의고사</dd>
          </div>
          <div>
            <dt className="font-medium text-slate">시험일</dt>
            <dd className="mt-1 font-semibold text-ink">
              {new Date(event.examDate).toLocaleDateString("ko-KR")}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate">장소</dt>
            <dd className="mt-1 font-semibold text-ink">{event.venue ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate">참가비</dt>
            <dd className="mt-1 font-semibold text-ink">
              {event.registrationFee === 0
                ? "무료"
                : `${event.registrationFee.toLocaleString("ko-KR")}원`}
            </dd>
          </div>
          {event.registrationDeadline && (
            <div>
              <dt className="font-medium text-slate">접수 마감</dt>
              <dd className="mt-1 font-semibold text-ink">
                {new Date(event.registrationDeadline).toLocaleDateString("ko-KR")}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-slate">상태</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  event.isActive
                    ? "bg-forest/10 text-forest"
                    : "bg-ink/5 text-slate"
                }`}
              >
                {event.isActive ? "활성" : "비활성"}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
