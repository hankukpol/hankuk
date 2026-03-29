import { AdminRole, SettlementStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: "미지급",
  PAID: "지급완료",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<SettlementStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default async function InstructorDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({
    where: { id },
    include: {
      lectureSubjects: {
        include: {
          lecture: {
            select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!instructor) notFound();

  // Fetch settlements for this instructor (no direct specialLecture relation on the model)
  const settlements = await getPrisma().specialLectureSettlement.findMany({
    where: { instructorId: id },
    orderBy: { settlementMonth: "desc" },
    take: 24,
  });

  // Total paid amount
  const totalPaid = settlements
    .filter((s) => s.status === "PAID")
    .reduce((sum, s) => sum + s.instructorAmount, 0);

  function formatKRW(n: number) {
    return n.toLocaleString() + "원";
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <Link href="/admin/settings/instructors" className="text-sm text-slate hover:text-ink">
        &larr; 강사 목록
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        강사 관리
      </div>
      <div className="mt-5 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{instructor.name}</h1>
          <p className="mt-1 text-sm text-slate">{instructor.subject}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              instructor.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {instructor.isActive ? "재직중" : "퇴직"}
          </span>
          <Link
            href={`/admin/settings/instructors/${id}/settlements`}
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/5"
          >
            월별 정산
          </Link>
          <Link
            href={`/admin/settings/instructors/${id}/revenue-rates`}
            className="inline-flex items-center rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/5"
          >
            배분율 관리
          </Link>
          <Link
            href={`/admin/settings/instructors/${id}/subjects`}
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/5"
          >
            담당 과목 관리
          </Link>
          <Link
            href={`/admin/settings/instructors/${id}/edit`}
            className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            수정
          </Link>
        </div>
      </div>

      {/* Profile card */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">기본 정보</h2>
        <dl className="mt-4 grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate">연락처</dt>
            <dd className="mt-1 text-ink">{instructor.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate">이메일</dt>
            <dd className="mt-1 text-ink">{instructor.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate">은행</dt>
            <dd className="mt-1 text-ink">{instructor.bankName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate">계좌번호</dt>
            <dd className="mt-1 font-mono text-ink">{instructor.bankAccount ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate">예금주</dt>
            <dd className="mt-1 text-ink">{instructor.bankHolder ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate">등록일</dt>
            <dd className="mt-1 text-ink">
              {instructor.createdAt.toLocaleDateString("ko-KR")}
            </dd>
          </div>
        </dl>
      </div>

      {/* Settlement summary */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 지급액</p>
          <p className="mt-2 text-xl font-bold text-ink">{formatKRW(totalPaid)}</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">담당 특강 수</p>
          <p className="mt-2 text-xl font-bold text-ink">{instructor.lectureSubjects.length}개</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">정산 건수</p>
          <p className="mt-2 text-xl font-bold text-ink">{settlements.length}건</p>
        </div>
      </div>

      {/* Assigned special lectures */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">담당 특강</h2>
        {instructor.lectureSubjects.length === 0 ? (
          <p className="mt-4 text-sm text-slate">배정된 특강이 없습니다.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {instructor.lectureSubjects.map((ls) => (
              <div
                key={ls.id}
                className="flex items-center justify-between rounded-xl border border-ink/5 bg-mist px-4 py-3"
              >
                <div>
                  <Link
                    href={`/admin/special-lectures/${ls.lecture.id}`}
                    className="text-sm font-medium text-ink hover:text-ember"
                  >
                    {ls.lecture.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate">
                    {ls.subjectName}
                    {" · "}
                    {new Date(ls.lecture.startDate).toLocaleDateString("ko-KR")}
                    {ls.lecture.endDate
                      ? ` ~ ${new Date(ls.lecture.endDate).toLocaleDateString("ko-KR")}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate">정산율</p>
                  <p className="text-sm font-semibold text-ink">{ls.instructorRate}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settlement history */}
      {settlements.length > 0 && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">정산 내역</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                  <th className="pb-2">정산월</th>
                  <th className="pb-2">총 수익</th>
                  <th className="pb-2">정산율</th>
                  <th className="pb-2">강사 금액</th>
                  <th className="pb-2">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 font-mono">{s.settlementMonth}</td>
                    <td className="py-2">{formatKRW(s.totalRevenue)}</td>
                    <td className="py-2">{s.instructorRate}%</td>
                    <td className="py-2 font-medium">{formatKRW(s.instructorAmount)}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[s.status]}`}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
