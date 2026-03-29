import Link from "next/link";
import type { Metadata } from "next";
import { PaymentMethod, PaymentStatus, PaymentCategory } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "납부 확인서",
};

// ─── Labels ───────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const PAYMENT_CATEGORY_LABEL: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과",
  PENALTY: "위약금",
  ETC: "기타",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리 중",
  APPROVED: "승인",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatDateKRFull(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}년 ${m}월 ${d}일`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentRow = {
  id: string;
  category: PaymentCategory;
  method: PaymentMethod;
  status: PaymentStatus;
  netAmount: number;
  note: string | null;
  processedAt: Date;
};

type YearGroup = {
  year: number;
  payments: PaymentRow[];
  totalAmount: number;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchPaymentsByYear(examNumber: string): Promise<YearGroup[]> {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 2;

  const payments = await getPrisma().payment.findMany({
    where: {
      examNumber,
      status: {
        in: [
          PaymentStatus.APPROVED,
          PaymentStatus.PARTIAL_REFUNDED,
        ],
      },
      processedAt: {
        gte: new Date(`${startYear}-01-01T00:00:00.000Z`),
      },
    },
    orderBy: { processedAt: "desc" },
    select: {
      id: true,
      category: true,
      method: true,
      status: true,
      netAmount: true,
      note: true,
      processedAt: true,
    },
  });

  // Group by year
  const yearMap = new Map<number, PaymentRow[]>();
  for (let y = currentYear; y >= startYear; y--) {
    yearMap.set(y, []);
  }
  for (const p of payments) {
    const y = p.processedAt.getFullYear();
    if (yearMap.has(y)) {
      yearMap.get(y)!.push(p);
    }
  }

  return Array.from(yearMap.entries()).map(([year, rows]) => ({
    year,
    payments: rows,
    totalAmount: rows.reduce((sum, r) => sum + r.netAmount, 0),
  }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentStatementsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Statements Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            납부 확인서는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Statements
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            납부 확인서
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            로그인하면 연간 납부 내역 및 납부 확인서를 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/statements" />
      </main>
    );
  }

  const yearGroups = await fetchPaymentsByYear(viewer.examNumber);
  const today = new Date();
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  return (
    <>
      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-only { display: block !important; }
          .print-section { page-break-inside: avoid; }
        }
        .print-only { display: none; }
      `}</style>

      <main className="space-y-4 px-0 py-6">
        {/* Header */}
        <section className="no-print rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Tuition Statement
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">납부 확인서</h1>
              <p className="mt-2 text-xs leading-6 text-slate">
                최근 3개년 납부 내역을 조회하고 납부 확인서를 인쇄할 수 있습니다.
              </p>
            </div>
            <Link
              href="/student"
              className="no-print inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </section>

        {/* Year sections */}
        {yearGroups.map((group) => (
          <section
            key={group.year}
            className="print-section rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6"
          >
            {/* Print header — only visible during print */}
            <div className="print-only mb-6 border-b border-ink/10 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate">{branding.academyName}</p>
                  {branding.address ? (
                    <p className="text-xs text-slate">{branding.address}</p>
                  ) : null}
                  {branding.phone ? (
                    <p className="text-xs text-slate">대표전화: {branding.phone}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-base font-bold">납부 확인서</p>
                  <p className="text-xs text-slate">{group.year}년도</p>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-xs text-slate">
                <p>
                  성명: <span className="font-semibold text-ink">{viewer.name}</span>
                </p>
                <p>
                  학번: <span className="font-semibold text-ink">{viewer.examNumber}</span>
                </p>
                <p>발급일자: {formatDateKRFull(today)}</p>
              </div>
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">{group.year}년</h2>
                <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                  {group.payments.length}건
                </span>
              </div>
              <PrintButton year={group.year} />
            </div>

            {/* Payment table */}
            {group.payments.length > 0 ? (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="pb-2 text-left text-xs font-semibold text-slate">일자</th>
                        <th className="pb-2 text-left text-xs font-semibold text-slate">구분</th>
                        <th className="pb-2 text-left text-xs font-semibold text-slate">결제수단</th>
                        <th className="pb-2 text-right text-xs font-semibold text-slate">금액</th>
                        <th className="no-print pb-2 text-left text-xs font-semibold text-slate">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {group.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-4 text-xs text-slate">
                            {formatDateKR(p.processedAt)}
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="text-xs font-medium text-ink">
                              {PAYMENT_CATEGORY_LABEL[p.category]}
                            </span>
                            {p.note && (
                              <p className="mt-0.5 text-[10px] text-slate">{p.note}</p>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-slate">
                            {PAYMENT_METHOD_LABEL[p.method]}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-xs font-semibold text-ink">
                            {formatAmount(p.netAmount)}
                          </td>
                          <td className="no-print py-2.5 text-xs text-slate">
                            {PAYMENT_STATUS_LABEL[p.status]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Annual total */}
                <div className="mt-4 flex items-center justify-between rounded-[16px] border border-ink/10 bg-mist px-5 py-3">
                  <span className="text-sm font-semibold text-ink">{group.year}년 납부 합계</span>
                  <span className="text-lg font-bold text-ink">
                    {formatAmount(group.totalAmount)}
                  </span>
                </div>

                {/* Print footer */}
                <div className="print-only mt-6 border-t border-ink/10 pt-4 text-center text-xs text-slate">
                  <p>위 납부 내역이 사실임을 확인합니다.</p>
                  <div className="mt-4 flex justify-end gap-8">
                    <p>발행기관: {branding.academyName}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-ink/10 px-5 py-8 text-center">
                <p className="text-sm text-slate">{group.year}년 납부 내역이 없습니다.</p>
              </div>
            )}
          </section>
        ))}

        {/* Info note */}
        <section className="no-print rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <h2 className="text-sm font-semibold text-ink">납부 확인서 안내</h2>
          <div className="mt-3 space-y-2 text-xs text-slate">
            <p>납부 확인서는 연말정산 교육비 공제 등의 목적으로 사용할 수 있습니다.</p>
            <p>공식 발급이 필요한 경우 학원 사무실에서 직인 발행을 요청해 주세요.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {branding.phoneHref ? (
                <a
                  href={branding.phoneHref}
                  className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                >
                  {branding.phone}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs font-semibold text-ink">
                  학원 문의
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs text-slate">
                평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
