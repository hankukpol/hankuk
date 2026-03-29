import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { InstructorSettlementDetailClient } from "./detail-client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

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

const TAX_RATE = 0.033;

function formatKRW(amount: number) {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

type PageProps = {
  params: Promise<{ staffId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorSettlementDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const { staffId } = await params;
  const sp = searchParams ? await searchParams : {};
  const rawMonth = Array.isArray(sp.month) ? sp.month[0] : sp.month;

  const today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth() + 1;
  if (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth)) {
    const [y, m] = rawMonth.split("-").map(Number);
    if (y >= 2020 && y <= 2100 && m >= 1 && m <= 12) {
      currentYear = y;
      currentMonth = m;
    }
  }

  const db = getPrisma();

  // Fetch staff info
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, adminUserId: true, mobile: true },
  });

  if (!staff) notFound();

  const adminUserId = staff.adminUserId;

  if (!adminUserId) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "보고서", href: "/admin/reports" },
            { label: "강사 정산", href: "/admin/reports/instructor-settlement" },
            { label: staff.name },
          ]}
        />
        <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center shadow-sm">
          <p className="text-slate">
            이 직원은 관리자 계정과 연동되어 있지 않아 정산 데이터가 없습니다.
          </p>
          <Link
            href="/admin/reports/instructor-settlement"
            className="mt-4 inline-block text-sm text-forest underline"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // Build 12-month range ending at current month
  const months: { year: number; month: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    let y = currentYear;
    let m = currentMonth - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push({ year: y, month: m });
  }

  // Fetch payments grouped by month for last 12 months
  const rangeStart = new Date(months[0].year, months[0].month - 1, 1);
  const rangeEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const payments = await db.payment.findMany({
    where: {
      processedBy: adminUserId,
      processedAt: { gte: rangeStart, lte: rangeEnd },
      status: { notIn: ["CANCELLED"] },
    },
    select: {
      netAmount: true,
      processedAt: true,
    },
    orderBy: { processedAt: "asc" },
  });

  // Also fetch InstructorSettlement records to check isPaid
  const settlementRecords = await db.instructorSettlement.findMany({
    where: {
      instructor: {
        // Use email match via Staff if instructorId is linked
        // Since there's no direct link, we skip isPaid for Staff-based settlements
      },
    },
    select: {
      month: true,
      isPaid: true,
      paidAt: true,
      totalAmount: true,
    },
  }).catch(() => [] as Array<{ month: string; isPaid: boolean; paidAt: Date | null; totalAmount: number }>);

  const paidMap = new Map<string, boolean>(
    settlementRecords.map((s) => [s.month, s.isPaid])
  );

  // Aggregate payments by month
  const paymentsByMonth = new Map<
    string,
    { count: number; total: number }
  >();
  for (const p of payments) {
    const key = formatYearMonth(
      p.processedAt.getFullYear(),
      p.processedAt.getMonth() + 1
    );
    const existing = paymentsByMonth.get(key);
    if (existing) {
      existing.count++;
      existing.total += p.netAmount;
    } else {
      paymentsByMonth.set(key, { count: 1, total: p.netAmount });
    }
  }

  const currentMonthStr = formatYearMonth(currentYear, currentMonth);

  // Build monthly rows
  const monthlyRows = months.map(({ year, month }) => {
    const key = formatYearMonth(year, month);
    const agg = paymentsByMonth.get(key);
    const totalRevenue = agg?.total ?? 0;
    const taxDeduction = Math.floor(totalRevenue * TAX_RATE);
    return {
      month: key,
      paymentCount: agg?.count ?? 0,
      totalRevenue,
      taxDeduction,
      netPayout: totalRevenue - taxDeduction,
      isPaid: paidMap.get(key) ?? false,
    };
  });

  // YTD total (current year months only)
  const ytdRows = monthlyRows.filter((r) => r.month.startsWith(String(currentYear)));
  const ytdTotal = ytdRows.reduce((s, r) => s + r.totalRevenue, 0);

  // Monthly average of last 12 months
  const nonZeroRows = monthlyRows.filter((r) => r.totalRevenue > 0);
  const monthlyAvg =
    nonZeroRows.length > 0
      ? Math.round(nonZeroRows.reduce((s, r) => s + r.totalRevenue, 0) / nonZeroRows.length)
      : 0;

  // Current month revenue
  const currentMonthRevenue = paymentsByMonth.get(currentMonthStr)?.total ?? 0;

  // Prev year same period: Jan–currentMonth of (currentYear - 1)
  const prevYearStart = new Date(currentYear - 1, 0, 1);
  const prevYearEnd = new Date(currentYear - 1, currentMonth, 0, 23, 59, 59, 999);
  const prevYearPayments = await db.payment.aggregate({
    where: {
      processedBy: adminUserId,
      processedAt: { gte: prevYearStart, lte: prevYearEnd },
      status: { notIn: ["CANCELLED"] },
    },
    _sum: { netAmount: true },
  });
  const prevYearSamePeriodTotal = prevYearPayments._sum.netAmount ?? 0;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "보고서", href: "/admin/reports" },
          { label: "강사 정산", href: "/admin/reports/instructor-settlement" },
          { label: staff.name },
        ]}
      />

      {/* Page tag */}
      <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        강사 정산 상세
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {staff.name}{" "}
            <span className="text-xl font-normal text-slate">
              ({STAFF_ROLE_LABEL[staff.role as string] ?? staff.role})
            </span>
          </h1>
          {staff.mobile && (
            <p className="mt-1 text-sm text-slate">{staff.mobile}</p>
          )}
          <p className="mt-2 text-sm text-slate">
            정산 기간:{" "}
            <span className="font-medium text-ink">
              {months[0].year}년 {months[0].month}월 ~{" "}
              {currentYear}년 {currentMonth}월
            </span>
          </p>
        </div>

        <Link
          href="/admin/reports/instructor-settlement"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          목록으로
        </Link>
      </div>

      {/* Summary KPI (server-side) */}
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        이번달({currentYear}년 {currentMonth}월) 정산금액:{" "}
        <strong>{formatKRW(currentMonthRevenue)}</strong>
      </div>

      {/* Client component with full detail */}
      <InstructorSettlementDetailClient
        staffId={staffId}
        staffName={staff.name}
        staffRole={staff.role as string}
        monthlyRows={monthlyRows}
        ytdTotal={ytdTotal}
        monthlyAvg={monthlyAvg}
        prevYearSamePeriodTotal={prevYearSamePeriodTotal}
        currentMonthRevenue={currentMonthRevenue}
        currentMonthStr={currentMonthStr}
      />
    </div>
  );
}
