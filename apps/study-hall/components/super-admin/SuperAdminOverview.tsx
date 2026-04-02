"use client";

import dynamic from "next/dynamic";
import NextLink from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarX,
  LoaderCircle,
  RefreshCcw,
  Siren,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";
import { toast } from "@/lib/sonner";

import type { DivisionOverviewSummary } from "@/lib/services/super-admin-overview.service";

type SuperAdminOverviewProps = {
  initialDivisions: DivisionOverviewSummary[];
};

const LazyAttendanceComparisonChart = dynamic(
  () =>
    import("@/components/super-admin/SuperAdminAttendanceComparisonChart").then(
      (mod) => mod.SuperAdminAttendanceComparisonChart,
    ),
  {
    ssr: false,
    loading: () => <div className="h-44 animate-pulse rounded-[10px] bg-slate-50" />,
  },
);

const LazyStudentTrendChart = dynamic(
  () =>
    import("@/components/super-admin/SuperAdminStudentTrendChart").then(
      (mod) => mod.SuperAdminStudentTrendChart,
    ),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-[10px] bg-slate-50" />,
  },
);

const LazyTuitionCard = dynamic(
  () =>
    import("@/components/super-admin/SuperAdminTuitionCard").then(
      (mod) => mod.SuperAdminTuitionCard,
    ),
  {
    ssr: false,
    loading: () => <div className="h-48 animate-pulse rounded-[10px] bg-slate-50" />,
  },
);

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  style?: CSSProperties;
};

function Link({ prefetch = false, ...rest }: LinkProps) {
  return <NextLink {...rest} prefetch={prefetch} />;
}

function CircularGauge({ rate }: { rate: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(rate, 100) / 100);
  const color = rate >= 90 ? "#16a34a" : rate >= 70 ? "#d97706" : "#dc2626";
  const trackColor = rate >= 90 ? "#dcfce7" : rate >= 70 ? "#fef3c7" : "#fee2e2";

  return (
    <svg viewBox="0 0 100 100" className="h-[100px] w-[100px] -rotate-90">
      <circle cx="50" cy="50" r={radius} fill="none" stroke={trackColor} strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function DivisionCard({ division }: { division: DivisionOverviewSummary }) {
  const attendanceEnabled = division.featureFlags.attendanceManagement;
  const studentManagementEnabled = division.featureFlags.studentManagement;
  const warningManagementEnabled = division.featureFlags.warningManagement;
  const staffManagementEnabled = division.featureFlags.staffManagement;
  const rateTextColor =
    !attendanceEnabled
      ? "text-slate-400"
      : division.attendanceRate >= 90
        ? "text-green-700"
        : division.attendanceRate >= 70
          ? "text-amber-700"
          : "text-red-700";

  return (
    <article
      className={`overflow-hidden rounded-[10px] border bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] ${
        division.isActive ? "border-black/5" : "border-black/5 opacity-50"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: division.color }}
          >
            {division.name.slice(0, 1)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">{division.name}</span>
              <span className="text-sm text-slate-400">·</span>
              <span className="text-sm text-slate-500">{division.fullName}</span>
            </div>
            <span className="text-xs text-slate-400">/{division.slug}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!division.isActive && (
            <span className="rounded-[10px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-400">
              비활성 지점
            </span>
          )}
          {attendanceEnabled && division.uncheckedPeriodCount > 0 && (
            <span className="rounded-[10px] bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
              미처리 {division.uncheckedPeriodCount}교시
            </span>
          )}
          <Link
            href={`/${division.slug}/admin`}
            className="flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-85"
            style={{ backgroundColor: division.color }}
          >
            관리자 입장
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="flex divide-x divide-slate-100">
        <div className="flex min-w-[220px] flex-col items-center justify-center gap-1.5 px-8 py-6">
          {attendanceEnabled ? (
            <>
              <div className="relative flex items-center justify-center">
                <CircularGauge rate={division.attendanceRate} />
                <div className="absolute flex flex-col items-center">
                  <span
                    className={`text-xl font-extrabold leading-none tabular-nums ${rateTextColor}`}
                  >
                    {division.attendanceRate}%
                  </span>
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-500">오늘 출결률</p>
              <p className="text-sm text-slate-400">
                {division.attendedCount} / {division.expectedCount}명
              </p>
            </>
          ) : (
            <>
              <div className="flex h-[100px] w-[100px] items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                비활성화
              </div>
              <p className="text-sm font-semibold text-slate-500">출결 관리</p>
              <p className="text-center text-sm text-slate-400">이 지점에서는 사용하지 않습니다.</p>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col divide-y divide-slate-100">
          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="px-6 py-5">
              <p className="text-sm font-medium text-slate-400">활성 학생</p>
              {studentManagementEnabled ? (
                <>
                  <p className="mt-2 text-4xl font-extrabold leading-none tabular-nums text-slate-900">
                    {division.activeStudentCount}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">전체 {division.studentCount}명 기준</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  학생 관리가 비활성화되었습니다.
                </p>
              )}
            </div>

            <div className="px-6 py-5">
              <p className="text-sm font-medium text-slate-400">경고 위험</p>
              {warningManagementEnabled ? (
                <>
                  <p
                    className={`mt-2 text-4xl font-extrabold leading-none tabular-nums ${
                      division.riskStudentCount > 0 ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {division.riskStudentCount}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">1차 경고 기준 이상</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  경고 관리가 비활성화되었습니다.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="px-6 py-5">
              <p className="text-sm font-medium text-slate-400">만료 임박</p>
              {studentManagementEnabled ? (
                <>
                  <p
                    className={`mt-2 text-4xl font-extrabold leading-none tabular-nums ${
                      division.expiringCount > 0 ? "text-orange-600" : "text-slate-900"
                    }`}
                  >
                    {division.expiringCount}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">만료 임박 학생</p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  학생 관리가 비활성화되었습니다.
                </p>
              )}
            </div>

            <div className="flex flex-col justify-between px-6 py-5">
              <p className="text-sm font-medium text-slate-400">직원 현황</p>
              {staffManagementEnabled ? (
                <>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Users className="h-4 w-4 text-slate-400" />
                        관리자
                      </span>
                      <span className="font-bold tabular-nums text-slate-900">
                        {division.adminCount}명
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <UserCheck className="h-4 w-4 text-slate-400" />
                        조교
                      </span>
                      <span className="font-bold tabular-nums text-slate-900">
                        {division.assistantCount}명
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/${division.slug}/admin/staff`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    직원 관리
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-400">
                  직원 관리가 비활성화되었습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

type IssueLevel = "critical" | "warning";

type Issue = {
  level: IssueLevel;
  divisionName: string;
  message: string;
  href: string;
};

function CriticalIssueBanner({ divisions }: { divisions: DivisionOverviewSummary[] }) {
  const issues: Issue[] = [];

  for (const division of divisions) {
    if (!division.isActive) {
      continue;
    }

    if (division.featureFlags.warningManagement && division.withdrawalRiskCount > 0) {
      issues.push({
        level: "critical",
        divisionName: division.name,
        message: `이탈 위험 학생 ${division.withdrawalRiskCount}명 (기준 벌점 초과)`,
        href: `/${division.slug}/admin/warnings`,
      });
    }

    if (division.featureFlags.studentManagement && division.urgentExpiringCount > 0) {
      issues.push({
        level: "critical",
        divisionName: division.name,
        message: `수강 종료 3일 이내 학생 ${division.urgentExpiringCount}명`,
        href: `/${division.slug}/admin/students`,
      });
    }

    if (division.featureFlags.attendanceManagement && division.uncheckedPeriodCount >= 3) {
      issues.push({
        level: "warning",
        divisionName: division.name,
        message: `오늘 미처리 교시 ${division.uncheckedPeriodCount}개`,
        href: `/${division.slug}/admin/attendance`,
      });
    }
  }

  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      {issues.map((issue, index) => (
        <Link
          key={`${issue.divisionName}-${issue.level}-${index}`}
          href={issue.href}
          className={`flex items-center justify-between gap-3 rounded-[10px] px-5 py-3.5 text-sm font-semibold transition hover:opacity-90 ${
            issue.level === "critical" ? "bg-red-600 text-white" : "bg-amber-500 text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Siren className="h-4 w-4 shrink-0" />
            <span className="opacity-75">[{issue.divisionName}]</span>
            {issue.message}
          </span>
          <span className="flex shrink-0 items-center gap-1 opacity-80">
            바로가기
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ))}
    </section>
  );
}

function AttendanceComparisonChart({ divisions }: { divisions: DivisionOverviewSummary[] }) {
  return <LazyAttendanceComparisonChart divisions={divisions} />;
}

function AggCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  isAlert,
}: {
  label: string;
  value: number;
  unit: string;
  sub: string;
  icon: LucideIcon;
  isAlert?: boolean;
}) {
  const alert = isAlert && value > 0;

  return (
    <div
      className={`flex items-center gap-4 rounded-[10px] border bg-white px-6 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] ${
        alert ? "border-red-200 bg-red-50" : "border-black/5"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] ${
          alert ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
        }`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p
          className={`mt-0.5 text-3xl font-extrabold leading-tight tabular-nums ${
            alert ? "text-red-700" : "text-slate-900"
          }`}
        >
          {value}
          <span className="ml-1 text-base font-semibold text-slate-400">{unit}</span>
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

export function SuperAdminOverview({ initialDivisions }: SuperAdminOverviewProps) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const refresh = useCallback(async (showToast = false) => {
    setIsRefreshing(true);

    try {
      const response = await fetch(
        `/api/super-admin/overview${showToast ? `?refresh=${Date.now()}` : ""}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "데이터를 불러오지 못했습니다.");
      }

      if (!mountedRef.current) {
        return;
      }

      setDivisions(data.divisions);
      setLastUpdatedAt(new Date().toISOString());

      if (showToast) {
        toast.success("전체 현황을 새로 불러왔습니다.");
      }
    } catch (error) {
      if (showToast) {
        toast.error(error instanceof Error ? error.message : "새로고침에 실패했습니다.");
      }
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setIsMounted(true);
    setLastUpdatedAt(new Date().toISOString());

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activeDivisions = divisions.filter((division) => division.isActive);
  const activeCount = activeDivisions.length;
  const studentManagedDivisionCount = activeDivisions.filter(
    (division) => division.featureFlags.studentManagement,
  ).length;
  const attendanceManagedDivisionCount = activeDivisions.filter(
    (division) => division.featureFlags.attendanceManagement,
  ).length;
  const warningManagedDivisionCount = activeDivisions.filter(
    (division) => division.featureFlags.warningManagement,
  ).length;
  const paymentManagedDivisionCount = activeDivisions.filter(
    (division) => division.featureFlags.paymentManagement,
  ).length;
  const totalStudents = activeDivisions.reduce((sum, division) => sum + division.studentCount, 0);
  const totalRisk = activeDivisions.reduce((sum, division) => sum + division.riskStudentCount, 0);
  const totalUnchecked = activeDivisions.reduce(
    (sum, division) => sum + division.uncheckedPeriodCount,
    0,
  );
  const totalExpiring = activeDivisions.reduce((sum, division) => sum + division.expiringCount, 0);

  const lastUpdatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(lastUpdatedAt))
    : "방금";

  return (
    <div className="space-y-6">
      <CriticalIssueBanner divisions={divisions} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-950">전체 지점 현황</h2>
          <p className="mt-1 text-sm text-slate-500">
            운영 중 {activeCount}개 지점 · 전체 {divisions.length}개 지점
            <span className="mx-2 text-slate-300">|</span>
            마지막 업데이트: {lastUpdatedLabel}
            {isRefreshing && (
              <span className="ml-2 inline-flex items-center gap-1 text-slate-400">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                갱신 중
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          새로고침
        </button>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AggCard
          label="전체 학생 수"
          value={totalStudents}
          unit="명"
          sub={`학생 관리 사용 지점 ${studentManagedDivisionCount}개`}
          icon={Users}
        />
        <AggCard
          label="미처리 교시"
          value={totalUnchecked}
          unit="교시"
          sub={`출결 관리 사용 지점 ${attendanceManagedDivisionCount}개`}
          icon={BookOpenCheck}
          isAlert
        />
        <AggCard
          label="경고 위험 학생"
          value={totalRisk}
          unit="명"
          sub={`경고 관리 사용 지점 ${warningManagedDivisionCount}개`}
          icon={AlertTriangle}
          isAlert
        />
        <AggCard
          label="만료 임박"
          value={totalExpiring}
          unit="명"
          sub={`학생 관리 사용 지점 ${studentManagedDivisionCount}개`}
          icon={CalendarX}
          isAlert
        />
      </section>

      {isMounted && paymentManagedDivisionCount > 0 ? (
        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            수납 현황
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">수납 현황 집계</h3>
          <p className="mt-1 text-sm text-slate-500">
            수납 관리가 켜진 지점의 이번 달 수납 현황입니다.
          </p>
          <div className="mt-5">
            <LazyTuitionCard />
          </div>
        </section>
      ) : null}

      {isMounted && attendanceManagedDivisionCount > 1 ? (
        <AttendanceComparisonChart divisions={divisions} />
      ) : null}

      {isMounted && studentManagedDivisionCount > 0 ? (
        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            학생 추이
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">최근 학생 수 추이</h3>
          <p className="mt-1 text-sm text-slate-500">
            학생 관리가 켜진 지점의 최근 8주 활성 학생 수입니다.
          </p>
          <div className="mt-4">
            <LazyStudentTrendChart />
          </div>
        </section>
      ) : null}

      <section>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          지점별 상세 현황
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          {divisions.map((division) => (
            <DivisionCard key={division.slug} division={division} />
          ))}
        </div>

        {divisions.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-slate-300 bg-white py-24 text-center text-base text-slate-400">
            등록된 지점이 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
