import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
};

function parseMonthParam(param: string | undefined): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    return param;
  }
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function InstructorSettlementDetailPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const { id } = await params;
  const sp = await searchParams;
  const monthStr = parseMonthParam(sp.month);
  const [yearStr, monStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monStr, 10);

  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0, 23, 59, 59, 999);

  const instructor = await getPrisma().instructor.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subject: true,
      phone: true,
      email: true,
      bankName: true,
      bankAccount: true,
      bankHolder: true,
      isActive: true,
      lectureSubjects: {
        include: {
          lecture: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              isActive: true,
              _count: {
                select: {
                  enrollments: {
                    where: {
                      status: { in: ["ACTIVE", "COMPLETED"] },
                      startDate: { lte: lastDay },
                      OR: [{ endDate: { gte: firstDay } }, { endDate: null }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!instructor) notFound();

  // Filter lecture subjects to those whose lecture overlaps the requested month
  const activeSubjects = instructor.lectureSubjects.filter((subject) => {
    const lec = subject.lecture;
    const lectureStart = new Date(lec.startDate);
    const lectureEnd = lec.endDate ? new Date(lec.endDate) : null;
    return lectureStart <= lastDay && (lectureEnd === null || lectureEnd >= firstDay);
  });

  const lectureItems = activeSubjects.map((subject) => {
    const enrolledCount = subject.lecture._count.enrollments;
    const totalRevenue = enrolledCount * subject.price;
    const instructorAmount = Math.floor(totalRevenue * (subject.instructorRate / 100));
    const academyAmount = totalRevenue - instructorAmount;
    return {
      lectureId: subject.lectureId,
      lectureName: subject.lecture.name,
      subjectName: subject.subjectName,
      price: subject.price,
      instructorRate: subject.instructorRate,
      enrolledCount,
      totalRevenue,
      instructorAmount,
      academyAmount,
    };
  });

  const totalRevenue = lectureItems.reduce((s, l) => s + l.totalRevenue, 0);
  const totalInstructorAmount = lectureItems.reduce((s, l) => s + l.instructorAmount, 0);
  const totalAcademyAmount = totalRevenue - totalInstructorAmount;

  // Look up settlement record
  const settlementRecord = await getPrisma().specialLectureSettlement.findFirst({
    where: {
      specialLectureId: `SUMMARY_${monthStr}`,
      instructorId: id,
      settlementMonth: monthStr,
    },
  });

  const isPaid = settlementRecord?.status === "PAID";
  const prevMonth = shiftMonth(monthStr, -1);
  const nextMonth = shiftMonth(monthStr, 1);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수납 정산", href: "/admin/settlements/instructors" },
          { label: "강사 정산", href: "/admin/settlements/instructors" },
          { label: instructor.name },
        ]}
      />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            강사 정산 상세
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold">{instructor.name}</h1>
            <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
              {instructor.subject}
            </span>
            {isPaid ? (
              <span className="inline-flex items-center rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                지급완료
                {settlementRecord?.paidAt && (
                  <span className="ml-1 font-normal opacity-80">
                    ({settlementRecord.paidAt.toLocaleDateString("ko-KR")})
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                미지급
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={`/admin/settlements/instructors`}
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      {/* Month navigation */}
      <div className="mt-6 flex items-center gap-2">
        <Link
          href={`/admin/settlements/instructors/${id}?month=${prevMonth}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="이전 달"
        >
          ←
        </Link>
        <span className="min-w-[140px] text-center text-base font-semibold text-ink">
          {formatMonthLabel(monthStr)} 정산
        </span>
        <Link
          href={`/admin/settlements/instructors/${id}?month=${nextMonth}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 text-slate transition hover:border-ink/30 hover:text-ink"
          aria-label="다음 달"
        >
          →
        </Link>
        <span className="ml-2 text-xs text-slate">특강 수강중+수료 기준</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: settlement breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs text-slate">총 수강료 수입</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                {totalRevenue.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-[20px] border border-ember/20 bg-ember/5 px-5 py-4">
              <p className="text-xs text-slate">강사 수령액</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ember">
                {totalInstructorAmount.toLocaleString()}원
              </p>
            </div>
            <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4">
              <p className="text-xs text-slate">학원 수입</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-forest">
                {totalAcademyAmount.toLocaleString()}원
              </p>
            </div>
          </div>

          {/* Lecture breakdown table */}
          {lectureItems.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-ink/10 bg-white p-10 text-center text-sm text-slate">
              {formatMonthLabel(monthStr)}에 정산 대상 강의가 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white">
              <div className="border-b border-ink/5 px-6 py-4">
                <h2 className="text-sm font-semibold text-ink">강의별 정산 내역</h2>
              </div>
              <table className="min-w-full divide-y divide-ink/5 text-sm">
                <thead>
                  <tr className="bg-mist/50">
                    {["특강명", "과목", "수강인원", "단가", "총 수강료", "배분율", "강사 수령", "학원 수입"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {lectureItems.map((lec) => (
                    <tr key={`${lec.lectureId}-${lec.subjectName}`} className="hover:bg-mist/20">
                      <td className="px-4 py-3 text-ink">
                        <Link
                          href={`/admin/settings/special-lectures/${lec.lectureId}`}
                          className="font-medium text-ink hover:text-forest"
                        >
                          {lec.lectureName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate">{lec.subjectName}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">{lec.enrolledCount}명</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                        {lec.price.toLocaleString()}원
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-ink">
                        {lec.totalRevenue.toLocaleString()}원
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate">{lec.instructorRate}%</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-ember">
                        {lec.instructorAmount.toLocaleString()}원
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-forest">
                        {lec.academyAmount.toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-mist/30 font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-ink">합계</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink">
                      {totalRevenue.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-slate">-</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ember">
                      {totalInstructorAmount.toLocaleString()}원
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-forest">
                      {totalAcademyAmount.toLocaleString()}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Settlement record note */}
          {settlementRecord?.note && (
            <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
              <h2 className="mb-2 text-sm font-semibold text-ink">정산 메모</h2>
              <p className="text-sm text-slate">{settlementRecord.note}</p>
            </div>
          )}
        </div>

        {/* Right: instructor info + payment status */}
        <div className="space-y-6">
          {/* Instructor info */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">강사 정보</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate">이름</dt>
                <dd className="mt-0.5 font-medium text-ink">{instructor.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">담당 과목</dt>
                <dd className="mt-0.5 text-ink">{instructor.subject}</dd>
              </div>
              {instructor.phone && (
                <div>
                  <dt className="text-xs text-slate">연락처</dt>
                  <dd className="mt-0.5 text-ink">{instructor.phone}</dd>
                </div>
              )}
              {instructor.email && (
                <div>
                  <dt className="text-xs text-slate">이메일</dt>
                  <dd className="mt-0.5 text-ink">{instructor.email}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Bank account info */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">계좌 정보</h2>
            {instructor.bankName || instructor.bankAccount ? (
              <dl className="space-y-3 text-sm">
                {instructor.bankName && (
                  <div>
                    <dt className="text-xs text-slate">은행</dt>
                    <dd className="mt-0.5 font-medium text-ink">{instructor.bankName}</dd>
                  </div>
                )}
                {instructor.bankAccount && (
                  <div>
                    <dt className="text-xs text-slate">계좌번호</dt>
                    <dd className="mt-0.5 font-mono text-ink">{instructor.bankAccount}</dd>
                  </div>
                )}
                {instructor.bankHolder && (
                  <div>
                    <dt className="text-xs text-slate">예금주</dt>
                    <dd className="mt-0.5 text-ink">{instructor.bankHolder}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-xs text-slate">계좌 정보가 등록되지 않았습니다.</p>
            )}
          </div>

          {/* Payment status */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">지급 상태</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate">상태</span>
                {isPaid ? (
                  <span className="inline-flex items-center rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                    지급완료
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    미지급
                  </span>
                )}
              </div>
              {settlementRecord?.paidAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate">지급일</span>
                  <span className="text-sm text-ink">
                    {settlementRecord.paidAt.toLocaleDateString("ko-KR")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate">정산 대상액</span>
                <span className="text-sm font-semibold tabular-nums text-ember">
                  {totalInstructorAmount.toLocaleString()}원
                </span>
              </div>
              {settlementRecord?.totalRevenue != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate">정산 기록 금액</span>
                  <span className="text-sm tabular-nums text-ink">
                    {settlementRecord.instructorAmount.toLocaleString()}원
                  </span>
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-ink/5 pt-4">
              <p className="text-xs text-slate leading-5">
                정산 완료 처리는{" "}
                <Link
                  href={`/admin/settlements/instructors?month=${monthStr}`}
                  className="text-forest underline-offset-2 hover:underline"
                >
                  강사 정산 목록
                </Link>
                에서 처리할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate">
        * 수강료는 해당 월 기준 수강중+수료 등록 기준으로 계산됩니다. 환불/취소/대기 수강생은 제외됩니다.
      </p>
    </div>
  );
}
