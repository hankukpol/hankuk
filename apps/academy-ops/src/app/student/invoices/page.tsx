import Link from "next/link";
import type { Metadata } from "next";
import { PaymentMethod, PaymentStatus, PaymentCategory } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "영수증 목록",
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

const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
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

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchInvoices(examNumber: string) {
  return getPrisma().payment.findMany({
    where: { examNumber },
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
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentInvoicesPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Invoices Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            영수증 목록은 DB 연결 후 사용할 수 있습니다.
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
            Invoices
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            영수증 목록
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            로그인하면 납부 내역 및 영수증을 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/invoices" />
      </main>
    );
  }

  const invoices = await fetchInvoices(viewer.examNumber);

  return (
    <main className="space-y-4 px-0 py-6">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Invoices
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">영수증 목록</h1>
            <p className="mt-2 text-xs leading-6 text-slate">
              납부 내역을 확인하고 영수증을 출력할 수 있습니다.
            </p>
          </div>
          <Link
            href="/student"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            포털로 돌아가기
          </Link>
        </div>
      </section>

      {/* Invoices list */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">납부 내역</p>
        {invoices.length > 0 ? (
          <ul className="mt-4 divide-y divide-ink/5">
            {invoices.map((inv) => (
              <li key={inv.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">
                        {PAYMENT_CATEGORY_LABEL[inv.category]}
                      </span>
                      <span className="text-xs text-slate">
                        {PAYMENT_METHOD_LABEL[inv.method]}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_COLOR[inv.status]}`}
                      >
                        {PAYMENT_STATUS_LABEL[inv.status]}
                      </span>
                    </div>
                    {inv.note && (
                      <p className="mt-1 truncate text-xs text-slate">{inv.note}</p>
                    )}
                    <p className="mt-1 text-xs text-slate">{formatDateKR(inv.processedAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-base font-bold">{formatAmount(inv.netAmount)}</span>
                    {inv.status !== "CANCELLED" && (
                      <Link
                        href={`/student/invoices/${inv.id}`}
                        className="inline-flex items-center rounded-full border border-ember/30 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/10"
                      >
                        영수증 보기
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate">납부 내역이 없습니다.</p>
        )}
      </section>
    </main>
  );
}
