import Link from "next/link";
import { CourseType, DocumentType, EnrollmentStatus, PaymentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { PrintCertButton } from "./print-cert-button";
import { TaxYearSelector } from "./tax-year-selector";

export const dynamic = "force-dynamic";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatKoreanDate(date: Date | null | undefined): string {
  if (!date) return "-";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}년 ${m}월 ${d}일`;
}

function formatKoreanDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
): string {
  if (!start) return "-";
  return end
    ? `${formatKoreanDate(start)} ~ ${formatKoreanDate(end)}`
    : `${formatKoreanDate(start)} ~`;
}

function formatShortDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

/**
 * Convert a number to Korean reading (e.g. 1200000 → "일백이십만")
 * Supports up to 100 billion won.
 */
function numberToKorean(n: number): string {
  if (n === 0) return "영";
  const units = ["", "만", "억", "조"];
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const positions = ["", "십", "백", "천"];

  let result = "";
  let unitIdx = 0;
  let remaining = Math.abs(n);

  while (remaining > 0) {
    const chunk = remaining % 10000;
    if (chunk !== 0) {
      let chunkStr = "";
      let tmp = chunk;
      let posIdx = 0;
      while (tmp > 0) {
        const d = tmp % 10;
        if (d !== 0) {
          const pos = positions[posIdx] ?? "";
          const dig = posIdx === 0 ? digits[d] : (d === 1 ? "" : digits[d]);
          chunkStr = dig + pos + chunkStr;
        }
        tmp = Math.floor(tmp / 10);
        posIdx++;
      }
      result = chunkStr + (units[unitIdx] ?? "") + result;
    }
    remaining = Math.floor(remaining / 10000);
    unitIdx++;
  }
  return (n < 0 ? "마이너스 " : "") + result;
}

function formatKoreanAmount(value: number): string {
  return `금 ${numberToKorean(value)}원정 (₩${value.toLocaleString("ko-KR")})`;
}

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기 중",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-700",
  SUSPENDED: "border-orange-200 bg-orange-50 text-orange-700",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  ENROLLMENT_CERT: "수강확인서",
  TAX_CERT: "교육비 납입증명서",
  SCORE_REPORT: "성적증명서",
  ATTENDANCE_CERT: "출석확인서",
  CUSTOM: "기타 서류",
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3">
      <span className="text-sm text-slate">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-ember" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentDocumentsPage({ searchParams }: PageProps) {
  // DB 없는 환경 처리
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              증명서 발급 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              증명서 발급은 DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  // 로그인 확인
  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              증명서 발급
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              증명서 발급은 로그인 후 이용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학번과 이름으로 로그인하면 수강확인서와 납부확인서를 출력할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/documents" />
        </div>
      </main>
    );
  }

  // Resolve search params
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const yearParam = typeof resolvedSearchParams.year === "string" ? resolvedSearchParams.year : null;

  const prisma = getPrisma();
  const today = formatKoreanDate(new Date());
  const issuedDate = formatShortDate(new Date());

  // Current and previous years for tax cert
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Selected tax year (default: current year)
  const selectedTaxYear = yearParam ? parseInt(yearParam, 10) : null;

  // 수강 내역 조회 (ACTIVE, COMPLETED)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      examNumber: viewer.examNumber,
      status: { in: ["ACTIVE", "COMPLETED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      cohort: {
        select: { name: true, startDate: true, endDate: true },
      },
      specialLecture: {
        select: { name: true, startDate: true, endDate: true },
      },
      product: {
        select: { name: true },
      },
    },
  });

  // 각 수강별 수납 내역 조회
  type PaymentRow = {
    id: string;
    netAmount: number;
    status: PaymentStatus;
    processedAt: Date;
  };
  type EnrollmentPayments = Record<string, PaymentRow[]>;

  let enrollmentPayments: EnrollmentPayments = {};

  if (enrollments.length > 0) {
    const enrollmentIds = enrollments.map((e) => e.id);
    const payments = await prisma.payment.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      },
      select: {
        id: true,
        enrollmentId: true,
        netAmount: true,
        status: true,
        processedAt: true,
      },
      orderBy: { processedAt: "asc" },
    });

    for (const p of payments) {
      if (!p.enrollmentId) continue;
      if (!enrollmentPayments[p.enrollmentId]) {
        enrollmentPayments[p.enrollmentId] = [];
      }
      enrollmentPayments[p.enrollmentId].push({
        id: p.id,
        netAmount: p.netAmount,
        status: p.status,
        processedAt: p.processedAt,
      });
    }
  }

  // 교육비 납입증명서용: 연도별 수납 내역 조회
  type TaxPaymentRow = {
    id: string;
    enrollmentId: string | null;
    netAmount: number;
    processedAt: Date;
    courseName: string;
  };

  async function getTaxYearPayments(year: number): Promise<TaxPaymentRow[]> {
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const rawPayments = await prisma.payment.findMany({
      where: {
        examNumber: viewer!.examNumber,
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: yearStart, lt: yearEnd },
      },
      select: {
        id: true,
        enrollmentId: true,
        netAmount: true,
        processedAt: true,
        items: {
          select: { itemName: true },
          take: 1,
        },
      },
      orderBy: { processedAt: "asc" },
    });

    // Build course name by enrollment lookup
    const enrollmentIds = rawPayments
      .map((p) => p.enrollmentId)
      .filter((eid): eid is string => eid !== null);

    const enrollmentMap = new Map<string, string>();
    if (enrollmentIds.length > 0) {
      const enrollmentData = await prisma.courseEnrollment.findMany({
        where: { id: { in: enrollmentIds } },
        include: {
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
        },
      });
      for (const e of enrollmentData) {
        const courseName =
          e.cohort?.name ??
          e.specialLecture?.name ??
          e.product?.name ??
          "강좌";
        enrollmentMap.set(e.id, courseName);
      }
    }

    return rawPayments.map((p) => ({
      id: p.id,
      enrollmentId: p.enrollmentId,
      netAmount: p.netAmount,
      processedAt: p.processedAt,
      courseName: p.enrollmentId
        ? (enrollmentMap.get(p.enrollmentId) ?? p.items[0]?.itemName ?? "강좌")
        : (p.items[0]?.itemName ?? "강좌"),
    }));
  }

  // Fetch tax payments for the selected year (or both for display)
  const [taxPaymentsCurrent, taxPaymentsPrev] = await Promise.all([
    getTaxYearPayments(currentYear),
    getTaxYearPayments(prevYear),
  ]);

  const taxPaymentsMap: Record<number, TaxPaymentRow[]> = {
    [currentYear]: taxPaymentsCurrent,
    [prevYear]: taxPaymentsPrev,
  };

  // Student info
  const studentInfo = await prisma.student.findUnique({
    where: { examNumber: viewer.examNumber },
    select: { name: true, birthDate: true },
  });

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const academyName = branding.academyName;
  const academyAddress = branding.address ?? "학원 주소가 아직 등록되지 않았습니다.";
  const academyPhone = branding.phone ?? "학원 연락처가 아직 등록되지 않았습니다.";
  const academyPhoneHref = branding.phoneHref;
  const academyContactLine = branding.contactLine ?? academyName;
  const directorName = branding.directorName ?? "";
  const businessRegNo = branding.businessRegNo ?? "";

  // 서류 발급 이력 조회
  const documentIssuances = await prisma.documentIssuance.findMany({
    where: { examNumber: viewer.examNumber },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: {
      id: true,
      docType: true,
      note: true,
      issuedAt: true,
      issuedByUser: {
        select: { name: true },
      },
    },
  });

  // 수강명 계산 헬퍼
  function getCourseName(
    enrollment: (typeof enrollments)[number],
  ): string {
    if (enrollment.courseType === CourseType.SPECIAL_LECTURE) {
      return enrollment.specialLecture?.name ?? "특강";
    }
    return enrollment.cohort?.name ?? enrollment.product?.name ?? "종합반";
  }

  // 수강기간 계산 헬퍼
  function getCoursePeriod(
    enrollment: (typeof enrollments)[number],
  ): string {
    const start =
      enrollment.startDate ??
      enrollment.cohort?.startDate ??
      enrollment.specialLecture?.startDate;
    const end =
      enrollment.endDate ??
      enrollment.cohort?.endDate ??
      enrollment.specialLecture?.endDate;
    return formatKoreanDateRange(start, end);
  }

  return (
    <>
      {/* 인쇄 전용 CSS */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .printable-cert { display: none !important; }
              .print-show { display: block !important; }
              .tax-cert-print-area { display: none !important; }
              .tax-cert-print-active { display: block !important; }
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; background: white !important; }
              @page { size: A4 portrait; margin: 15mm; }
            }
          `,
        }}
      />

      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* 뒤로 가기 + 헤더 */}
          <div className="no-print">
            <Link
              href="/student"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate transition hover:text-ink"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                  clipRule="evenodd"
                />
              </svg>
              학생 포털 홈
            </Link>

            <div className="mt-4">
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                증명서 발급
              </div>
              <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">증명서 발급</h1>
              <p className="mt-1 text-sm text-slate">
                수강확인서, 납부확인서, 교육비 납입증명서를 출력할 수 있습니다.
              </p>
            </div>
          </div>

          {/* ── 교육비 납입증명서 (연말정산용) ── */}
          <section className="no-print rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Tax Certificate
              </p>
              <h2 className="mt-1 text-xl font-semibold">교육비 납입증명서 (연말정산용)</h2>
              <p className="mt-1 text-sm text-slate">
                연말정산 소득공제에 사용할 교육비 납입증명서를 발급합니다.
              </p>
            </div>

            {/* Year selector tabs */}
            <TaxYearSelector
              currentYear={currentYear}
              prevYear={prevYear}
              selectedYear={selectedTaxYear}
              currentYearTotal={taxPaymentsCurrent.reduce((s, p) => s + p.netAmount, 0)}
              prevYearTotal={taxPaymentsPrev.reduce((s, p) => s + p.netAmount, 0)}
            />
          </section>

          {/* Tax certificate print area — shown when a year is selected */}
          {selectedTaxYear !== null && (
            <>
              {/* Screen preview card */}
              <section className={`no-print rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8`}>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                      {selectedTaxYear}년도 교육비 납입증명서
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">납입 내역 확인</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                      {selectedTaxYear}년도
                    </span>
                  </div>
                </div>

                {(() => {
                  const yearPayments = taxPaymentsMap[selectedTaxYear] ?? [];
                  const totalPaid = yearPayments.reduce((s, p) => s + p.netAmount, 0);

                  if (yearPayments.length === 0) {
                    return (
                      <div className="rounded-[16px] border border-dashed border-ink/10 px-4 py-8 text-center">
                        <p className="text-sm font-semibold text-ink">해당 연도 납입 내역이 없습니다</p>
                        <p className="mt-1.5 text-xs text-slate">
                          {selectedTaxYear}년에 납부된 수강료 내역이 없습니다.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <Row label="이름" value={viewer.name} />
                      <Row label="학번" value={viewer.examNumber} />
                      {yearPayments.map((p, i) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3"
                        >
                          <span className="text-sm text-slate">
                            {p.courseName}
                            <span className="ml-2 text-xs text-slate/60">
                              ({formatShortDate(p.processedAt)})
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-ink">
                            {formatAmount(p.netAmount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-[16px] border border-forest/20 bg-forest/5 px-4 py-3">
                        <span className="text-sm font-semibold text-forest">{selectedTaxYear}년 납입 합계</span>
                        <span className="text-sm font-bold text-forest">{formatAmount(totalPaid)}</span>
                      </div>
                      <div className="mt-1 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-semibold text-amber-700">
                          {formatKoreanAmount(totalPaid)}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Print button — only show if there are payments */}
                {(taxPaymentsMap[selectedTaxYear] ?? []).length > 0 && (
                  <div className="mt-5">
                    <PrintCertButton certClass={`tax-cert-${selectedTaxYear}`} label="교육비 납입증명서 인쇄" />
                  </div>
                )}
              </section>

              {/* Printable tax certificate */}
              {(taxPaymentsMap[selectedTaxYear] ?? []).length > 0 && (() => {
                const yearPayments = taxPaymentsMap[selectedTaxYear] ?? [];
                const totalPaid = yearPayments.reduce((s, p) => s + p.netAmount, 0);
                const certNo = `TAX-${selectedTaxYear}-${viewer.examNumber}`;

                return (
                  <div className={`printable-cert tax-cert-${selectedTaxYear}`}>
                    <div
                      className="mx-auto max-w-[680px] bg-white"
                      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
                    >
                      <div className="px-12 py-12">
                        {/* Issue info */}
                        <div className="mb-2 flex items-center justify-between text-xs text-slate">
                          <span>발급번호: {certNo}</span>
                          <span>발급일: {today}</span>
                        </div>

                        {/* Title */}
                        <h1
                          className="mb-10 mt-4 text-center text-3xl font-bold text-ink"
                          style={{ letterSpacing: "0.5em" }}
                        >
                          교육비 납입증명서
                        </h1>

                        {/* Academy info */}
                        <div className="mb-8 border-b-2 border-forest pb-4" style={{ borderColor: "#1F4D3A" }}>
                          <p className="text-lg font-bold" style={{ color: "#1F4D3A" }}>{academyName}</p>
                          <p className="mt-0.5 text-sm text-slate">
                            {academyAddress}&nbsp;|&nbsp;TEL {academyPhone}
                            {businessRegNo && (
                              <>&nbsp;|&nbsp;사업자등록번호: {businessRegNo}</>
                            )}
                          </p>
                        </div>

                        {/* Student info table */}
                        <div className="mb-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                            학생 정보
                          </p>
                          <table className="w-full border-collapse border border-ink/20 text-sm">
                            <tbody>
                              <tr className="border-b border-ink/10">
                                <th className="w-28 border-r border-ink/10 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                  성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명
                                </th>
                                <td className="px-4 py-3 font-medium text-ink">{viewer.name}</td>
                                <th className="w-28 border-l border-r border-ink/10 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                  수 험 번 호
                                </th>
                                <td className="px-4 py-3 font-medium text-ink">{viewer.examNumber}</td>
                              </tr>
                              <tr>
                                <th className="border-r border-ink/10 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                  생 년 월 일
                                </th>
                                <td className="px-4 py-3 text-ink" colSpan={3}>
                                  {studentInfo?.birthDate
                                    ? `${studentInfo.birthDate.getFullYear()}. ${String(studentInfo.birthDate.getMonth() + 1).padStart(2, "0")}. ${String(studentInfo.birthDate.getDate()).padStart(2, "0")}`
                                    : "—"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Payment details table */}
                        <div className="mb-4">
                          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                            교육비 납입 내역 ({selectedTaxYear}년)
                          </p>
                          <table className="w-full border-collapse border border-ink/20 text-sm">
                            <thead>
                              <tr className="bg-mist/80 text-center text-xs font-semibold text-ink">
                                <th className="border-b border-r border-ink/10 px-4 py-3 text-left">
                                  과&nbsp;&nbsp;정&nbsp;&nbsp;명
                                </th>
                                <th className="border-b border-r border-ink/10 px-4 py-3">
                                  납입일
                                </th>
                                <th className="border-b border-ink/10 px-4 py-3 text-right">
                                  납입금액
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {yearPayments.map((p) => (
                                <tr key={p.id} className="border-b border-ink/10">
                                  <td className="border-r border-ink/10 px-4 py-3 font-medium text-ink">
                                    {p.courseName}
                                  </td>
                                  <td className="border-r border-ink/10 px-4 py-3 text-center text-ink">
                                    {formatShortDate(p.processedAt)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-ink">
                                    {p.netAmount.toLocaleString("ko-KR")}원
                                  </td>
                                </tr>
                              ))}
                              {/* Total row */}
                              <tr className="bg-mist/80 font-semibold text-ink">
                                <td
                                  className="border-r border-ink/10 px-4 py-3 text-center"
                                  colSpan={2}
                                >
                                  합&nbsp;&nbsp;&nbsp;&nbsp;계
                                </td>
                                <td className="px-4 py-3 text-right" style={{ color: "#1F4D3A" }}>
                                  {totalPaid.toLocaleString("ko-KR")}원
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Korean amount reading */}
                        <div className="mb-10 mt-6 border px-6 py-4 text-center" style={{ borderColor: "#1F4D3A", backgroundColor: "rgba(31,77,58,0.04)" }}>
                          <p className="text-base font-bold text-ink">
                            {formatKoreanAmount(totalPaid)}
                          </p>
                          <p className="mt-3 text-sm leading-relaxed text-ink">
                            용 도:&nbsp;&nbsp;
                            <span className="font-semibold">연말정산 소득공제용 (교육비)</span>
                          </p>
                          <p className="mt-2 text-sm text-ink">
                            위와 같이 {selectedTaxYear}년도 교육비를 납입하였음을 증명합니다.
                          </p>
                        </div>

                        {/* Issue date */}
                        <p className="mb-10 text-center text-base text-ink">{today}</p>

                        {/* Academy seal */}
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-base font-bold text-ink">{academyName}</p>
                              <p className="mt-1 text-sm font-semibold text-ink">
                                원&nbsp;&nbsp;&nbsp;&nbsp;장
                                {directorName && (
                                  <span className="ml-2 font-normal">{directorName}</span>
                                )}
                              </p>
                            </div>
                            {/* Seal circle */}
                            <div
                              className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 text-center"
                              style={{ borderColor: "#C55A11", color: "#C55A11" }}
                            >
                              <span className="text-[11px] font-semibold leading-tight">한국경찰</span>
                              <span className="text-[11px] font-semibold leading-tight">학원</span>
                              <span className="mt-0.5 text-[10px]">(인)</span>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-slate">{academyAddress}</p>
                          <p className="text-xs text-slate">TEL {academyPhone}</p>
                          {businessRegNo && (
                            <p className="text-xs text-slate">사업자등록번호: {businessRegNo}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* 수강 없는 경우 */}
          {enrollments.length === 0 ? (
            <section className="rounded-[28px] border border-ink/10 bg-white p-8 no-print text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mist">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-7 w-7 text-slate"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-ink">발급 가능한 증명서가 없습니다</p>
              <p className="mt-2 text-sm text-slate">
                수강 이력이 없거나 아직 등록이 완료되지 않았습니다.
              </p>
              <p className="mt-1 text-sm text-slate">
                문의:{" "}
                {academyPhoneHref ? (
                  <a href={academyPhoneHref} className="font-semibold text-ember">
                    {academyPhone}
                  </a>
                ) : (
                  <span className="font-semibold text-ember">{academyPhone}</span>
                )}
              </p>
            </section>
          ) : (
            <>
              {enrollments.map((enrollment, idx) => {
                const courseName = getCourseName(enrollment);
                const coursePeriod = getCoursePeriod(enrollment);
                const payments = enrollmentPayments[enrollment.id] ?? [];
                const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);
                const enrollCertClass = `enrollment-cert-${idx}`;
                const paymentCertClass = `payment-cert-${idx}`;

                return (
                  <div key={enrollment.id} className="space-y-4">
                    {/* 강좌 구분선 (두 번째부터) */}
                    {idx > 0 && (
                      <div className="flex items-center gap-3 no-print">
                        <div className="h-px flex-1 bg-ink/10" />
                        <span className="text-xs font-semibold text-slate">
                          이전 수강 내역
                        </span>
                        <div className="h-px flex-1 bg-ink/10" />
                      </div>
                    )}

                    {/* ── 수강확인서 ── */}
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
                      {/* 화면 표시용 헤더 */}
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 no-print">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                            Enrollment Certificate
                          </p>
                          <h2 className="mt-1 text-xl font-semibold">수강확인서</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                          >
                            {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                          </span>
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                            {COURSE_TYPE_LABEL[enrollment.courseType]}
                          </span>
                        </div>
                      </div>

                      {/* 화면에서 보이는 데이터 (no-print) */}
                      <div className="no-print space-y-3">
                        <Row label="학번" value={viewer.examNumber} />
                        <Row label="이름" value={viewer.name} />
                        <Row label="강좌명" value={courseName} />
                        <Row label="수강기간" value={coursePeriod} />
                        <Row
                          label="수강료 (확정)"
                          value={formatAmount(enrollment.finalFee)}
                          highlight
                        />
                        <Row
                          label="등록일"
                          value={formatKoreanDate(enrollment.createdAt)}
                        />
                      </div>

                      {/* 인쇄 버튼 */}
                      <div className="mt-5 no-print">
                        <PrintCertButton certClass={enrollCertClass} label="수강확인서 인쇄" />
                      </div>

                      {/* 인쇄 영역 */}
                      <div className={`printable-cert ${enrollCertClass}`}>
                        <div className="mb-8 text-center">
                          <p className="text-xs text-slate">{academyName}</p>
                          <h1 className="mt-2 text-2xl font-bold tracking-widest">수 강 확 인 서</h1>
                          <p className="mt-1 text-xs text-slate">발급일 {today}</p>
                        </div>

                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                학번
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.examNumber}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                이름
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.name}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                강좌명
                              </th>
                              <td className="px-4 py-3 text-ink">{courseName}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강기간
                              </th>
                              <td className="px-4 py-3 text-ink">{coursePeriod}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                등록일
                              </th>
                              <td className="px-4 py-3 text-ink">
                                {formatKoreanDate(enrollment.createdAt)}
                              </td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강료 (납부완료)
                              </th>
                              <td className="px-4 py-3 font-semibold text-ink">
                                {formatAmount(enrollment.finalFee)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p className="mt-8 text-center text-sm text-slate">
                          위와 같이 수강하였음을 확인합니다.
                        </p>
                        <p className="mt-6 text-center text-sm font-semibold text-ink">
                          {academyName}
                        </p>
                        <p className="mt-1 text-center text-xs text-slate">
                          {academyContactLine}
                        </p>
                      </div>
                    </section>

                    {/* ── 납부확인서 ── */}
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
                      {/* 화면 표시용 헤더 */}
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 no-print">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                            Payment Confirmation
                          </p>
                          <h2 className="mt-1 text-xl font-semibold">납부확인서</h2>
                        </div>
                      </div>

                      {/* 화면에서 보이는 데이터 (no-print) */}
                      <div className="no-print space-y-3">
                        <Row label="강좌명" value={courseName} />
                        {payments.length === 0 ? (
                          <div className="rounded-[16px] border border-dashed border-ink/10 px-4 py-5 text-center text-sm text-slate">
                            등록된 납부 내역이 없습니다.
                          </div>
                        ) : (
                          <>
                            {payments.map((payment, pIdx) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist/60 px-4 py-3"
                              >
                                <span className="text-sm text-slate">
                                  {pIdx + 1}차 납부{" "}
                                  <span className="ml-1 text-xs text-slate/70">
                                    ({formatKoreanDate(payment.processedAt)})
                                  </span>
                                </span>
                                <span className="text-sm font-semibold text-ink">
                                  {formatAmount(payment.netAmount)}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between rounded-[16px] border border-forest/20 bg-forest/5 px-4 py-3">
                              <span className="text-sm font-semibold text-forest">합계 납부액</span>
                              <span className="text-sm font-bold text-forest">
                                {formatAmount(totalPaid)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* 인쇄 버튼 */}
                      {payments.length > 0 && (
                        <div className="mt-5 no-print">
                          <PrintCertButton certClass={paymentCertClass} label="납부확인서 인쇄" />
                        </div>
                      )}

                      {/* 인쇄 영역 */}
                      <div className={`printable-cert ${paymentCertClass}`}>
                        <div className="mb-8 text-center">
                          <p className="text-xs text-slate">{academyName}</p>
                          <h1 className="mt-2 text-2xl font-bold tracking-widest">납 부 확 인 서</h1>
                          <p className="mt-1 text-xs text-slate">발급일 {today}</p>
                        </div>

                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                학번
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.examNumber}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                이름
                              </th>
                              <td className="px-4 py-3 text-ink">{viewer.name}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                강좌명
                              </th>
                              <td className="px-4 py-3 text-ink">{courseName}</td>
                            </tr>
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                수강기간
                              </th>
                              <td className="px-4 py-3 text-ink">{coursePeriod}</td>
                            </tr>
                            {payments.map((payment, pIdx) => (
                              <tr key={payment.id} className="border border-ink/20">
                                <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                  {pIdx + 1}차 납부
                                  <span className="block text-[10px] font-normal text-slate">
                                    {formatKoreanDate(payment.processedAt)}
                                  </span>
                                </th>
                                <td className="px-4 py-3 text-ink">
                                  {formatAmount(payment.netAmount)}
                                </td>
                              </tr>
                            ))}
                            <tr className="border border-ink/20">
                              <th className="w-1/3 bg-mist/80 px-4 py-3 text-left font-semibold text-ink">
                                합계 납부액
                              </th>
                              <td className="px-4 py-3 font-bold text-ink">
                                {formatAmount(totalPaid)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p className="mt-8 text-center text-sm text-slate">
                          위와 같이 수강료를 납부하였음을 확인합니다.
                        </p>
                        <p className="mt-6 text-center text-sm font-semibold text-ink">
                          {academyName}
                        </p>
                        <p className="mt-1 text-center text-xs text-slate">
                          {academyContactLine}
                        </p>
                      </div>
                    </section>
                  </div>
                );
              })}
            </>
          )}

          {/* ── 재학증명서 요청 안내 ── */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8 no-print">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Enrollment Verification
              </p>
              <h2 className="mt-1 text-xl font-semibold">재학증명서 요청</h2>
            </div>

            <p className="text-sm leading-7 text-slate">
              재학증명서가 필요하신 경우 학원 방문 또는 전화로 문의하세요.
            </p>

            <div className="mt-4 rounded-[20px] border border-ink/10 bg-mist/60 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">전화 문의</p>
                  {academyPhoneHref ? (
                    <a
                      href={academyPhoneHref}
                      className="text-sm font-bold text-ember hover:underline"
                    >
                      {academyPhone}
                    </a>
                  ) : (
                    <p className="text-sm font-bold text-ink">{academyPhone}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">영업시간</p>
                  <p className="text-sm font-medium text-ink">
                    평일 09:00 - 21:00
                  </p>
                  <p className="text-sm font-medium text-ink">
                    주말 09:00 - 18:00
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 text-forest"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 0 0 .281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 15.57 17 13.162 17 10a7 7 0 1 0-14 0c0 3.162 1.698 5.57 3.354 7.085a13.353 13.353 0 0 0 3.032 2.198l.018.008.006.003ZM10 11.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate">위치</p>
                  <p className="text-sm font-medium leading-relaxed text-ink">
                    {academyAddress}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── 서류 발급 이력 ── */}
          <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm sm:p-8 no-print">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                Issuance History
              </p>
              <h2 className="mt-1 text-xl font-semibold">서류 발급 이력</h2>
              <p className="mt-1 text-sm text-slate">
                관리자가 발급한 서류 이력을 확인할 수 있습니다.
              </p>
            </div>

            {documentIssuances.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-ink/10 px-4 py-8 text-center">
                <p className="text-sm text-slate">발급된 서류 이력이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[20px] border border-ink/10">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead className="bg-mist/80 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate">서류 종류</th>
                      <th className="px-4 py-3 font-semibold text-slate">발급일</th>
                      <th className="px-4 py-3 font-semibold text-slate">발급 담당자</th>
                      <th className="px-4 py-3 font-semibold text-slate">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {documentIssuances.map((item) => {
                      const y = item.issuedAt.getFullYear();
                      const m = String(item.issuedAt.getMonth() + 1).padStart(2, "0");
                      const d = String(item.issuedAt.getDate()).padStart(2, "0");
                      const issuedDateStr = `${y}.${m}.${d}`;
                      return (
                        <tr key={item.id} className="hover:bg-mist/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                              {DOCUMENT_TYPE_LABEL[item.docType] ?? item.docType}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                            {issuedDateStr}
                          </td>
                          <td className="px-4 py-3 text-slate">
                            {item.issuedByUser.name}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate">
                            {item.note ?? "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 안내 */}
          <p className="pb-24 text-center text-xs text-slate no-print">
            증명서 출력 시 브라우저 인쇄 기능을 사용합니다. 이 페이지는 개인 정보 보호를 위해 세션이 유지된 경우에만 발급됩니다.
          </p>
        </div>
      </main>
    </>
  );
}
