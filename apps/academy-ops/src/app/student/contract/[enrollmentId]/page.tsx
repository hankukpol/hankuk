import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseType, EnrollmentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { ContractPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// ─── Label maps ────────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractItem = { label: string; amount: number };

type PageProps = { params: Promise<{ enrollmentId: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function toDateString(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Refund policy text ───────────────────────────────────────────────────────

const REFUND_POLICY = `학원의설립·운영및과외교습에관한법률 시행령 제18조에 따라 환불 기준이 적용됩니다.

• 수강 시작 전: 납부금액 전액 환불
• 수업 시작 후 1개월 이내: 남은 수업 비율에 따라 환불
• 수업 시작 1개월 초과: 남은 수업 비율의 1/2 환불
• 수업 시작 2개월 초과: 환불 불가

※ 위 기준은 관계 법령에 따라 변경될 수 있습니다.
※ 구체적인 환불 금액은 관리사무실에 문의하시기 바랍니다.`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentContractDetailPage({ params }: PageProps) {
  const { enrollmentId } = await params;

  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Contract Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              계약서는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <div className="mt-8">
              <Link
                href="/student/contract"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ← 계약서 목록
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              수강계약서
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              계약서는 로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath={`/student/contract/${enrollmentId}`} />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // Fetch the enrollment — must belong to this student
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          examNumber: true,
        },
      },
      product: {
        select: { id: true, name: true, examCategory: true },
      },
      cohort: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      specialLecture: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      contract: {
        select: {
          id: true,
          items: true,
          note: true,
          issuedAt: true,
          printedAt: true,
          staff: {
            select: { name: true },
          },
        },
      },
    },
  });

  // 404 if not found or doesn't belong to this viewer
  if (!enrollment || enrollment.examNumber !== viewer.examNumber) {
    notFound();
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const contract = enrollment.contract;

  // Parse contract items
  let contractItems: ContractItem[] = [];
  if (contract?.items) {
    try {
      const parsed = contract.items as unknown;
      if (Array.isArray(parsed)) {
        contractItems = parsed as ContractItem[];
      }
    } catch {
      contractItems = [];
    }
  }

  const totalAmount = contractItems.reduce((sum, item) => sum + item.amount, 0);

  const courseName =
    enrollment.courseType === CourseType.COMPREHENSIVE
      ? enrollment.product?.name ?? "종합반"
      : enrollment.specialLecture?.name ?? "특강";
  const cohortName = enrollment.cohort?.name ?? null;
  const courseLabel = COURSE_TYPE_LABEL[enrollment.courseType];

  // Determine date range for contract display
  const startDate = enrollment.startDate;
  const endDate =
    enrollment.endDate ??
    (enrollment.cohort?.endDate ?? enrollment.specialLecture?.endDate ?? null);

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* ── Back navigation (hidden on print) ── */}
        <div className="no-print flex items-center gap-3">
          <Link
            href="/student/contract"
            className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                clipRule="evenodd"
              />
            </svg>
            계약서 목록으로
          </Link>
        </div>

        {/* ── Contract document ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-10 print:rounded-none print:border-0 print:shadow-none">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="no-print inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Course Contract
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl print:mt-0">
                수강 계약서
              </h1>
            </div>
            {contract && (
              <div className="text-right text-sm text-slate">
                <p>
                  계약일:{" "}
                  <span className="font-semibold text-ink">
                    {toDateString(new Date(contract.issuedAt))}
                  </span>
                </p>
                {contract.printedAt && (
                  <p className="mt-0.5">
                    출력일:{" "}
                    <span className="font-semibold text-ink">
                      {toDateString(new Date(contract.printedAt))}
                    </span>
                  </p>
                )}
                {contract.staff && (
                  <p className="mt-0.5">
                    담당:{" "}
                    <span className="font-semibold text-ink">{contract.staff.name}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          <hr className="my-6 border-ink/10" />

          {/* ── Student info ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[20px] border border-ink/10 bg-mist px-5 py-4">
              <p className="text-xs font-medium text-slate">수강생</p>
              <p className="mt-1.5 text-xl font-bold text-ink">{enrollment.student.name}</p>
              <p className="mt-0.5 text-sm text-slate">학번: {enrollment.student.examNumber}</p>
              {enrollment.student.phone && (
                <p className="mt-0.5 text-sm text-slate">
                  연락처: {enrollment.student.phone}
                </p>
              )}
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-mist px-5 py-4">
              <p className="text-xs font-medium text-slate">수강 정보</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
                  {courseLabel}
                </span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                >
                  {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                </span>
              </div>
              <p className="mt-1.5 text-lg font-semibold text-ink">
                {courseName}
                {cohortName ? ` · ${cohortName}기` : ""}
              </p>
              {startDate && (
                <p className="mt-0.5 text-sm text-slate">
                  수강 기간:{" "}
                  <span className="text-ink">
                    {formatDate(startDate)}
                    {endDate ? ` ~ ${formatDate(endDate)}` : ""}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── No contract message ── */}
          {!contract && (
            <div className="mt-6 rounded-[20px] border border-dashed border-amber-200 bg-amber-50/50 px-5 py-6 text-sm">
              <p className="font-semibold text-amber-700">계약서 미발행</p>
              <p className="mt-1.5 leading-7 text-amber-600">
                이 수강 등록에 대한 계약서가 아직 발행되지 않았습니다.
                관리사무실에 문의하시면 발행해 드립니다.
              </p>
            </div>
          )}

          {/* ── Contract items ── */}
          {contract && (
            <>
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-ink">수강 항목</h2>
                {contractItems.length === 0 ? (
                  <p className="mt-3 text-sm text-slate">항목 정보가 없습니다.</p>
                ) : (
                  <div className="mt-3 overflow-hidden rounded-[20px] border border-ink/10">
                    <table className="min-w-full divide-y divide-ink/10 text-sm">
                      <thead className="bg-mist/80">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold text-slate">
                            항목명
                          </th>
                          <th className="px-5 py-3 text-right text-xs font-semibold text-slate">
                            금액
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/10 bg-white">
                        {contractItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-5 py-3.5 text-ink">{item.label}</td>
                            <td className="px-5 py-3.5 text-right tabular-nums text-ink">
                              {formatAmount(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-ink/10 bg-mist/60">
                        <tr>
                          <td className="px-5 py-3.5 font-semibold text-ink">합계</td>
                          <td className="px-5 py-3.5 text-right text-lg font-bold tabular-nums text-ember">
                            {formatAmount(totalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Discount info ── */}
              {enrollment.discountAmount > 0 && (
                <div className="mt-4 flex items-center justify-between rounded-[16px] border border-amber-200 bg-amber-50 px-5 py-3 text-sm">
                  <span className="text-amber-700">할인 적용</span>
                  <span className="font-semibold text-amber-700">
                    - {formatAmount(enrollment.discountAmount)}
                  </span>
                </div>
              )}

              {/* ── Final fee summary ── */}
              <div className="mt-3 flex items-center justify-between rounded-[16px] border border-forest/20 bg-forest/5 px-5 py-4">
                <span className="text-sm font-semibold text-forest">최종 수강료</span>
                <span className="text-xl font-bold tabular-nums text-forest">
                  {formatAmount(enrollment.finalFee)}
                </span>
              </div>

              {/* ── Note / Special terms ── */}
              {contract.note && (
                <div className="mt-6">
                  <h2 className="text-sm font-semibold text-ink">특약사항</h2>
                  <div className="mt-3 rounded-[20px] border border-ink/10 bg-mist px-5 py-4 text-sm leading-7 text-slate whitespace-pre-wrap">
                    {contract.note}
                  </div>
                </div>
              )}

              {/* ── Refund policy ── */}
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-ink">환불 정책</h2>
                <div className="mt-3 rounded-[20px] border border-ink/10 bg-mist px-5 py-4 text-sm leading-7 text-slate whitespace-pre-wrap">
                  {REFUND_POLICY}
                </div>
              </div>

              {/* ── Signature area (print only) ── */}
              <div className="mt-10 hidden grid-cols-2 gap-8 print:grid">
                <div className="border-t-2 border-ink pt-2 text-center text-sm text-slate">
                  학원장 (인)
                </div>
                <div className="border-t-2 border-ink pt-2 text-center text-sm text-slate">
                  수강생 (인)
                </div>
              </div>

              {/* ── Academy info (print only) ── */}
              <div className="mt-8 hidden text-center text-xs text-slate print:block">
                <p className="font-semibold text-ink">{branding.academyName}</p>
                <p>{branding.contactLine ?? "운영 문의는 학원 창구로 연락해 주세요."}</p>
              </div>
            </>
          )}
        </section>

        {/* ── Action buttons (hidden on print) ── */}
        <div className="no-print flex flex-wrap justify-center gap-3">
          {contract && <ContractPrintButton />}
          <Link
            href="/student/contract"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            계약서 목록
          </Link>
          <Link
            href="/student/enrollment"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-6 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            수강 정보
          </Link>
        </div>

      </div>

    </main>
  );
}
