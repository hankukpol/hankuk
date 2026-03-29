import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ReceiptPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  ENROLLMENT: "수강료",
  TEXTBOOK: "교재",
  LOCKER: "사물함",
  STUDY_ROOM: "스터디룸",
  POINT: "포인트",
  OTHER: "기타",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  ONLINE: "온라인",
  MIXED: "혼합",
};

type PageProps = {
  params: Promise<{ staffId: string; month: string }>;
};

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function parseMonth(monthStr: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [y, m] = monthStr.split("-").map(Number);
  if (y < 2020 || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

export default async function StaffSettlementReceiptPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { staffId, month: monthParam } = await params;

  const parsed = parseMonth(monthParam);
  if (!parsed) notFound();

  const { year, month } = parsed;

  const db = getPrisma();

  // Load staff info
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
      mobile: true,
    },
  });

  if (!staff) notFound();

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Print date
  const printDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fetch payment data for the month (processed by this staff)
  const adminUserId = staff.adminUserId;
  const payments = adminUserId
    ? await db.payment.findMany({
        where: {
          processedBy: adminUserId,
          processedAt: { gte: firstDay, lte: lastDay },
          status: { notIn: ["CANCELLED"] },
        },
        select: {
          id: true,
          processedAt: true,
          category: true,
          method: true,
          netAmount: true,
          student: { select: { examNumber: true, name: true } },
          items: {
            select: { itemName: true, amount: true },
            orderBy: { amount: "desc" },
          },
        },
        orderBy: { processedAt: "desc" },
      })
    : [];

  const totalRevenue = payments.reduce((s, p) => s + p.netAmount, 0);
  const taxAmount = Math.floor(totalRevenue * 0.033); // 3.3% withholding tax
  const netPayable = totalRevenue - taxAmount;

  // Category breakdown
  type CategoryRow = {
    category: string;
    label: string;
    count: number;
    total: number;
  };
  const categoryMap = new Map<string, CategoryRow>();
  for (const p of payments) {
    const cat = p.category as string;
    const existing = categoryMap.get(cat);
    if (existing) {
      existing.count++;
      existing.total += p.netAmount;
    } else {
      categoryMap.set(cat, {
        category: cat,
        label: PAYMENT_CATEGORY_LABEL[cat] ?? cat,
        count: 1,
        total: p.netAmount,
      });
    }
  }
  const categoryRows = Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);

  // Also fetch enrollment activity (수강 등록 실적)
  const enrollments = adminUserId
    ? await db.courseEnrollment.findMany({
        where: {
          staffId: adminUserId,
          createdAt: { gte: firstDay, lte: lastDay },
          status: { notIn: ["CANCELLED"] },
        },
        select: {
          id: true,
          createdAt: true,
          finalFee: true,
          discountAmount: true,
          regularFee: true,
          courseType: true,
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
          student: { select: { name: true, examNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const totalEnrollmentFee = enrollments.reduce((s, e) => s + e.finalFee, 0);

  return (
    <>
      {/* Print styles */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .no-print { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 18mm 20mm; }
  .page-break-before { page-break-before: always; }
  section { break-inside: avoid; }
}
@media screen {
  .print-only { display: none; }
}
          `.trim(),
        }}
      />

      <div className="min-h-screen bg-mist/40 p-6 sm:p-10 print:bg-white print:p-0">
        {/* Screen-only top bar */}
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/staff-settlements/${staffId}/report?month=${monthStr}`}
              className="text-sm text-forest hover:underline"
            >
              ← 실적 보고서로 돌아가기
            </Link>
            <span className="text-slate/30">|</span>
            <Link
              href={`/admin/staff-settlements/${staffId}?month=${monthStr}`}
              className="text-sm text-slate hover:text-ink"
            >
              직원 상세
            </Link>
          </div>
          <ReceiptPrintButton />
        </div>

        {/* A4 Document */}
        <div className="mx-auto max-w-[794px] rounded-[20px] bg-white shadow-lg print:max-w-none print:rounded-none print:shadow-none">
          <div className="p-10 print:p-0">

            {/* ── Document Header ── */}
            <div className="border-b-2 border-forest pb-6 print:border-b-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                    학원명 미설정
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate">
                    학원 주소는 관리자 설정을 확인하세요 | 연락처는 관리자 설정을 확인하세요
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate">출력일: {printDate}</p>
                  <p className="mt-0.5 text-xs text-slate">
                    정산 기간: {year}년 {month}월
                  </p>
                </div>
              </div>

              {/* Title */}
              <div className="mt-6 text-center">
                <h1 className="text-3xl font-bold tracking-[0.12em] text-ink">강&nbsp;사&nbsp;정&nbsp;산&nbsp;서</h1>
                <p className="mt-2 text-sm text-slate">
                  {year}년 {month}월분 ({firstDay.toLocaleDateString("ko-KR")} ~ {lastDay.toLocaleDateString("ko-KR")})
                </p>
              </div>
            </div>

            {/* ── Staff Information ── */}
            <div className="mt-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                직원 정보
              </h2>
              <div className="overflow-hidden rounded-xl border border-ink/15">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-ink/10">
                    <tr>
                      <td className="w-32 bg-mist/60 px-4 py-3 text-xs font-semibold text-slate">이름</td>
                      <td className="px-4 py-3 font-medium text-ink">{staff.name}</td>
                      <td className="w-32 bg-mist/60 px-4 py-3 text-xs font-semibold text-slate">직책</td>
                      <td className="px-4 py-3 text-ink">
                        {STAFF_ROLE_LABEL[staff.role as string] ?? (staff.role as string)}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-mist/60 px-4 py-3 text-xs font-semibold text-slate">연락처</td>
                      <td className="px-4 py-3 text-ink">{staff.mobile ?? "-"}</td>
                      <td className="bg-mist/60 px-4 py-3 text-xs font-semibold text-slate">사원번호</td>
                      <td className="px-4 py-3 text-ink">
                        {staff.id.slice(0, 8).toUpperCase()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Settlement Summary ── */}
            <div className="mt-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                정산 요약
              </h2>
              <div className="overflow-hidden rounded-xl border border-ink/15">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-ink/10">
                    <tr>
                      <td className="w-48 bg-mist/60 px-5 py-4 text-xs font-semibold text-slate">
                        수납 처리 건수
                      </td>
                      <td className="px-5 py-4 font-medium text-ink">
                        {payments.length.toLocaleString("ko-KR")}건
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-mist/60 px-5 py-4 text-xs font-semibold text-slate">
                        신규 수강 등록 건수
                      </td>
                      <td className="px-5 py-4 font-medium text-ink">
                        {enrollments.length.toLocaleString("ko-KR")}건
                        {enrollments.length > 0 && (
                          <span className="ml-2 text-xs text-slate">
                            (등록 수강료 합계: {formatKRW(totalEnrollmentFee)})
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="bg-forest/5">
                      <td className="px-5 py-4 text-sm font-bold text-forest">총 수납 처리액</td>
                      <td className="px-5 py-4 text-xl font-bold text-forest">
                        {formatKRW(totalRevenue)}
                      </td>
                    </tr>
                    <tr>
                      <td className="bg-mist/60 px-5 py-4 text-xs font-semibold text-slate">
                        소득세 공제 (3.3%)
                      </td>
                      <td className="px-5 py-4 text-red-600">
                        -{formatKRW(taxAmount)}
                      </td>
                    </tr>
                    <tr className="bg-ember/5">
                      <td className="px-5 py-4 text-sm font-bold text-ember">실수령 예정액</td>
                      <td className="px-5 py-4 text-xl font-bold text-ember">
                        {formatKRW(netPayable)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Category Breakdown ── */}
            {categoryRows.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  수납 유형별 내역
                </h2>
                <div className="overflow-hidden rounded-xl border border-ink/15">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist/50">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-slate">유형</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate">건수</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate">금액</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-slate">비율</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {categoryRows.map((row) => (
                        <tr key={row.category}>
                          <td className="px-5 py-3 font-medium text-ink">{row.label}</td>
                          <td className="px-5 py-3 text-right text-ink">
                            {row.count.toLocaleString("ko-KR")}건
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-ink">
                            {formatKRW(row.total)}
                          </td>
                          <td className="px-5 py-3 text-right text-slate">
                            {totalRevenue > 0
                              ? ((row.total / totalRevenue) * 100).toFixed(1) + "%"
                              : "0%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-ink/20 bg-forest/5">
                        <td className="px-5 py-3 font-bold text-forest">합계</td>
                        <td className="px-5 py-3 text-right font-bold text-ink">
                          {payments.length.toLocaleString("ko-KR")}건
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-forest">
                          {formatKRW(totalRevenue)}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-forest">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── Enrollment Activity ── */}
            {enrollments.length > 0 && (
              <div className="mt-8 page-break-before">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  수강 등록 실적
                </h2>
                <div className="overflow-hidden rounded-xl border border-ink/15">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate">등록일</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate">학생</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate">수강 과정</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate">정상가</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate">할인</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate">최종</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {enrollments.map((e) => {
                        const courseName =
                          e.cohort?.name ??
                          e.specialLecture?.name ??
                          e.product?.name ??
                          "-";
                        return (
                          <tr key={e.id}>
                            <td className="px-4 py-3 text-xs text-slate">
                              {new Date(e.createdAt).toLocaleDateString("ko-KR", {
                                month: "2-digit",
                                day: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3 font-medium text-ink">
                              {e.student.name}
                              <span className="ml-1 text-xs text-slate">{e.student.examNumber}</span>
                            </td>
                            <td className="px-4 py-3 text-ink">{courseName}</td>
                            <td className="px-4 py-3 text-right text-ink">
                              {formatKRW(e.regularFee)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-500">
                              {e.discountAmount > 0 ? `-${formatKRW(e.discountAmount)}` : "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-ink">
                              {formatKRW(e.finalFee)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-ink/20 bg-mist/40">
                        <td colSpan={5} className="px-4 py-3 font-bold text-slate">
                          등록 수강료 합계
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-ember">
                          {formatKRW(totalEnrollmentFee)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── No data notice ── */}
            {payments.length === 0 && enrollments.length === 0 && (
              <div className="mt-8 rounded-xl border border-dashed border-ink/20 p-10 text-center text-sm text-slate">
                {year}년 {month}월에 처리된 수납 또는 등록 실적이 없습니다.
              </div>
            )}

            {/* ── Method breakdown (small) ── */}
            {payments.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  결제 수단별 현황
                </h2>
                {(() => {
                  const methodMap = new Map<string, { count: number; total: number }>();
                  for (const p of payments) {
                    const m = p.method as string;
                    const ex = methodMap.get(m);
                    if (ex) {
                      ex.count++;
                      ex.total += p.netAmount;
                    } else {
                      methodMap.set(m, { count: 1, total: p.netAmount });
                    }
                  }
                  const methodRows = Array.from(methodMap.entries()).map(([key, val]) => ({
                    key,
                    label: PAYMENT_METHOD_LABEL[key] ?? key,
                    ...val,
                  }));
                  return (
                    <div className="flex flex-wrap gap-3">
                      {methodRows.map((row) => (
                        <div
                          key={row.key}
                          className="rounded-xl border border-ink/10 bg-white px-4 py-3"
                        >
                          <p className="text-xs font-semibold text-slate">{row.label}</p>
                          <p className="mt-1 text-base font-bold text-ink">
                            {formatKRW(row.total)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate">{row.count}건</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── Confirmation / Signature ── */}
            <div className="mt-12 border-t-2 border-ink/20 pt-8">
              <p className="text-center text-sm text-ink">
                위와 같이 {year}년 {month}월분 정산 내역을 확인합니다.
              </p>
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-sm text-slate">
                  {year}년 {String(month).padStart(2, "0")}월
                </p>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-16 sm:grid-cols-2">
                {/* Academy */}
                <div className="space-y-1 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                    학원장 확인
                  </p>
                  <div className="mx-auto mt-4 flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-ink/20 text-xs text-slate/40">
                    (인)
                  </div>
                  <p className="text-sm font-medium text-ink">학원명 미설정</p>
                </div>
                {/* Staff */}
                <div className="space-y-1 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                    직원 확인
                  </p>
                  <div className="mx-auto mt-4 flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-ink/20 text-xs text-slate/40">
                    (인)
                  </div>
                  <p className="text-sm font-medium text-ink">{staff.name}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
