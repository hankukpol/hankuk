import type { Metadata } from "next";
import Link from "next/link";
import { AdminRole, LockerStatus, LockerZone } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "사물함 배정 현황",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_LABEL: Record<LockerZone, string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

const STATUS_LABEL: Record<LockerStatus, string> = {
  AVAILABLE: "사용 가능",
  IN_USE: "사용 중",
  RESERVED: "예약됨",
  BROKEN: "고장",
  BLOCKED: "사용 불가",
};

// Color coding: green=available, amber=reserved, blue=in_use, red=broken/blocked
const STATUS_BADGE: Record<LockerStatus, string> = {
  AVAILABLE:
    "inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700",
  IN_USE:
    "inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700",
  RESERVED:
    "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700",
  BROKEN:
    "inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700",
  BLOCKED:
    "inline-flex rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        "inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700",
    };
  }
  if (days === 0) {
    return {
      label: "D-day",
      className:
        "inline-flex rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700",
    };
  }
  if (days <= 7) {
    return {
      label: `D-${days}`,
      className:
        "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700",
    };
  }
  if (days <= 14) {
    return {
      label: `D-${days}`,
      className:
        "inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-600",
    };
  }
  return {
    label: `D-${days}`,
    className:
      "inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold text-slate",
  };
}

// ─── CSV Export helper (server-safe) ─────────────────────────────────────────

function toCsvRow(cells: string[]): string {
  return cells
    .map((c) => {
      const s = String(c ?? "").replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    })
    .join(",");
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TabFilter = "all" | "in_use" | "expiring" | "available" | "broken";
type ZoneFilter = "all" | LockerZone;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pick(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchLockers() {
  const prisma = getPrisma();

  const lockers = await prisma.locker.findMany({
    include: {
      rentals: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        include: {
          student: {
            select: { name: true, examNumber: true },
          },
        },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ zone: "asc" }, { lockerNumber: "asc" }],
  });

  const now = new Date();
  const in14Days = new Date(now);
  in14Days.setDate(in14Days.getDate() + 14);

  return lockers.map((l) => {
    const activeRental = l.rentals[0] ?? null;
    const endDate = activeRental?.endDate ?? null;
    const days = endDate ? daysUntil(endDate) : null;
    const isExpiringSoon =
      l.status === LockerStatus.IN_USE &&
      endDate !== null &&
      days !== null &&
      days <= 14;

    return {
      id: l.id,
      zone: l.zone,
      lockerNumber: l.lockerNumber,
      status: l.status,
      note: l.note,
      student: activeRental?.student ?? null,
      endDate: endDate ? endDate.toISOString() : null,
      daysUntilExpiry: days,
      isExpiringSoon,
      rentalId: activeRental?.id ?? null,
    };
  });
}

type LockerRow = Awaited<ReturnType<typeof fetchLockers>>[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LockerAssignmentsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const resolvedParams = searchParams ? await searchParams : {};
  const tabParam = pick(resolvedParams, "tab") as TabFilter | undefined;
  const zoneParam = pick(resolvedParams, "zone") as ZoneFilter | undefined;
  const exportCsv = pick(resolvedParams, "export") === "csv";

  const activeTab: TabFilter =
    tabParam && ["all", "in_use", "expiring", "available", "broken"].includes(tabParam)
      ? tabParam
      : "all";

  const activeZone: ZoneFilter =
    zoneParam && ["all", "CLASS_ROOM", "JIDEOK_LEFT", "JIDEOK_RIGHT"].includes(zoneParam)
      ? zoneParam
      : "all";

  const allLockers = await fetchLockers();

  // Summary counts
  const totalCount = allLockers.length;
  const inUseCount = allLockers.filter((l) => l.status === LockerStatus.IN_USE).length;
  const availableCount = allLockers.filter(
    (l) => l.status === LockerStatus.AVAILABLE,
  ).length;
  const expiringCount = allLockers.filter((l) => l.isExpiringSoon).length;
  const brokenCount = allLockers.filter(
    (l) => l.status === LockerStatus.BROKEN || l.status === LockerStatus.BLOCKED,
  ).length;

  // Filter by tab
  function applyTabFilter(rows: LockerRow[]): LockerRow[] {
    switch (activeTab) {
      case "in_use":
        return rows.filter((l) => l.status === LockerStatus.IN_USE);
      case "expiring":
        return rows.filter((l) => l.isExpiringSoon);
      case "available":
        return rows.filter((l) => l.status === LockerStatus.AVAILABLE);
      case "broken":
        return rows.filter(
          (l) => l.status === LockerStatus.BROKEN || l.status === LockerStatus.BLOCKED,
        );
      default:
        return rows;
    }
  }

  // Filter by zone
  function applyZoneFilter(rows: LockerRow[]): LockerRow[] {
    if (activeZone === "all") return rows;
    return rows.filter((l) => l.zone === activeZone);
  }

  const filteredLockers = applyZoneFilter(applyTabFilter(allLockers));

  // CSV export
  if (exportCsv) {
    const csvHeader = toCsvRow([
      "구역",
      "번호",
      "상태",
      "학번",
      "이름",
      "만료일",
      "D-day",
      "비고",
    ]);
    const csvRows = filteredLockers.map((l) => {
      const days = l.daysUntilExpiry;
      const ddayStr =
        days === null
          ? ""
          : days < 0
          ? `${Math.abs(days)}일 경과`
          : days === 0
          ? "D-day"
          : `D-${days}`;
      return toCsvRow([
        ZONE_LABEL[l.zone],
        l.lockerNumber,
        STATUS_LABEL[l.status],
        l.student?.examNumber ?? "",
        l.student?.name ?? "",
        l.endDate ? formatDate(new Date(l.endDate)) : "",
        ddayStr,
        l.note ?? "",
      ]);
    });
    const csv = [csvHeader, ...csvRows].join("\n");

    const { NextResponse } = await import("next/server");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="locker-assignments-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    }) as unknown as React.ReactElement;
  }

  const TAB_LIST: Array<{ key: TabFilter; label: string; count: number }> = [
    { key: "all", label: "전체", count: totalCount },
    { key: "in_use", label: "사용중", count: inUseCount },
    { key: "expiring", label: "만료 임박 (14일 이내)", count: expiringCount },
    { key: "available", label: "사용 가능", count: availableCount },
    { key: "broken", label: "고장/불가", count: brokenCount },
  ];

  const ZONE_LIST: Array<{ key: ZoneFilter; label: string }> = [
    { key: "all", label: "전체 구역" },
    { key: "CLASS_ROOM", label: ZONE_LABEL.CLASS_ROOM },
    { key: "JIDEOK_LEFT", label: ZONE_LABEL.JIDEOK_LEFT },
    { key: "JIDEOK_RIGHT", label: ZONE_LABEL.JIDEOK_RIGHT },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">사물함 배정 현황</h1>
          <p className="mt-2 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            전체 사물함의 배정 현황을 한눈에 확인하고, 사용 가능한 사물함에 학생을 배정합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/lockers/assignments?tab=${activeTab}&zone=${activeZone}&export=csv`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-slate transition hover:border-forest/40 hover:text-forest"
          >
            CSV 내보내기
          </Link>
          <Link
            href="/admin/lockers/expiring"
            className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
          >
            만료 임박 관리
          </Link>
          <Link
            href="/admin/lockers"
            className="inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
          >
            ← 사물함 전체 보기
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="text-2xl font-bold text-ink">{totalCount}</p>
          <p className="mt-1 text-xs text-slate">전체</p>
        </div>
        <div className="rounded-[20px] border border-blue-200 bg-blue-50 p-5 text-center">
          <p className="text-2xl font-bold text-blue-700">{inUseCount}</p>
          <p className="mt-1 text-xs text-slate">사용중</p>
        </div>
        <div className="rounded-[20px] border border-green-200 bg-green-50 p-5 text-center">
          <p className="text-2xl font-bold text-green-700">{availableCount}</p>
          <p className="mt-1 text-xs text-slate">사용 가능</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl font-bold text-amber-700">{expiringCount}</p>
          <p className="mt-1 text-xs text-slate">만료 임박</p>
        </div>
      </div>

      {/* Zone tabs */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate">
          구역:
        </span>
        {ZONE_LIST.map((z) => {
          const isActive = activeZone === z.key;
          return (
            <Link
              key={z.key}
              href={`/admin/lockers/assignments?tab=${activeTab}&zone=${z.key}`}
              className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "border-forest/40 bg-forest text-white"
                  : "border-ink/10 bg-white text-slate hover:border-forest/30 hover:text-forest"
              }`}
            >
              {z.label}
            </Link>
          );
        })}
      </div>

      {/* Status filter tabs */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate">
          상태:
        </span>
        {TAB_LIST.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/admin/lockers/assignments?tab=${tab.key}&zone=${activeZone}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "border-ember/30 bg-ember text-white"
                  : "border-ink/10 bg-white text-slate hover:border-ember/30 hover:text-ember"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-ink/10 text-slate"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="mt-6">
        {filteredLockers.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 py-16 text-center text-sm text-slate">
            해당 조건에 맞는 사물함이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-ink/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      번호
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      구역
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      상태
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      학번
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      학생 이름
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      만료일
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      D-day
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      비고
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      처리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5 bg-white">
                  {filteredLockers.map((locker) => {
                    const ddayBadge =
                      locker.daysUntilExpiry !== null
                        ? getDDayBadge(locker.daysUntilExpiry)
                        : null;

                    // Row highlight for expiring soon
                    const rowHighlight = locker.isExpiringSoon
                      ? "bg-amber-50/40"
                      : locker.status === LockerStatus.BROKEN ||
                          locker.status === LockerStatus.BLOCKED
                        ? "bg-red-50/30"
                        : "";

                    return (
                      <tr
                        key={locker.id}
                        className={`transition-colors hover:bg-mist/50 ${rowHighlight}`}
                      >
                        {/* Locker number */}
                        <td className="px-5 py-3 font-mono font-semibold text-ink">
                          <Link
                            href={`/admin/lockers/${locker.id}`}
                            className="hover:text-ember hover:underline"
                          >
                            {locker.lockerNumber}
                          </Link>
                        </td>

                        {/* Zone */}
                        <td className="whitespace-nowrap px-5 py-3 text-slate">
                          {ZONE_LABEL[locker.zone]}
                        </td>

                        {/* Status badge */}
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={STATUS_BADGE[locker.status]}>
                            {STATUS_LABEL[locker.status]}
                          </span>
                        </td>

                        {/* Student exam number */}
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">
                          {locker.student ? (
                            <Link
                              href={`/admin/students/${locker.student.examNumber}`}
                              className="hover:text-ember hover:underline"
                            >
                              {locker.student.examNumber}
                            </Link>
                          ) : (
                            <span className="text-ink/30">—</span>
                          )}
                        </td>

                        {/* Student name */}
                        <td className="whitespace-nowrap px-5 py-3">
                          {locker.student ? (
                            <Link
                              href={`/admin/students/${locker.student.examNumber}`}
                              className="font-medium text-ink hover:text-ember hover:underline"
                            >
                              {locker.student.name}
                            </Link>
                          ) : (
                            <span className="text-ink/30">—</span>
                          )}
                        </td>

                        {/* Expiry date */}
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate">
                          {locker.endDate ? formatDate(new Date(locker.endDate)) : "—"}
                        </td>

                        {/* D-day badge */}
                        <td className="whitespace-nowrap px-5 py-3">
                          {ddayBadge ? (
                            <span className={ddayBadge.className}>{ddayBadge.label}</span>
                          ) : (
                            <span className="text-ink/30">—</span>
                          )}
                        </td>

                        {/* Note */}
                        <td className="max-w-[160px] truncate px-5 py-3 text-xs text-slate">
                          {locker.note ?? "—"}
                        </td>

                        {/* Action */}
                        <td className="whitespace-nowrap px-5 py-3">
                          {locker.status === LockerStatus.AVAILABLE ? (
                            <Link
                              href={`/admin/lockers/${locker.id}`}
                              className="inline-flex items-center rounded-full border border-forest/30 bg-forest/5 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                            >
                              배정하기
                            </Link>
                          ) : locker.status === LockerStatus.IN_USE ? (
                            <Link
                              href={`/admin/lockers/${locker.id}`}
                              className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                            >
                              상세보기
                            </Link>
                          ) : (
                            <Link
                              href={`/admin/lockers/${locker.id}`}
                              className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
                            >
                              상세보기
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-4 px-1 text-xs text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-green-200 bg-green-50" />
          사용 가능
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-blue-200 bg-blue-50" />
          사용 중
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-amber-200 bg-amber-50" />
          예약됨
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-red-200 bg-red-50" />
          고장 / 사용 불가
        </span>
      </div>

      {/* Results count */}
      <p className="mt-4 text-xs text-slate">
        {filteredLockers.length}개 표시 (전체 {totalCount}개)
      </p>
    </div>
  );
}
