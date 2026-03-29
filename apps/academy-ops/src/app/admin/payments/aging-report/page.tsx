import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  AgingReportClient,
  type AgingRow,
  type AgingBracket,
  type BracketSummary,
} from "./aging-report-client";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function classifyBracket(daysOverdue: number): AgingBracket {
  if (daysOverdue >= 90) return "overdue90plus";
  if (daysOverdue >= 61) return "overdue61";
  if (daysOverdue >= 31) return "overdue31";
  return "current";
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AgingReportPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const baseDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Fetch all unpaid installments (dueDate <= today) ordered by most overdue first
  const rawItems = await prisma.installment.findMany({
    where: {
      paidAt: null,
      dueDate: { lte: todayStart },
    },
    include: {
      payment: {
        select: {
          id: true,
          enrollmentId: true,
          examNumber: true,
          note: true,
          student: { select: { name: true, phone: true, examNumber: true } },
          items: { select: { itemName: true }, take: 1 },
          // get installments of the same payment to find last paid one
          installments: {
            where: { paidAt: { not: null } },
            orderBy: { paidAt: "desc" },
            take: 1,
            select: { paidAt: true },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 1000,
  });

  // Build AgingRow list
  const rows: AgingRow[] = rawItems.map((item) => {
    const dueDate = item.dueDate;
    const diffMs = todayStart.getTime() - dueDate.getTime();
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const bracket = classifyBracket(daysOverdue);

    const lastPaidAt = item.payment.installments[0]?.paidAt ?? null;

    return {
      installmentId: item.id,
      paymentId: item.paymentId,
      enrollmentId: item.payment.enrollmentId ?? null,
      examNumber: item.payment.examNumber ?? null,
      studentName: item.payment.student?.name ?? null,
      mobile: item.payment.student?.phone ?? null,
      courseName:
        item.payment.items[0]?.itemName ?? item.payment.note ?? "—",
      dueDate: toDateStr(dueDate),
      daysOverdue,
      amount: item.amount,
      lastPaidAt: lastPaidAt ? toDateStr(lastPaidAt) : null,
      bracket,
    };
  });

  // Sort: most overdue first
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

  // ── Build bracket summaries ────────────────────────────────────────────────

  const BRACKET_CONFIG: Omit<BracketSummary, "amount" | "count" | "studentCount">[] = [
    {
      label: "0–30일 연체",
      shortLabel: "0-30일",
      bracket: "current",
      color: "yellow",
      barColor: "bg-yellow-400",
      textColor: "text-yellow-700",
      borderColor: "border-yellow-300",
      bgColor: "bg-yellow-50",
    },
    {
      label: "31–60일 연체",
      shortLabel: "31-60일",
      bracket: "overdue31",
      color: "amber",
      barColor: "bg-amber-500",
      textColor: "text-amber-700",
      borderColor: "border-amber-300",
      bgColor: "bg-amber-50",
    },
    {
      label: "61–90일 연체",
      shortLabel: "61-90일",
      bracket: "overdue61",
      color: "orange",
      barColor: "bg-orange-500",
      textColor: "text-orange-700",
      borderColor: "border-orange-300",
      bgColor: "bg-orange-50",
    },
    {
      label: "90일↑ 연체",
      shortLabel: "90일↑",
      bracket: "overdue90plus",
      color: "red",
      barColor: "bg-red-500",
      textColor: "text-red-700",
      borderColor: "border-red-300",
      bgColor: "bg-red-50",
    },
  ];

  const brackets: BracketSummary[] = BRACKET_CONFIG.map((cfg) => {
    const bracketRows = rows.filter((r) => r.bracket === cfg.bracket);
    const uniqueStudents = new Set(bracketRows.map((r) => r.examNumber).filter(Boolean));
    return {
      ...cfg,
      amount: bracketRows.reduce((s, r) => s + r.amount, 0),
      count: bracketRows.length,
      studentCount: uniqueStudents.size,
    };
  });

  // ── KPI aggregates ─────────────────────────────────────────────────────────

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const uniqueStudentSet = new Set(rows.map((r) => r.examNumber).filter(Boolean));
  const totalStudents = uniqueStudentSet.size;

  const avgDaysOverdue =
    rows.length > 0 ? rows.reduce((s, r) => s + r.daysOverdue, 0) / rows.length : 0;

  const severe90PlusStudents = new Set(
    rows.filter((r) => r.bracket === "overdue90plus").map((r) => r.examNumber).filter(Boolean),
  ).size;

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">미수금 연령 분석</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            분납 약정 중 미납된 건을 연체 경과일 기준으로 분류합니다.{" "}
            <span className="font-medium text-ink">기준일: {baseDateStr}</span>
          </p>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payments/unpaid"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            미납 현황 →
          </Link>
          <Link
            href="/admin/payments/installments"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            할부 관리 →
          </Link>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/payments" className="hover:text-ember hover:underline">
          수납 관리
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">미수금 연령 분석</span>
      </nav>

      {/* Client component */}
      <div className="mt-8">
        <AgingReportClient
          rows={rows}
          brackets={brackets}
          totalAmount={totalAmount}
          totalStudents={totalStudents}
          avgDaysOverdue={avgDaysOverdue}
          severe90PlusStudents={severe90PlusStudents}
          baseDate={baseDateStr}
        />
      </div>

      <p className="mt-6 text-xs text-slate/70">
        * 최대 1,000건의 미납 분납 회차를 조회합니다. 납부예정일이 오늘 이전인 미납 건만 포함됩니다.
      </p>
    </div>
  );
}
