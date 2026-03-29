import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ExpiringActions } from "./expiring-actions";

export const dynamic = "force-dynamic";

const ZONE_LABEL: Record<string, string> = {
  CLASS_ROOM: "1강의실",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pick(params: PageProps["searchParams"], key: string): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getDDayBadge(days: number): { label: string; className: string } {
  if (days < 0) {
    return {
      label: `${Math.abs(days)}일 경과`,
      className:
        "inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200",
    };
  }
  if (days === 0) {
    return {
      label: "D-day",
      className:
        "inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200",
    };
  }
  if (days <= 3) {
    return {
      label: `D-${days}`,
      className:
        "inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 border border-red-100",
    };
  }
  if (days <= 7) {
    return {
      label: `D-${days}`,
      className:
        "inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-100",
    };
  }
  if (days <= 14) {
    return {
      label: `D-${days}`,
      className:
        "inline-flex rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 border border-yellow-100",
    };
  }
  return {
    label: `D-${days}`,
    className:
      "inline-flex rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200",
  };
}

function getStatusBadge(status: string): string {
  if (status === "EXPIRED")
    return "inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700";
  if (status === "ACTIVE")
    return "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700";
  return "inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600";
}

function getStatusLabel(status: string): string {
  if (status === "EXPIRED") return "만료";
  if (status === "ACTIVE") return "활성";
  if (status === "RETURNED") return "반납";
  if (status === "CANCELLED") return "취소";
  return status;
}

type TabKey = "week" | "month" | "overdue" | "all";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "week", label: "이번주 만료" },
  { key: "month", label: "이번달 만료" },
  { key: "overdue", label: "연체" },
  { key: "all", label: "전체" },
];

export default async function ExpiringLockersPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff30 = new Date(today);
  cutoff30.setDate(cutoff30.getDate() + 30);

  // End of current week (next Sunday)
  const dayOfWeek = today.getDay(); // 0=Sun
  const daysToEndOfWeek = 6 - dayOfWeek + (dayOfWeek === 0 ? 0 : 1); // days until Saturday
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 6 - dayOfWeek); // Saturday of this week

  // End of current month
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  // Active rentals with endDate within 30 days OR already overdue
  const rentals = await prisma.lockerRental.findMany({
    where: {
      status: { in: ["ACTIVE", "EXPIRED"] },
      endDate: { lte: cutoff30 },
    },
    include: {
      locker: {
        select: {
          id: true,
          zone: true,
          lockerNumber: true,
          row: true,
          col: true,
        },
      },
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { endDate: "asc" },
  });

  // Total active rentals (all, not just expiring)
  const totalActiveCount = await prisma.lockerRental.count({
    where: { status: "ACTIVE" },
  });

  // Compute stats
  const overdueRentals = rentals.filter(
    (r) => r.endDate && daysUntil(r.endDate) < 0,
  );
  const expiringSoonRentals = rentals.filter(
    (r) => r.endDate && daysUntil(r.endDate) >= 0,
  );
  const expiringThisWeek = expiringSoonRentals.filter((r) => {
    if (!r.endDate) return false;
    const days = daysUntil(r.endDate);
    return days >= 0 && r.endDate <= endOfWeek;
  });
  const expiringThisMonth = expiringSoonRentals.filter((r) => {
    if (!r.endDate) return false;
    return r.endDate <= endOfMonth;
  });

  const tabParam = pick(searchParams, "tab") as TabKey | undefined;
  const activeTab: TabKey =
    tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "all";

  function getTabRentals(tab: TabKey) {
    switch (tab) {
      case "week":
        return expiringThisWeek;
      case "month":
        return expiringThisMonth;
      case "overdue":
        return overdueRentals;
      case "all":
      default:
        return rentals;
    }
  }

  const displayRentals = getTabRentals(activeTab);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 만료 관리</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            대여 종료일이 임박하거나 이미 만료된 사물함을 관리합니다. 연장·반납 처리 또는 알림을 발송하세요.
          </p>
        </div>
        <Link
          href="/admin/lockers"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
        >
          ← 전체 사물함
        </Link>
      </div>

      {/* 4 KPI cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{expiringThisWeek.length}</p>
          <p className="mt-1 text-xs text-slate">이번주 만료</p>
        </div>
        <div className="rounded-[20px] border border-yellow-200 bg-yellow-50 p-5 text-center">
          <p className="text-2xl font-bold text-yellow-700">{expiringThisMonth.length}</p>
          <p className="mt-1 text-xs text-slate">이번달 만료</p>
        </div>
        <div className="rounded-[20px] border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl font-bold text-red-700">{overdueRentals.length}</p>
          <p className="mt-1 text-xs text-slate">연체(만료 지남)</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{totalActiveCount}</p>
          <p className="mt-1 text-xs text-slate">전체 활성</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-8 flex items-center gap-2 flex-wrap">
        {TABS.map((tab) => {
          const count =
            tab.key === "week"
              ? expiringThisWeek.length
              : tab.key === "month"
                ? expiringThisMonth.length
                : tab.key === "overdue"
                  ? overdueRentals.length
                  : rentals.length;
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/admin/lockers/expiring?tab=${tab.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-ember/30 bg-ember text-white"
                  : "border-ink/10 bg-white text-slate hover:border-amber-300 hover:text-amber-700"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="mt-6">
        {displayRentals.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
            해당 조건에 맞는 사물함이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[20px] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    사물함 번호
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    구역
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    만료일
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    D-day
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    상태
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                    처리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {displayRentals.map((rental) => {
                  const days = rental.endDate ? daysUntil(rental.endDate) : 0;
                  const ddayBadge = getDDayBadge(days);
                  return (
                    <tr
                      key={rental.id}
                      className="transition-colors hover:bg-mist/50"
                    >
                      <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-slate">
                        <Link
                          href={`/admin/students/${rental.student.examNumber}`}
                          className="hover:text-ember hover:underline"
                        >
                          {rental.student.examNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <Link
                          href={`/admin/students/${rental.student.examNumber}`}
                          className="font-medium text-ink hover:text-ember hover:underline"
                        >
                          {rental.student.name}
                        </Link>
                        {rental.student.phone && (
                          <p className="text-xs text-slate">{rental.student.phone}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap font-mono font-semibold text-ink">
                        <Link
                          href={`/admin/lockers/${rental.locker.id}`}
                          className="hover:text-ember hover:underline"
                        >
                          {rental.locker.lockerNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate">
                        {ZONE_LABEL[rental.locker.zone] ?? rental.locker.zone}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap font-mono text-xs">
                        {rental.endDate ? formatDate(rental.endDate) : "—"}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className={ddayBadge.className}>{ddayBadge.label}</span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className={getStatusBadge(rental.status)}>
                          {getStatusLabel(rental.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <ExpiringActions
                          rentalId={rental.id}
                          lockerNumber={rental.locker.lockerNumber}
                          studentName={rental.student.name}
                          examNumber={rental.student.examNumber}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
