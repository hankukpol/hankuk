"use client";

import NextLink from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarX,
  ClipboardCheck,
  Copy,
  CreditCard,
  LoaderCircle,
  MapPin,
  Phone,
  RefreshCcw,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  playNotificationBeep,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  type NotificationPermissionState,
} from "@/lib/browser-notify";
import { toast } from "@/lib/sonner";

import { WarningStageBadge } from "@/components/students/StudentBadges";
import type { DivisionFeatureKey } from "@/lib/division-features";
import { formatPaymentMethod } from "@/lib/payment-meta";
import type { AdminDashboardData } from "@/lib/services/admin-dashboard.service";

type AdminDashboardProps = {
  divisionSlug: string;
  initialData: AdminDashboardData;
};

type SummaryCard = {
  title: string;
  value: string;
  unit: string;
  description: string;
  subtext: string;
  icon: React.ElementType;
  gauge: boolean;
  featureKey?: DivisionFeatureKey;
};

type ActionCard = {
  title: string;
  value: string;
  description: string;
  note: string;
  href: string;
  cta: string;
  icon: React.ElementType;
  iconClass: string;
  badgeClass: string;
  borderClass: string;
  featureKey?: DivisionFeatureKey;
};

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  style?: CSSProperties;
};

function Link({ prefetch = false, ...rest }: LinkProps) {
  return <NextLink {...rest} prefetch={prefetch} />;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

const LEAVE_TYPE_LABEL: Record<string, string> = {
  HOLIDAY: "휴가",
  HALF_DAY: "반차",
  HEALTH: "병가",
  OUTING: "외출",
};

const LEAVE_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "대기", cls: "bg-slate-100 text-slate-600" },
  APPROVED: { label: "승인", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "승인 취소", cls: "bg-slate-100 text-slate-600" },
  USED: { label: "사용됨", cls: "bg-slate-100 text-slate-500" },
};

function formatDelta(value: number) {
  if (value === 0) return "전일과 동일";
  return value > 0 ? `전일 대비 +${value}%p` : `전일 대비 ${value}%p`;
}

function formatPointValue(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function timeToSec(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 3600 + m * 60;
}

type PeriodInfo =
  | { type: "STUDYING"; periodName: string; remainingMin: number; remainingSec: number; progressPercent: number; startTime: string; endTime: string }
  | { type: "BREAK"; nextPeriodName: string; remainingMin: number; remainingSec: number; progressPercent: number; totalBreakMin: number }
  | { type: "END" }
  | { type: "BEFORE"; nextPeriodName: string; remainingMin: number; remainingSec: number };


function getCurrentPeriodInfo(
  schedules: AdminDashboardData["periodSchedules"],
  now: Date,
): PeriodInfo {
  const totalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const timeStr = now.toTimeString().slice(0, 5);

  const current = schedules.find((p) => p.startTime <= timeStr && timeStr < p.endTime);
  if (current) {
    const startSec = timeToSec(current.startTime);
    const endSec = timeToSec(current.endTime);
    const remaining = Math.max(0, endSec - totalSec);
    const elapsed = Math.max(0, totalSec - startSec);
    const total = endSec - startSec;
    return {
      type: "STUDYING",
      periodName: current.periodName,
      remainingMin: Math.floor(remaining / 60),
      remainingSec: remaining % 60,
      progressPercent: total > 0 ? Math.min(100, (elapsed / total) * 100) : 0,
      startTime: current.startTime,
      endTime: current.endTime,
    };
  }

  const next = schedules.find((p) => p.startTime > timeStr);
  if (next) {
    const nextStartSec = timeToSec(next.startTime);
    const remaining = Math.max(0, nextStartSec - totalSec);
    const prev = [...schedules].reverse().find((p) => p.endTime <= timeStr);
    if (prev) {
      const breakStartSec = timeToSec(prev.endTime);
      const breakTotal = nextStartSec - breakStartSec;
      const breakElapsed = Math.max(0, totalSec - breakStartSec);
      return {
        type: "BREAK",
        nextPeriodName: next.periodName,
        remainingMin: Math.floor(remaining / 60),
        remainingSec: remaining % 60,
        progressPercent: breakTotal > 0 ? Math.min(100, (breakElapsed / breakTotal) * 100) : 0,
        totalBreakMin: Math.round(breakTotal / 60),
      };
    }
    return {
      type: "BEFORE",
      nextPeriodName: next.periodName,
      remainingMin: Math.floor(remaining / 60),
      remainingSec: remaining % 60,
    };
  }
  return { type: "END" };
}


function getPeriodStateKey(info: PeriodInfo) {
  switch (info.type) {
    case "STUDYING":
      return `STUDYING:${info.periodName}:${info.startTime}:${info.endTime}`;
    case "BREAK":
      return `BREAK:${info.nextPeriodName}`;
    case "BEFORE":
      return `BEFORE:${info.nextPeriodName}`;
    default:
      return info.type;
  }
}

function getPeriodTransitionMessage(info: PeriodInfo) {
  switch (info.type) {
    case "STUDYING":
      return `${info.periodName} 자습이 시작되었습니다.`;
    case "BREAK":
      return info.totalBreakMin >= 30 ? "식사 시간이 시작되었습니다." : "쉬는 시간이 시작되었습니다.";
    case "END":
      return "오늘 자습이 모두 종료되었습니다.";
    default:
      return null;
  }
}

// ─── SVG 원형 게이지 ──────────────────────────────────────────────────────────

function CircularGauge({ rate }: { rate: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(rate, 100) / 100);
  const color = rate >= 90 ? "var(--admin-success)" : rate >= 75 ? "var(--admin-warning)" : "var(--admin-danger)";

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--admin-grid)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ─── 타이머 위젯 (풀 너비 카드) ──────────────────────────────────────────────

function PeriodTimerWidget({
  schedules,
}: {
  schedules: AdminDashboardData["periodSchedules"];
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("unsupported");
  const prevStateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    const updateNow = () => setNow(new Date());
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!now || schedules.length === 0) return;
    const info = getCurrentPeriodInfo(schedules, now);
    const nextStateKey = getPeriodStateKey(info);
    const prevStateKey = prevStateKeyRef.current;

    if (prevStateKey !== null && prevStateKey !== nextStateKey) {
      const message = getPeriodTransitionMessage(info);

      if (message) {
        playNotificationBeep();
        showBrowserNotification("시간통제 자습반", message);
      }
    }

    prevStateKeyRef.current = nextStateKey;
  }, [now, schedules]);

  async function handleEnableNotifications() {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      toast.success("브라우저 알림이 허용되었습니다.");
      return;
    }

    if (permission === "denied") {
      toast.error("브라우저 알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.");
      return;
    }

    if (permission === "unsupported") {
      toast.error("이 브라우저에서는 알림을 지원하지 않습니다.");
    }
  }

  if (!now || schedules.length === 0) return null;

  const info = getCurrentPeriodInfo(schedules, now);

  if (info.type === "END") return null;

  // DESIGN.md 1절: 값의 색으로 상태를 전달하되 읽을 수 있는 상태 문구도 함께 둔다.
  // 장식용 색면 대신 상태 점과 문구로만 구분한다.
  const statusDotClass =
    info.type === "STUDYING"
      ? "bg-attend-present"
      : info.type === "BREAK"
        ? "bg-attend-tardy"
        : "bg-attend-excused";

  const isMealBreak = info.type === "BREAK" && info.totalBreakMin >= 30;

  const statusLabel =
    info.type === "STUDYING"
      ? `${info.periodName} 자습 중`
      : info.type === "BREAK"
        ? isMealBreak ? "식사 시간" : "쉬는 시간"
        : "자습 시작 전";

  const subLabel =
    info.type === "BREAK"
      ? `${info.nextPeriodName} 시작 전`
      : info.type === "BEFORE"
        ? `${info.nextPeriodName} 시작 전`
        : null;

  const remainingMin = "remainingMin" in info ? info.remainingMin : 0;
  const remainingSec = "remainingSec" in info ? info.remainingSec : 0;
  const progressPercent = "progressPercent" in info ? info.progressPercent : 0;
  const timeDisplay = `${String(remainingMin).padStart(2, "0")}:${String(remainingSec).padStart(2, "0")}`;

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} aria-hidden />
          <h2 className="admin-section-title truncate">{statusLabel}</h2>
          {subLabel ? (
            <span className="truncate text-[13px] text-admin-text-muted">{subLabel}</span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-[13px] font-semibold text-admin-text-muted">남은 시간</span>
          <span className="text-[32px] font-bold leading-none tabular-nums">
            {timeDisplay}
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        {(info.type === "STUDYING" || info.type === "BREAK") && (
          <>
            <div className="relative h-2 w-full overflow-hidden rounded-lg bg-admin-surface-muted">
              <div
                className="h-full rounded-lg bg-admin-accent transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px] text-admin-text-muted">
              {info.type === "STUDYING" ? (
                <>
                  <span>{info.startTime} 시작</span>
                  <span className="font-semibold text-admin-text">
                    {Math.round(progressPercent)}% 경과
                  </span>
                  <span>{info.endTime} 종료</span>
                </>
              ) : (
                <>
                  <span>{isMealBreak ? "식사 시간 중" : "쉬는 시간 중"}</span>
                  <span className="font-semibold text-admin-text">
                    {Math.round(progressPercent)}% 경과
                  </span>
                  <span>{info.nextPeriodName} 시작까지</span>
                </>
              )}
            </div>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {notificationPermission === "default" ? (
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="admin-button admin-button-compact"
            >
              브라우저 알림 허용
            </button>
          ) : notificationPermission === "granted" ? (
            <span className="admin-badge">브라우저 알림 사용 중</span>
          ) : notificationPermission === "denied" ? (
            <span className="admin-badge">브라우저 알림 차단됨</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export function AdminDashboard({ divisionSlug, initialData }: AdminDashboardProps) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    setData(initialData);
    setLastUpdatedAt(new Date().toISOString());
  }, [initialData]);

  const refreshDashboard = useCallback(
    async (showToast: boolean) => {
      setIsRefreshing(true);
      try {
        const response = await fetch(
          `/api/${divisionSlug}/dashboard${showToast ? `?refresh=${Date.now()}` : ""}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "대시보드 데이터를 불러오지 못했습니다.");
        if (!mountedRef.current) return;
        setData(payload.data);
        setLastUpdatedAt(new Date().toISOString());
        if (showToast) toast.success("대시보드를 새로고침했습니다.");
      } catch (error) {
        if (showToast) {
          toast.error(
            error instanceof Error ? error.message : "대시보드 데이터를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (mountedRef.current) setIsRefreshing(false);
      }
    },
    [divisionSlug],
  );

  useEffect(() => {
    mountedRef.current = true;
    setLastUpdatedAt(new Date().toISOString());
    void refreshDashboard(false);
    return () => {
      mountedRef.current = false;
    };
  }, [refreshDashboard]);

  async function copyPhone(value: string | null) {
    if (!value) {
      toast.error("등록된 연락처가 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("연락처를 복사했습니다.");
    } catch {
      toast.error("연락처 복사에 실패했습니다.");
    }
  }

  const rate = data.summary.attendanceRate;
  const featureFlags = data.featureFlags;
  const leaveManagementEnabled = featureFlags.leaveManagement;
  const interviewManagementEnabled = featureFlags.interviewManagement;

  const summaryCards = useMemo(
    (): SummaryCard[] => [
      {
        title: "오늘 출석률",
        value: `${rate}`,
        unit: "%",
        description: `${data.summary.attendedCount} / ${data.summary.expectedCount} 교시`,
        subtext: formatDelta(data.summary.deltaFromYesterday),
        icon: BookOpenCheck,
        gauge: true,
        featureKey: "attendanceManagement",
      },
      {
        title: "현재 학생",
        value: `${data.studentOverview.activeCount}`,
        unit: "명",
        description: "활성 재실 중",
        subtext: `휴가 ${data.studentOverview.onLeaveCount}명 포함`,
        icon: Users,
        gauge: false,
        featureKey: "studentManagement",
      },
      {
        title: "이번 주 지각/결석",
        value: `${data.summary.weeklyTardyAbsentCount}`,
        unit: "건",
        description: `지각 ${data.summary.weeklyTardyCount} / 결석 ${data.summary.weeklyAbsentCount}`,
        subtext: "월요일부터 오늘까지",
        icon: TrendingUp,
        gauge: false,
        featureKey: "attendanceManagement",
      },
      {
        title: "이번 달 수납",
        value: data.paymentStats.thisMonthTotal.toLocaleString("ko-KR"),
        unit: "원",
        description: "총 납부 건수",
        subtext: `${data.paymentStats.thisMonthCount}건`,
        icon: CreditCard,
        gauge: false,
        featureKey: "paymentManagement",
      },
    ],
    [data, rate],
  );

  const actionCards = useMemo((): ActionCard[] => {
    const expiringSoonCount = data.expiringStudents.filter((student) => student.daysRemaining <= 7).length;
    const attentionLead = data.attentionStudents[0];
    const riskLead = data.riskStudents[0];
    const expiringLead = data.expiringStudents[0];
    const followUps = data.followUpInterviews ?? [];
    const followUpLead = followUps[0];

    return [
      {
        title: "출결 체크",
        value: `${data.summary.uncheckedPeriodCount}개`,
        description:
          data.summary.uncheckedPeriodCount > 0
            ? "필수 교시 출결 입력이 남아 있습니다."
            : "오늘 필수 교시는 모두 처리되었습니다.",
        note: "출석부에서 바로 확인",
        href: `/${divisionSlug}/admin/attendance`,
        cta: "출석부로 이동",
        icon: CalendarClock,
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass:
          data.summary.uncheckedPeriodCount > 0
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600",
        borderClass: data.summary.uncheckedPeriodCount > 0 ? "border-amber-100" : "border-admin-line",
        featureKey: "attendanceManagement",
      },
      {
        title: "반복 지각 · 결석",
        value: `${data.attentionStudents.length}명`,
        description:
          data.attentionStudents.length > 0
            ? `${attentionLead?.studentName}${data.attentionStudents.length > 1 ? ` 외 ${data.attentionStudents.length - 1}명` : ""} 확인 필요`
            : "최근 7일 기준 반복 지각/결석이 없습니다.",
        note: "최근 7일 기준",
        href: `/${divisionSlug}/admin/attendance`,
        cta: "출결 현황 보기",
        icon: AlertTriangle,
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass:
          data.attentionStudents.length > 0
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600",
        borderClass: data.attentionStudents.length > 0 ? "border-amber-100" : "border-admin-line",
        featureKey: "attendanceManagement",
      },
      {
        title: "경고 위험 학생",
        value: `${data.summary.riskStudentCount}명`,
        description:
          data.summary.riskStudentCount > 0
            ? `${riskLead?.name}${data.summary.riskStudentCount > 1 ? ` 외 ${data.summary.riskStudentCount - 1}명` : ""}이 경고 기준에 도달했습니다.`
            : "1차 경고 기준 이상 학생이 없습니다.",
        note: "경고 대상 바로 확인",
        href: `/${divisionSlug}/admin/warnings`,
        cta: "경고 관리로 이동",
        icon: Phone,
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass:
          data.summary.riskStudentCount > 0
            ? "bg-rose-50 text-rose-700"
            : "bg-slate-100 text-slate-600",
        borderClass: data.summary.riskStudentCount > 0 ? "border-rose-100" : "border-admin-line",
        featureKey: "warningManagement",
      },
      {
        title: "면담 후속 확인",
        value: `${followUps.length}건`,
        description:
          followUps.length > 0
            ? `${followUpLead?.studentName}${followUps.length > 1 ? ` 외 ${followUps.length - 1}건` : ""}의 후속 확인 예정일이 지났습니다.`
            : "확인해야 할 후속 조치가 없습니다.",
        note: "면담 시 남긴 후속 확인 예정일 기준",
        href: `/${divisionSlug}/admin/interviews`,
        cta: "면담 기록으로 이동",
        icon: ClipboardCheck,
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass:
          followUps.length > 0
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600",
        borderClass: followUps.length > 0 ? "border-amber-100" : "border-admin-line",
        featureKey: "interviewManagement",
      },
      {
        title: "수강 만료 임박",
        value: `${data.expiringStudents.length}명`,
        description:
          data.expiringStudents.length > 0
            ? `${expiringLead?.name}${data.expiringStudents.length > 1 ? ` 외 ${data.expiringStudents.length - 1}명` : ""}의 수강 종료 일정을 확인해야 합니다.`
            : "만료 임박 학생이 없습니다.",
        note: expiringSoonCount > 0 ? `7일 이내 ${expiringSoonCount}명` : `${data.expirationWarningDays}일 이내 기준`,
        href: `/${divisionSlug}/admin/students`,
        cta: "학생 관리로 이동",
        icon: CalendarX,
        iconClass: "bg-slate-100 text-slate-600",
        badgeClass:
          data.expiringStudents.length > 0
            ? "bg-rose-50 text-rose-700"
            : "bg-slate-100 text-slate-600",
        borderClass: data.expiringStudents.length > 0 ? "border-rose-100" : "border-admin-line",
        featureKey: "studentManagement",
      },
    ];
  }, [data, divisionSlug]);

  const attentionPreview = data.attentionStudents.slice(0, 5);
  const riskPreview = data.riskStudents.slice(0, 5);
  const expiringPreview = data.expiringStudents.slice(0, 5);
  const newStudentsPreview = data.newStudents.slice(0, 5);
  const recentPointPreview = data.recentPoints.slice(0, 5);
  const recentPaymentPreview = data.paymentStats.recentPayments.slice(0, 5);
  const visibleSummaryCards = summaryCards.filter(
    (card) => !card.featureKey || featureFlags[card.featureKey],
  );
  const visibleActionCards = actionCards.filter(
    (card) => !card.featureKey || featureFlags[card.featureKey],
  );
  const lastUpdatedLabel = lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : "방금";

  return (
    <div className="admin-flat-page">
      {/* 제목 · 주요 작업 */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="admin-page-title">{data.division.name} 운영 현황</h1>
          <p className="admin-page-description">
            {data.summary.todayDate} 기준
            {data.summary.uncheckedPeriodCount > 0
              ? ` · ${data.summary.uncheckedPeriodCount}개 교시가 아직 미처리 상태입니다.`
              : " · 오늘 필수 교시는 모두 처리되었습니다."}
            {` · 마지막 업데이트 ${lastUpdatedLabel}`}
            {isRefreshing ? " · 갱신 중" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshDashboard(true)}
            disabled={isRefreshing}
            className="admin-button"
          >
            {isRefreshing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            새로고침
          </button>

          <Link
            href={`/${divisionSlug}/admin/seats`}
            className="admin-button"
          >
            좌석 현황
            <MapPin className="h-4 w-4" />
          </Link>

          <Link
            href={`/${divisionSlug}/admin/attendance`}
            className={`admin-button admin-button-primary ${ featureFlags.attendanceManagement ? "" : "hidden" }`}
          >
            출석부로 이동
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* 교시 타이머 */}
      <PeriodTimerWidget schedules={data.periodSchedules} />

      {/* 시험 일정 D-Day */}
      {featureFlags.examScheduleManagement && data.upcomingExamSchedules.length > 0 && (
        <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">시험 일정</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/settings/exam-schedules`}
              className="admin-button"
            >
              일정 관리
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.upcomingExamSchedules.map((exam) => (
              <div
                key={exam.id}
                className="admin-panel-row"
              >
                <span
                  className={`inline-block rounded-lg px-3 py-1 text-sm font-extrabold ${ exam.dDayValue === 0 ? "bg-red-100 text-red-600" : exam.dDayValue < 0 ? "bg-slate-200 text-slate-500" : "bg-blue-50 text-blue-600" }`}
                >
                  {exam.dDayLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-bold text-slate-900">{exam.name}</p>
                  <p className="admin-help mt-1">{exam.examDate}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 핵심 지표 */}
      <section className="admin-dashboard-metrics">
        {visibleSummaryCards.map((card) => {

          return (
            <article
              key={card.title}
              className="admin-dashboard-metric min-w-0"
            >
              <div className="flex items-start justify-between">
                {card.gauge && (
                  <div className="relative flex items-center justify-center">
                    <CircularGauge rate={rate} />
                    <span className="absolute text-xs font-bold text-slate-700">
                      {rate}%
                    </span>
                  </div>
                )}
              </div>
              <p className="admin-dashboard-metric-label mt-4">{card.title}</p>
              <p className="admin-dashboard-metric-value break-words">{card.value}<span className="admin-dashboard-metric-unit">{card.unit}</span></p>
              <p className="admin-help mt-3">{card.description}</p>
              <p className="admin-help mt-1">{card.subtext}</p>
            </article>
          );
        })}
      </section>

      {/* 오늘 처리할 일 */}
      <section className="admin-section">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="admin-section-title">오늘 처리할 일</h2>
            <p className="admin-help mt-2">
              바로 움직여야 하는 항목만 먼저 모았습니다.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleActionCards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.title}
                href={card.href}
                className={`admin-action-card group rounded-lg border ${card.borderClass} bg-white p-5 transition hover:bg-admin-surface-soft`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${card.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${card.badgeClass}`}>
                    {card.value}
                  </span>
                </div>

                <p className="mt-4 text-base font-bold text-slate-950">{card.title}</p>
                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="admin-help">{card.note}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 transition group-hover:text-slate-950">
                    {card.cta}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* 교시별 출결 현황 */}
        <section
          className={`admin-section h-full ${ featureFlags.attendanceManagement ? "" : "hidden" }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="admin-section-title">교시별 출결 현황</h2>
            </div>
            <Link
              href={`/${divisionSlug}/admin/attendance`}
              className="text-xs font-medium text-slate-400 transition hover:text-slate-700"
            >
              출석부 →
            </Link>
          </div>

          <div className="mt-3 flex flex-1 flex-col">
            {data.periodRows.map((row) => (
              <div key={row.periodId} className="flex min-h-[60px] flex-1 items-center gap-3 py-3 md:min-h-[68px]">
                <div className="w-[88px] shrink-0">
                  <p className="text-sm font-semibold text-slate-900">{row.periodName}</p>
                  {row.label && <p className="text-[13px] text-slate-400">{row.label}</p>}
                </div>

                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="font-medium text-emerald-600">출 {row.counts.present}</span>
                      <span className="font-medium text-amber-600">지 {row.counts.tardy}</span>
                      <span className="font-medium text-rose-600">결 {row.counts.absent}</span>
                      {row.counts.unprocessed > 0 && (
                        <span className="text-slate-400">미 {row.counts.unprocessed}</span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-slate-900">{row.attendanceRate}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${ row.attendanceRate >= 90 ? "bg-emerald-400" : row.attendanceRate >= 75 ? "bg-amber-400" : "bg-rose-400" }`}
                      style={{ width: `${row.attendanceRate}%` }}
                    />
                  </div>
                </div>

                {row.isUnchecked ? (
                  <Link
                    href={`/${divisionSlug}/admin/attendance`}
                    className="admin-button shrink-0"
                  >
                    체크
                  </Link>
                ) : (
                  <div className="w-[38px] shrink-0" />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          {/* 반복 지각/결석 */}
          <section
            className={`admin-section ${ featureFlags.attendanceManagement ? "" : "hidden" }`}
          >
            <div className="flex items-center gap-2.5">
              <h2 className="admin-section-title">반복 지각 · 결석</h2>
              <div className="ml-auto flex items-center gap-2">
                {attentionPreview.length > 0 && (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                    {data.attentionStudents.length}명
                  </span>
                )}
                <Link
                  href={`/${divisionSlug}/admin/attendance`}
                  className="text-xs font-medium text-slate-400 transition hover:text-slate-700"
                >
                  출결 현황 →
                </Link>
              </div>
            </div>

            <div className="mt-3">
              {attentionPreview.length > 0 ? (
                <div>
                  {attentionPreview.map((student) => (
                    <div
                      key={`${student.type}-${student.studentId}`}
                      className="admin-panel-row"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {featureFlags.studentManagement ? (
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.studentId}`}
                              className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                            >
                              {student.studentName}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-slate-900">
                              {student.studentName}
                            </span>
                          )}
                          <span className="admin-help">{student.studentNumber}</span>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[13px] font-semibold ${ student.type === "ABSENT" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600" }`}
                          >
                            {student.type === "ABSENT" ? "결석 반복" : "지각 반복"}
                          </span>
                        </div>
                        <p className="admin-help mt-0.5">
                          {student.message} · {student.seatLabel || "좌석 미배정"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyPhone(student.phone)}
                        className="admin-button admin-icon-button shrink-0"
                        title="연락처 복사"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-help py-4 text-center">
                  최근 7일 기준 반복 지각/결석 학생이 없습니다.
                </p>
              )}
            </div>
          </section>

          {/* 경고 위험 학생 */}
          {featureFlags.warningManagement && <section className="admin-section">
            <div className="flex items-center gap-2.5">
              <h2 className="admin-section-title">경고 위험 학생</h2>
              <div className="ml-auto flex items-center gap-2">
                {riskPreview.length > 0 && (
                  <span className="rounded-lg bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
                    {data.riskStudents.length}명
                  </span>
                )}
                <Link
                  href={`/${divisionSlug}/admin/warnings`}
                  className="text-xs font-medium text-slate-400 transition hover:text-slate-700"
                >
                  경고 관리 →
                </Link>
              </div>
            </div>

            <div className="mt-3">
              {riskPreview.length > 0 ? (
                <div>
                  {riskPreview.map((student) => (
                    <div key={student.id} className="admin-panel-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {featureFlags.studentManagement ? (
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                            >
                              {student.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-slate-900">
                              {student.name}
                            </span>
                          )}
                          <span className="admin-help">{student.studentNumber}</span>
                          <WarningStageBadge stage={student.warningStage} label={student.warningStageLabel} />
                        </div>
                        <p className="admin-help mt-0.5">
                          벌점 {student.netPoints}p · {student.seatLabel || "좌석 미배정"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyPhone(student.phone)}
                        className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
                        title="연락처 복사"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="admin-help py-4 text-center">경고 위험 학생이 없습니다.</p>
              )}
            </div>
          </section>}
        </section>
      </div>

      {/* 운영 변동 */}
      {featureFlags.studentManagement && (
        <div className="grid gap-6 xl:grid-cols-2">
        {/* 수강 만료 임박 */}
        <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">수강 만료 임박</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/students`}
              className="admin-button"
            >
              학생 관리로
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {expiringPreview.length > 0 ? (
              <div className="admin-table-frame overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="admin-table-name">학생</th>
                      <th className="admin-table-name">직렬</th>
                      <th className="admin-table-name">만료일</th>
                      <th className="admin-table-name">D-Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringPreview.map((student) => {
                      const dBadge =
                        student.daysRemaining < 0
                          ? { label: "만료됨", cls: "bg-rose-50 text-rose-600" }
                          : student.daysRemaining === 0
                            ? { label: "오늘", cls: "bg-rose-50 text-rose-600" }
                            : student.daysRemaining <= 7
                              ? { label: `D-${student.daysRemaining}`, cls: "bg-amber-50 text-amber-600" }
                              : { label: `D-${student.daysRemaining}`, cls: "bg-slate-100 text-slate-600" };
                      return (
                        <tr key={student.id} className="group">
                          <td>
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="font-semibold text-slate-900 transition group-hover:text-slate-600"
                            >
                              {student.name}
                            </Link>
                            <p className="admin-help">{student.studentNumber}</p>
                          </td>
                          <td>{student.studyTrack || "—"}</td>
                          <td>{student.courseEndDate}</td>
                          <td>
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${dBadge.cls}`}>
                              {dBadge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                수강 만료 임박 학생이 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 신규 입실 */}
        <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">신규 입실</h2>
              </div>
            </div>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              최근 10일 {data.newStudents.length}명
            </span>
          </div>

          <div className="mt-5">
            {newStudentsPreview.length > 0 ? (
              <div className="admin-table-frame overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="admin-table-name">학생</th>
                      <th className="admin-table-name">직렬</th>
                      <th className="admin-table-name">좌석</th>
                      <th className="admin-table-name">경과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newStudentsPreview.map((student) => {
                      const dayLabel =
                        student.daysAgo === 0 ? "오늘" : student.daysAgo === 1 ? "어제" : `${student.daysAgo}일 전`;
                      const dayCls =
                        student.daysAgo === 0
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-600";
                      return (
                        <tr key={student.id} className="group">
                          <td>
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="font-semibold text-slate-900 transition group-hover:text-slate-600"
                            >
                              {student.name}
                            </Link>
                            <p className="admin-help">{student.studentNumber}</p>
                          </td>
                          <td>{student.studyTrack || "—"}</td>
                          <td>{student.seatLabel || "미배정"}</td>
                          <td>
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${dayCls}`}>
                              {dayLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                최근 10일 이내 신규 입실 학생이 없습니다.
              </div>
            )}
          </div>
        </section>
        </div>
      )}

      {/* 최근 변동 */}
      <div className="grid gap-6 xl:grid-cols-2">
        {featureFlags.pointManagement && <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">최근 상벌점</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/points`}
              className="admin-button"
            >
              전체 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {recentPointPreview.length > 0 ? (
              <div>
                {recentPointPreview.map((record) => (
                  <div key={record.id} className="admin-panel-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {record.studentName}
                        </span>
                        <span className="admin-help">{record.studentNumber}</span>
                      </div>
                      <p className="admin-help mt-0.5 truncate">
                        {record.ruleName || "직접 입력"}
                        {record.notes ? ` · ${record.notes}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${ record.points > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700" }`}
                      >
                        {formatPointValue(record.points)}
                      </span>
                      <p className="mt-0.5 text-[13px] text-slate-400">
                        {new Date(record.date).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                최근 상벌점 기록이 없습니다.
              </div>
            )}
          </div>
        </section>}

        {featureFlags.paymentManagement && <section className="admin-section">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">최근 수납 내역</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/payments`}
              className="admin-button"
            >
              수납 관리로
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {recentPaymentPreview.length > 0 ? (
              <div className="admin-table-frame overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="admin-table-name">학생</th>
                      <th className="admin-table-name">유형</th>
                      <th className="admin-table-amount">금액</th>
                      <th className="admin-table-name">방법</th>
                      <th className="admin-table-name">날짜</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPaymentPreview.map((payment, index) => (
                      <tr key={index}>
                        <td>
                          <p className="font-semibold text-slate-900">{payment.studentName}</p>
                          <p className="admin-help">{payment.studentNumber}</p>
                        </td>
                        <td>{payment.paymentTypeName}</td>
                        <td className="admin-table-amount text-emerald-700">
                          {payment.amount.toLocaleString("ko-KR")}원
                        </td>
                        <td>
                          {formatPaymentMethod(payment.method)}
                        </td>
                        <td>{payment.paymentDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                최근 수납 내역이 없습니다.
              </div>
            )}
          </div>
        </section>}
      </div>

      {/* 오늘 외출/휴가 현황 + 면담 필요 학생 */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* 오늘 외출/휴가 현황 */}
        <section
          className={`admin-section ${ leaveManagementEnabled ? "" : "hidden" }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">오늘 외출/휴가</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/leave`}
              className="admin-button"
            >
              외출/휴가 관리
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {data.todayLeaveStudents.length > 0 ? (
              <div>
                {data.todayLeaveStudents.map((leave) => {
                  const statusInfo = LEAVE_STATUS_LABEL[leave.status] ?? { label: leave.status, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <div key={leave.id} className="admin-panel-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {featureFlags.studentManagement ? (
                            <Link
                              href={`/${divisionSlug}/admin/students/${leave.studentId}`}
                              className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                            >
                              {leave.studentName}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-slate-900">
                              {leave.studentName}
                            </span>
                          )}
                          <span className="admin-help">{leave.studentNumber}</span>
                          <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[13px] font-semibold text-blue-700">
                            {LEAVE_TYPE_LABEL[leave.type] ?? leave.type}
                          </span>
                        </div>
                        <p className="admin-help mt-0.5">
                          {leave.seatLabel || "좌석 미배정"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                오늘 외출/휴가 학생이 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 면담 필요 학생 */}
        <section
          className={`admin-section ${ interviewManagementEnabled ? "" : "hidden" }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">면담 필요 학생</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/interviews`}
              className="admin-button"
            >
              면담 기록
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {data.interviewNeededStudents.length > 0 ? (
              <div>
                {data.interviewNeededStudents.slice(0, 5).map((student) => (
                  <div key={student.id} className="admin-panel-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {featureFlags.studentManagement ? (
                          <Link
                            href={`/${divisionSlug}/admin/students/${student.id}`}
                            className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                          >
                            {student.name}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-slate-900">
                            {student.name}
                          </span>
                        )}
                        <span className="admin-help">{student.studentNumber}</span>
                      </div>
                      <p className="admin-help mt-0.5">
                        벌점 {student.netPoints}p ·{" "}
                        {student.lastInterviewDate
                          ? `최근 면담: ${student.lastInterviewDate}`
                          : "면담 기록 없음"}{" "}
                        · {student.seatLabel || "좌석 미배정"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPhone(student.phone)}
                      className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
                      title="연락처 복사"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-help py-6 text-center">
                면담이 필요한 학생이 없습니다.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
