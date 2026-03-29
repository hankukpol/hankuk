import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { DailyBreakdownClient } from "./daily-breakdown-client";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffDayRow = {
  staffId: string;
  staffName: string;
  staffRole: string;
  paymentCount: number;
  total: number;
};

export type DayRow = {
  date: string; // "YYYY-MM-DD"
  dayLabel: string; // "3월 5일 (수)"
  totalCount: number;
  totalAmount: number;
  byStaff: StaffDayRow[];
  byCash: number;
  byCard: number;
  byTransfer: number;
  byOther: number;
};

export type DailyBreakdownData = {
  year: number;
  month: number;
  staffList: { staffId: string; staffName: string; staffRole: string }[];
  days: DayRow[];
  grandTotal: number;
  grandCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAFF_ROLE_LABEL: Record<string, string> = {
  OWNER: "대표",
  DIRECTOR: "원장",
  DEPUTY_DIRECTOR: "부원장",
  MANAGER: "실장",
  ACADEMIC_ADMIN: "교무행정",
  COUNSELOR: "상담",
  TEACHER: "강사",
};

const DAY_OF_WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function parseMonthParam(
  monthParam: string | string[] | undefined
): { year: number; month: number } {
  const raw = Array.isArray(monthParam) ? monthParam[0] : monthParam;
  const today = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffSettlementDailyPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const db = getPrisma();

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Load active staff with adminUserId
  const staffList = await db.staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: { id: true, name: true, role: true, adminUserId: true },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Load all payments for the month
  const payments = await db.payment.findMany({
    where: {
      processedBy: adminUserIds.length > 0 ? { in: adminUserIds } : undefined,
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    select: {
      id: true,
      processedAt: true,
      processedBy: true,
      method: true,
      netAmount: true,
    },
    orderBy: { processedAt: "asc" },
  });

  // Build adminUserId → staff map
  const adminToStaff = new Map(
    staffList
      .filter((s): s is typeof s & { adminUserId: string } => s.adminUserId !== null)
      .map((s) => [s.adminUserId, s])
  );

  // Build per-day data
  const days: DayRow[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    const dayPayments = payments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });

    if (dayPayments.length === 0) continue;

    // Per-staff totals for this day
    const staffMap = new Map<
      string,
      { staffId: string; staffName: string; staffRole: string; paymentCount: number; total: number }
    >();

    let byCash = 0;
    let byCard = 0;
    let byTransfer = 0;
    let byOther = 0;

    for (const p of dayPayments) {
      const staff = adminToStaff.get(p.processedBy);
      if (!staff) continue;

      const existing = staffMap.get(staff.id);
      if (existing) {
        existing.paymentCount++;
        existing.total += p.netAmount;
      } else {
        staffMap.set(staff.id, {
          staffId: staff.id,
          staffName: staff.name,
          staffRole: staff.role as string,
          paymentCount: 1,
          total: p.netAmount,
        });
      }

      const method = p.method as string;
      if (method === "CASH") byCash += p.netAmount;
      else if (method === "CARD") byCard += p.netAmount;
      else if (method === "TRANSFER") byTransfer += p.netAmount;
      else byOther += p.netAmount;
    }

    const byStaff = Array.from(staffMap.values()).sort((a, b) =>
      a.staffName.localeCompare(b.staffName)
    );

    const totalAmount = dayPayments.reduce((s, p) => s + p.netAmount, 0);

    const dateObj = new Date(year, month - 1, day);
    const dow = DAY_OF_WEEK[dateObj.getDay()];
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    days.push({
      date: dateStr,
      dayLabel: `${month}월 ${day}일 (${dow})`,
      totalCount: dayPayments.length,
      totalAmount,
      byStaff,
      byCash,
      byCard,
      byTransfer,
      byOther,
    });
  }

  const grandTotal = days.reduce((s, d) => s + d.totalAmount, 0);
  const grandCount = days.reduce((s, d) => s + d.totalCount, 0);

  const serializedStaffList = staffList.map((s) => ({
    staffId: s.id,
    staffName: s.name,
    staffRole: s.role as string,
  }));

  const data: DailyBreakdownData = {
    year,
    month,
    staffList: serializedStaffList,
    days,
    grandTotal,
    grandCount,
  };

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const today = new Date();
  const isNextFuture =
    next.year > today.getFullYear() ||
    (next.year === today.getFullYear() && next.month > today.getMonth() + 1);

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "보고서", href: "/admin/staff-settlements" },
          { label: "직원 정산", href: "/admin/staff-settlements" },
          { label: "일별 상세" },
        ]}
      />

      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">직원 정산 — 일별 상세</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            선택한 월의 일별 수납 내역을 직원별로 조회합니다. 날짜별 수납 금액과 결제 수단
            분류를 확인할 수 있습니다.
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/staff-settlements/daily?month=${formatYearMonth(prev.year, prev.month)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 달"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="min-w-[80px] text-center text-sm font-medium text-ink">
            {year}년 {month}월
          </span>
          {isNextFuture ? (
            <span className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/admin/staff-settlements/daily?month=${formatYearMonth(next.year, next.month)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 달"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            영업일 수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {days.length.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">일</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            총 수납 건수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {grandCount.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
            총 수납액
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {grandTotal.toLocaleString("ko-KR")}원
          </p>
        </div>
      </div>

      {/* Staff role legend */}
      {serializedStaffList.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {serializedStaffList.map((s) => (
            <Link
              key={s.staffId}
              href={`/admin/staff-settlements/${s.staffId}?month=${formatYearMonth(year, month)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            >
              <span className="font-medium text-ink">{s.staffName}</span>
              <span>{STAFF_ROLE_LABEL[s.staffRole] ?? s.staffRole}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Daily breakdown table (client component for print) */}
      <div className="mt-8">
        {days.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center text-slate shadow-sm">
            {year}년 {month}월에 수납 처리 내역이 없습니다.
          </div>
        ) : (
          <DailyBreakdownClient data={data} staffRoleLabel={STAFF_ROLE_LABEL} />
        )}
      </div>

      {/* Back link */}
      <div className="mt-8 print:hidden">
        <Link
          href={`/admin/staff-settlements?month=${formatYearMonth(year, month)}`}
          className="text-sm text-forest hover:underline"
        >
          ← 직원 정산 목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
