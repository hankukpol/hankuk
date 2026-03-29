import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { RateEditor } from "./rate-editor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InstructorRevenueRatesPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);
  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({
    where: { id },
    include: {
      lectureSubjects: {
        include: {
          lecture: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!instructor) notFound();

  // Also load settlement history to show context
  const settlements = await getPrisma().specialLectureSettlement.findMany({
    where: { instructorId: id },
    orderBy: { settlementMonth: "desc" },
    take: 12,
  });

  const subjectRows = instructor.lectureSubjects.map((ls) => ({
    id: ls.id,
    subjectName: ls.subjectName,
    lectureName: ls.lecture.name,
    lectureId: ls.lecture.id,
    currentRate: ls.instructorRate,
    price: ls.price,
    isLectureActive: ls.lecture.isActive,
  }));

  // Stats
  const avgRate =
    subjectRows.length > 0
      ? Math.round(
          subjectRows.reduce((sum, r) => sum + r.currentRate, 0) / subjectRows.length,
        )
      : 0;

  const totalExpectedAmount = subjectRows.reduce(
    (sum, r) => sum + Math.floor((r.price * r.currentRate) / 100),
    0,
  );

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "시스템 설정", href: "/admin/settings" },
          { label: "강사 관리", href: "/admin/settings/instructors" },
          {
            label: instructor.name,
            href: `/admin/settings/instructors/${id}`,
          },
          { label: "배분율 관리" },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
            배분율 관리
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            {instructor.name}
            <span className="ml-3 text-xl font-normal text-slate">{instructor.subject}</span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            담당 특강 과목별 강사 수익 배분율을 설정합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/settings/instructors/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            ← 강사 상세
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">담당 과목 수</p>
          <p className="mt-2 text-2xl font-bold text-ink">{subjectRows.length}개</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">평균 배분율</p>
          <p className="mt-2 text-2xl font-bold text-ember">{avgRate}%</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">총 예상 배분액</p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {totalExpectedAmount.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Rate editor */}
      <section className="mb-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">특강 과목별 배분율</h2>
            <p className="mt-0.5 text-xs text-slate">
              각 과목의 배분율(%)을 수정하면 해당 특강의 신규 정산에 즉시 반영됩니다.
              기존 완료된 정산 내역은 변경되지 않습니다.
            </p>
          </div>
        </div>
        <RateEditor
          subjects={subjectRows.map((r) => ({
            id: r.id,
            subjectName: r.subjectName,
            lectureName: r.lectureName,
            lectureId: r.lectureId,
            currentRate: r.currentRate,
            price: r.price,
          }))}
          instructorId={id}
        />
      </section>

      {/* Settlement history for context */}
      {settlements.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="mb-5 text-base font-semibold text-ink">최근 정산 내역 (12개월)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">정산월</th>
                  <th className="px-5 py-3.5 font-semibold text-right">총 수익</th>
                  <th className="px-5 py-3.5 font-semibold text-center">배분율</th>
                  <th className="px-5 py-3.5 font-semibold text-right">강사 금액</th>
                  <th className="px-5 py-3.5 font-semibold text-right">학원 금액</th>
                  <th className="px-5 py-3.5 font-semibold text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-sm">{s.settlementMonth}</td>
                    <td className="px-5 py-3.5 text-right font-mono">
                      {s.totalRevenue.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink">
                        {s.instructorRate}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium font-mono">
                      {s.instructorAmount.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate">
                      {s.academyAmount.toLocaleString()}원
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.status === "PAID"
                            ? "bg-green-100 text-green-700"
                            : s.status === "CANCELLED"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {s.status === "PAID"
                          ? "지급완료"
                          : s.status === "CANCELLED"
                            ? "취소"
                            : "미지급"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
