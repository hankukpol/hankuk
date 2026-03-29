import { AdminRole, LockerZone } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Zone display labels ────────────────────────────────────────────────────

const ZONE_LABEL: Record<LockerZone, string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_LEFT: "지덕 좌 (A구역)",
  JIDEOK_RIGHT: "지덕 우",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** Format as "YYYY년 M월" */
function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

/** Start of a given month (day=1, time=00:00:00) */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Start of next month */
function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function LockerAnalyticsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in30Days = new Date(today);
  in30Days.setDate(today.getDate() + 30);

  // ─── Fetch all lockers with active rentals ─────────────────────────────────

  const [lockers, allRentals] = await Promise.all([
    getPrisma().locker.findMany({
      select: { id: true, zone: true, status: true },
    }),
    getPrisma().lockerRental.findMany({
      where: { status: { in: ["ACTIVE", "RETURNED", "EXPIRED"] } },
      select: {
        id: true,
        lockerId: true,
        startDate: true,
        endDate: true,
        feeAmount: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  // ─── Overall stats ────────────────────────────────────────────────────────

  const totalLockers = lockers.length;
  const inUseCount = lockers.filter((l) => l.status === "IN_USE").length;
  const availableCount = lockers.filter((l) => l.status === "AVAILABLE").length;
  const occupancyRate =
    totalLockers > 0 ? Math.round((inUseCount / totalLockers) * 100) : 0;

  // ─── Expiring rentals (next 30 days) ──────────────────────────────────────

  const expiringCount = allRentals.filter((r) => {
    if (r.status !== "ACTIVE" || !r.endDate) return false;
    const end = new Date(r.endDate);
    return end >= today && end <= in30Days;
  }).length;

  // ─── Average rental duration (RETURNED rentals with both dates) ───────────

  const completedRentals = allRentals.filter(
    (r) => r.status === "RETURNED" && r.endDate != null,
  );

  let avgDurationDays: number | null = null;
  if (completedRentals.length > 0) {
    const totalDays = completedRentals.reduce((sum, r) => {
      const start = new Date(r.startDate).getTime();
      const end = new Date(r.endDate!).getTime();
      const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      return sum + days;
    }, 0);
    avgDurationDays = Math.round(totalDays / completedRentals.length);
  }

  // ─── Monthly revenue (last 6 months) ──────────────────────────────────────

  // Build array of last 6 months (oldest → newest)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(now), -(5 - i)));

  const monthlyRevenue: Array<{ label: string; amount: number }> = months.map((m) => {
    const mStart = startOfMonth(m);
    const mEnd = startOfNextMonth(m);

    // Count feeAmount for all rentals whose startDate falls in this month
    // (simple approximation: billing starts when rental is created)
    const amount = allRentals
      .filter((r) => {
        const start = new Date(r.startDate);
        return start >= mStart && start < mEnd;
      })
      .reduce((sum, r) => sum + r.feeAmount, 0);

    return { label: formatMonthLabel(m), amount };
  });

  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.amount), 1);

  // ─── Zone breakdown ────────────────────────────────────────────────────────

  const zones: LockerZone[] = ["CLASS_ROOM", "JIDEOK_LEFT", "JIDEOK_RIGHT"];

  const zoneStats = zones
    .map((zone) => {
      const zoneLockers = lockers.filter((l) => l.zone === zone);
      const total = zoneLockers.length;
      const inUse = zoneLockers.filter((l) => l.status === "IN_USE").length;
      const rate = total > 0 ? Math.round((inUse / total) * 100) : 0;
      return { zone, label: ZONE_LABEL[zone], total, inUse, rate };
    })
    .filter((z) => z.total > 0);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">사물함 분석</h1>
          <p className="mt-2 text-sm text-slate">사물함 점유율·수익·구역별 통계를 한눈에 확인합니다.</p>
        </div>
        <Link
          href="/admin/lockers"
          className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-slate hover:border-ink/40 hover:text-ink"
        >
          ← 사물함 관리로
        </Link>
      </div>

      {/* ─── Overview KPI cards ─────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="전체 사물함"
          value={String(totalLockers)}
          unit="개"
          tone="neutral"
        />
        <KpiCard
          label="사용 중"
          value={String(inUseCount)}
          unit="개"
          tone="ember"
        />
        <KpiCard
          label="공석"
          value={String(availableCount)}
          unit="개"
          tone="forest"
        />
        <KpiCard
          label="점유율"
          value={String(occupancyRate)}
          unit="%"
          tone={occupancyRate >= 80 ? "ember" : "neutral"}
        />
        <KpiCard
          label="30일 내 만료"
          value={String(expiringCount)}
          unit="건"
          tone={expiringCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Average rental duration */}
      <div className="mt-4">
        <div className="inline-flex items-center gap-3 rounded-[20px] border border-ink/10 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium text-slate">평균 대여 기간</p>
            <p className="mt-0.5 text-xl font-bold text-ink">
              {avgDurationDays != null ? (
                <>
                  {avgDurationDays}
                  <span className="ml-1 text-sm font-normal text-slate">일</span>
                </>
              ) : (
                <span className="text-sm font-normal text-slate">데이터 없음</span>
              )}
            </p>
          </div>
          <div className="ml-4 text-xs text-slate">
            (반납 완료 {completedRentals.length}건 기준)
          </div>
        </div>
      </div>

      {/* ─── Monthly revenue (last 6 months) ──────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">월별 대여 수납액 (최근 6개월)</h2>
        <p className="mt-1 text-xs text-slate">대여 시작월 기준 합산</p>

        <div className="mt-5 overflow-x-auto rounded-[20px] border border-ink/10 bg-white p-6">
          {monthlyRevenue.every((m) => m.amount === 0) ? (
            <p className="py-8 text-center text-sm text-slate">수납 데이터가 없습니다.</p>
          ) : (
            <div className="flex items-end gap-3" style={{ minWidth: "480px", height: "180px" }}>
              {monthlyRevenue.map((m) => {
                const barHeight = Math.max(4, Math.round((m.amount / maxRevenue) * 140));
                return (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-ink">
                      {m.amount > 0
                        ? m.amount >= 10000
                          ? `${Math.round(m.amount / 1000)}천`
                          : `${m.amount.toLocaleString()}`
                        : "0"}
                    </span>
                    <div
                      className="w-full rounded-t-[8px] bg-forest/70 transition-all"
                      style={{ height: `${barHeight}px` }}
                    />
                    <span className="text-center text-[10px] text-slate leading-tight">
                      {m.label.replace("년 ", "\n")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── Zone breakdown ────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">구역별 점유 현황</h2>

        {zoneStats.length === 0 ? (
          <p className="mt-4 text-sm text-slate">등록된 사물함이 없습니다.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {zoneStats.map((z) => (
              <div
                key={z.zone}
                className="rounded-[20px] border border-ink/10 bg-white px-6 py-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{z.label}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      전체 {z.total}개 · 사용 중 {z.inUse}개 · 공석 {z.total - z.inUse}개
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-2xl font-bold ${
                        z.rate >= 80
                          ? "text-ember"
                          : z.rate >= 50
                            ? "text-amber-600"
                            : "text-forest"
                      }`}
                    >
                      {z.rate}%
                    </p>
                    <p className="text-xs text-slate">점유율</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full transition-all ${
                      z.rate >= 80
                        ? "bg-ember"
                        : z.rate >= 50
                          ? "bg-amber-400"
                          : "bg-forest/70"
                    }`}
                    style={{ width: `${z.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Expiring rentals callout ──────────────────────────────────────── */}
      {expiringCount > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between rounded-[20px] border border-amber-200 bg-amber-50 px-6 py-5">
            <div>
              <p className="font-semibold text-amber-800">
                만료 임박 대여 {expiringCount}건
              </p>
              <p className="mt-0.5 text-sm text-amber-700">
                30일 이내 종료 예정입니다. 연장 또는 반납 처리를 확인하세요.
              </p>
            </div>
            <Link
              href="/admin/lockers/expiring"
              className="rounded-full border border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              만료 임박 목록
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type KpiTone = "neutral" | "ember" | "forest" | "warning";

const TONE_CLASSES: Record<KpiTone, { card: string; value: string }> = {
  neutral: { card: "border-ink/10 bg-white", value: "text-ink" },
  ember: { card: "border-ember/20 bg-ember/5", value: "text-ember" },
  forest: { card: "border-forest/20 bg-forest/5", value: "text-forest" },
  warning: { card: "border-amber-200 bg-amber-50", value: "text-amber-700" },
};

function KpiCard({
  label,
  value,
  unit,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: KpiTone;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-[20px] border px-5 py-4 ${t.card}`}>
      <p className="text-xs font-medium text-slate">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${t.value}`}>
        {value}
        <span className="ml-1 text-sm font-normal text-slate">{unit}</span>
      </p>
    </div>
  );
}
