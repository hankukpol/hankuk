import { AdminRole, SettlementStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { RevenuePrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// ─── Label maps ────────────────────────────────────────────────────────────────

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: "미지급",
  PAID: "지급 완료",
  CANCELLED: "취소",
};

const SETTLEMENT_STATUS_COLOR: Record<SettlementStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  PAID: "border-forest/20 bg-forest/10 text-forest",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ id: string }> };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SpecialLectureRevenuePage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const prisma = getPrisma();

  const lecture = await prisma.specialLecture.findUnique({
    where: { id },
    include: {
      subjects: {
        include: {
          instructor: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      enrollments: {
        where: {
          status: { in: ["ACTIVE", "COMPLETED", "PENDING"] },
        },
        select: {
          id: true,
          examNumber: true,
          finalFee: true,
          discountAmount: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!lecture) notFound();

  // Fetch settlement records (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fromMonth = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}`;

  const rawSettlements = await prisma.specialLectureSettlement.findMany({
    where: {
      specialLectureId: id,
      settlementMonth: { gte: fromMonth },
    },
    orderBy: [{ settlementMonth: "desc" }, { instructorId: "asc" }],
  });

  // Collect unique instructor IDs and look them up
  const instructorIds = [...new Set(rawSettlements.map((s) => s.instructorId))];
  const instructors = await prisma.instructor.findMany({
    where: { id: { in: instructorIds } },
    select: { id: true, name: true },
  });
  const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));

  const settlements = rawSettlements.map((s) => ({
    ...s,
    instructorName: instructorMap.get(s.instructorId) ?? s.instructorId,
  }));

  // ── Revenue calculations ───────────────────────────────────────────────────

  const totalEnrollCount = lecture.enrollments.length;
  const totalRevenue = lecture.enrollments.reduce((sum, e) => sum + e.finalFee, 0);

  // Per-subject revenue based on instructorRate
  // For multi-subject lectures each subject has its own price
  // For single-subject the full finalFee maps to the one subject
  const isMultiSubject = lecture.isMultiSubject;

  type SubjectRevRow = {
    subjectId: string;
    subjectName: string;
    instructorId: string;
    instructorName: string;
    price: number;
    instructorRate: number;
    subjectRevenue: number;
    instructorShare: number;
    academyShare: number;
  };

  let subjectRows: SubjectRevRow[] = [];

  if (isMultiSubject) {
    // Multi-subject: revenue is distributed by subject price ratios
    const totalSubjectPrice = lecture.subjects.reduce((sum, s) => sum + s.price, 0);
    subjectRows = lecture.subjects.map((s) => {
      const ratio = totalSubjectPrice > 0 ? s.price / totalSubjectPrice : 0;
      const subjectRevenue = Math.round(totalRevenue * ratio);
      const instructorShare = Math.round((subjectRevenue * s.instructorRate) / 100);
      return {
        subjectId: s.id,
        subjectName: s.subjectName,
        instructorId: s.instructorId,
        instructorName: s.instructor.name,
        price: s.price,
        instructorRate: s.instructorRate,
        subjectRevenue,
        instructorShare,
        academyShare: subjectRevenue - instructorShare,
      };
    });
  } else {
    subjectRows = lecture.subjects.map((s) => {
      // Single-subject: all revenue belongs to this one subject
      const subjectRevenue = totalRevenue;
      const instructorShare = Math.round((subjectRevenue * s.instructorRate) / 100);
      return {
        subjectId: s.id,
        subjectName: s.subjectName,
        instructorId: s.instructorId,
        instructorName: s.instructor.name,
        price: s.price,
        instructorRate: s.instructorRate,
        subjectRevenue,
        instructorShare,
        academyShare: subjectRevenue - instructorShare,
      };
    });
  }

  const totalInstructorShare = subjectRows.reduce((sum, r) => sum + r.instructorShare, 0);
  const totalAcademyShare = totalRevenue - totalInstructorShare;

  // Enrollment monthly trend (last 6 months)
  const monthlyMap: Record<string, number> = {};
  for (const e of lecture.enrollments) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = (monthlyMap[key] ?? 0) + e.finalFee;
  }
  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .reverse();

  // settlements already have plain number types from Prisma ORM (no bigint conversion needed)
  const settlementRows = settlements;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/special-lectures" },
          { label: "특강 단과 관리", href: "/admin/settings/special-lectures" },
          { label: lecture.name, href: `/admin/settings/special-lectures/${id}` },
          { label: "수익 분석" },
        ]}
      />

      {/* ── Header ── */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            Revenue Analytics
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold">
              특강 수익 분석
            </h1>
          </div>
          <p className="mt-1 text-base font-medium text-slate">
            {lecture.name}
            <span className="ml-2 text-sm font-normal">
              ({LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
              {lecture.examCategory && ` · ${EXAM_CATEGORY_LABEL[lecture.examCategory]}`})
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate">
            {lecture.startDate.toLocaleDateString("ko-KR")} ~{" "}
            {lecture.endDate.toLocaleDateString("ko-KR")}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3 pt-1">
          <RevenuePrintButton />
          <Link
            href={`/admin/settings/special-lectures/${id}`}
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 특강 상세
          </Link>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 수강생</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {totalEnrollCount.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
        </article>
        <article className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate">총 수강료</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">
            {(totalRevenue / 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            <span className="ml-1 text-sm font-normal text-slate">만원</span>
          </p>
          <p className="mt-1 text-xs text-slate">{formatAmount(totalRevenue)}</p>
        </article>
        <article className="rounded-[24px] border border-ember/20 bg-ember/5 px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ember">강사 배분</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ember">
            {(totalInstructorShare / 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            <span className="ml-1 text-sm font-normal">만원</span>
          </p>
          <p className="mt-1 text-xs text-ember/70">{formatAmount(totalInstructorShare)}</p>
        </article>
        <article className="rounded-[24px] border border-forest/20 bg-forest/5 px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-forest">학원 수익</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-forest">
            {(totalAcademyShare / 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            <span className="ml-1 text-sm font-normal">만원</span>
          </p>
          <p className="mt-1 text-xs text-forest/70">{formatAmount(totalAcademyShare)}</p>
        </article>
      </div>

      {/* ── Subject Revenue Breakdown ── */}
      {subjectRows.length > 0 && (
        <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">과목별 수익</h2>
          <p className="mt-1 text-xs text-slate">
            {isMultiSubject
              ? "수강료는 과목 단가 비율로 배분됩니다."
              : "단일 과목 특강입니다."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60 text-left">
                  {["과목명", "강사명", "단가", "배분율", "총 수강료", "강사 배분", "학원 수익"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {subjectRows.map((row) => (
                  <tr key={row.subjectId} className="hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">{row.subjectName}</td>
                    <td className="px-4 py-3 text-slate">{row.instructorName}</td>
                    <td className="px-4 py-3 tabular-nums text-slate">
                      {row.price.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate">{row.instructorRate}%</td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {formatAmount(row.subjectRevenue)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ember">
                      {formatAmount(row.instructorShare)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-forest">
                      {formatAmount(row.academyShare)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink/10 bg-mist/50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-ink">
                    합계
                  </td>
                  <td className="px-4 py-3 tabular-nums font-bold text-ink">
                    {formatAmount(totalRevenue)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-bold text-ember">
                    {formatAmount(totalInstructorShare)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-bold text-forest">
                    {formatAmount(totalAcademyShare)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ── Monthly Revenue Trend ── */}
      {monthlyTrend.length > 0 && (
        <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">월별 수강료 추이 (최근 6개월)</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60 text-left">
                  {["기간", "수강료 합계", "비율"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {monthlyTrend.map(([month, rev]) => {
                  const pct = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0;
                  return (
                    <tr key={month} className="hover:bg-mist/30">
                      <td className="px-4 py-3 font-medium text-ink">{formatMonth(month)}</td>
                      <td className="px-4 py-3 tabular-nums text-ink">{formatAmount(rev)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-ember"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-slate">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Settlement History ── */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">정산 이력</h2>
            <p className="mt-0.5 text-xs text-slate">최근 6개월 기준</p>
          </div>
        </div>

        {settlementRows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            최근 6개월 정산 기록이 없습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/5 text-sm">
              <thead>
                <tr className="bg-mist/60 text-left">
                  {["정산 기간", "강사명", "배분율", "수강료 총액", "강사 배분", "학원 수익", "상태", "지급일"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {settlementRows.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">
                      {formatMonth(row.settlementMonth)}
                    </td>
                    <td className="px-4 py-3 text-slate">{row.instructorName}</td>
                    <td className="px-4 py-3 tabular-nums text-slate">{row.instructorRate}%</td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {formatAmount(row.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ember">
                      {formatAmount(row.instructorAmount)}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-forest">
                      {formatAmount(row.academyAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${SETTLEMENT_STATUS_COLOR[row.status]}`}
                      >
                        {SETTLEMENT_STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate">
                      {row.paidAt
                        ? new Date(row.paidAt).toLocaleDateString("ko-KR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
