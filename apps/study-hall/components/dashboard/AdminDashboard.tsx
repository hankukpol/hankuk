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
  CalendarDays,
  CalendarX,
  ClipboardList,
  Copy,
  CreditCard,
  DoorOpen,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCcw,
  Star,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
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

type NotificationPermissionState = NotificationPermission | "unsupported";

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

let sharedAudioContext: AudioContext | null = null;

function playBeep() {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContext();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // 브라우저 미지원 시 무시
  }
}

function showBrowserNotification(message: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("시간통제 자습반", { body: message });
}

async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  return Notification.requestPermission();
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
  const color = rate >= 90 ? "#10b981" : rate >= 75 ? "#f59e0b" : "#f43f5e";

  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
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
        playBeep();
        showBrowserNotification(message);
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

  const bgColor =
    info.type === "STUDYING"
      ? { from: "#059669", to: "#064e3b" }
      : info.type === "BREAK"
        ? { from: "#d97706", to: "#78350f" }
        : { from: "#0284c7", to: "#0c4a6e" };

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
    <section
      className="overflow-hidden rounded-[10px] shadow-[0_20px_60px_rgba(18,32,56,0.15)]"
      style={{ backgroundColor: `${bgColor.from}` }}
    >
      <div className="px-7 py-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              현재 상태
            </p>
            <h2 className="mt-1.5 text-2xl font-bold text-white">{statusLabel}</h2>
            {subLabel && <p className="mt-0.5 text-sm text-white/75">{subLabel}</p>}
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              남은 시간
            </p>
            <p className="mt-1 font-mono text-5xl font-extrabold tabular-nums text-white">
              {timeDisplay}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {notificationPermission === "default" ? (
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              브라우저 알림 허용
            </button>
          ) : notificationPermission === "granted" ? (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85">
              브라우저 알림 사용 중
            </span>
          ) : notificationPermission === "denied" ? (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">
              브라우저 알림 차단됨
            </span>
          ) : null}
        </div>

        {(info.type === "STUDYING" || info.type === "BREAK") && (
          <div className="mt-5">
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-white/55">
              {info.type === "STUDYING" ? (
                <>
                  <span>{info.startTime} 시작</span>
                  <span className="font-semibold text-white/80">
                    {Math.round(progressPercent)}% 경과
                  </span>
                  <span>{info.endTime} 종료</span>
                </>
              ) : (
                <>
                  <span>{isMealBreak ? "식사 시간 중" : "쉬는 시간 중"}</span>
                  <span className="font-semibold text-white/80">
                    {Math.round(progressPercent)}% 경과
                  </span>
                  <span>{info.nextPeriodName} 시작까지</span>
                </>
              )}
            </div>
          </div>
        )}
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
        value: `${rate}%`,
        description: `${data.summary.attendedCount} / ${data.summary.expectedCount} 교시`,
        subtext: formatDelta(data.summary.deltaFromYesterday),
        icon: BookOpenCheck,
        gauge: true,
        featureKey: "attendanceManagement",
      },
      {
        title: "현재 학생",
        value: `${data.studentOverview.activeCount}명`,
        description: "활성 재실 중",
        subtext: `휴가 ${data.studentOverview.onLeaveCount}명 포함`,
        icon: Users,
        gauge: false,
        featureKey: "studentManagement",
      },
      {
        title: "이번 주 지각/결석",
        value: `${data.summary.weeklyTardyAbsentCount}건`,
        description: `지각 ${data.summary.weeklyTardyCount} / 결석 ${data.summary.weeklyAbsentCount}`,
        subtext: "월요일부터 오늘까지",
        icon: TrendingUp,
        gauge: false,
        featureKey: "attendanceManagement",
      },
      {
        title: "이번 달 수납",
        value: `${data.paymentStats.thisMonthTotal.toLocaleString("ko-KR")}원`,
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
        borderClass: data.summary.uncheckedPeriodCount > 0 ? "border-amber-100" : "border-black/5",
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
        borderClass: data.attentionStudents.length > 0 ? "border-amber-100" : "border-black/5",
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
        borderClass: data.summary.riskStudentCount > 0 ? "border-rose-100" : "border-black/5",
        featureKey: "warningManagement",
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
        borderClass: data.expiringStudents.length > 0 ? "border-rose-100" : "border-black/5",
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
    <div className="space-y-6">
      {/* 헤더 */}
      <section className="overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <div className="grid gap-5 px-6 py-7 md:grid-cols-[1.2fr_0.8fr] md:px-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                운영 대시보드
              </p>
              <span className="text-xs text-slate-500">
                마지막 업데이트: {lastUpdatedLabel}
              </span>
              {isRefreshing ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  갱신 중
                </span>
              ) : null}
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
              {data.division.name} 운영 현황
            </h1>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => void refreshDashboard(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                수동 새로고침
              </button>

              <Link
                href={`/${divisionSlug}/admin/attendance`}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 ${
                  featureFlags.attendanceManagement ? "" : "hidden"
                }`}
                style={{ backgroundColor: data.division.color }}
              >
                출석부로 이동
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href={`/${divisionSlug}/admin/seats`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                좌석 현황
                <MapPin className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div
            className="rounded-[10px] border border-white/30 p-5 text-white"
            style={{
              backgroundColor: `${data.division.color}`,
            }}
          >
            <p className="text-sm font-medium text-white/75">오늘 기준</p>
            <p className="mt-3 text-3xl font-extrabold">{data.summary.todayDate}</p>
            <p className="mt-3 text-sm leading-6 text-white/80">
              {data.summary.uncheckedPeriodCount > 0
                ? `${data.summary.uncheckedPeriodCount}개 교시가 아직 미처리 상태입니다.`
                : "오늘 필수 교시는 모두 처리되었습니다."}
            </p>
          </div>
        </div>
      </section>

      {/* 교시 타이머 */}
      <PeriodTimerWidget schedules={data.periodSchedules} />

      {/* 시험 일정 D-Day */}
      {featureFlags.examScheduleManagement && data.upcomingExamSchedules.length > 0 && (
        <section
          className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  시험 일정
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">시험 일정</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/settings/exam-schedules`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              일정 관리
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.upcomingExamSchedules.map((exam) => (
              <div
                key={exam.id}
                className="rounded-[10px] border border-slate-100 bg-slate-50 p-4"
              >
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-extrabold ${
                    exam.dDayValue === 0
                      ? "bg-red-100 text-red-600"
                      : exam.dDayValue < 0
                        ? "bg-slate-200 text-slate-500"
                        : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {exam.dDayLabel}
                </span>
                <p className="mt-3 text-base font-bold text-slate-900 truncate">{exam.name}</p>
                <p className="mt-1 text-xs text-slate-500">{exam.examDate}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 핵심 지표 */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleSummaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.title}
              className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_12px_30px_rgba(18,32,56,0.06)]"
            >
              <div className="flex items-start justify-between">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-[10px] bg-slate-100 text-slate-900">
                  <Icon className="h-5 w-5" />
                </div>
                {card.gauge && (
                  <div className="relative flex items-center justify-center">
                    <CircularGauge rate={rate} />
                    <span className="absolute text-xs font-bold text-slate-700">
                      {rate}%
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.title}</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-950">{card.value}</p>
              <p className="mt-3 text-sm text-slate-600">{card.description}</p>
              <p className="mt-1 text-xs text-slate-500">{card.subtext}</p>
            </article>
          );
        })}
      </section>

      {/* 오늘 처리할 일 */}
      <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              오늘 처리할 일
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">오늘 처리할 일</h2>
            <p className="mt-2 text-sm text-slate-600">
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
                className={`group rounded-[10px] border ${card.borderClass} bg-white p-5 shadow-[0_12px_30px_rgba(18,32,56,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(18,32,56,0.08)]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-[10px] ${card.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${card.badgeClass}`}>
                    {card.value}
                  </span>
                </div>

                <p className="mt-4 text-base font-bold text-slate-950">{card.title}</p>
                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">{card.note}</span>
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
          className={`flex h-full flex-col rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)] ${
            featureFlags.attendanceManagement ? "" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <ClipboardList className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-950">교시별 출결 현황</h2>
            </div>
            <Link
              href={`/${divisionSlug}/admin/attendance`}
              className="text-xs font-medium text-slate-400 transition hover:text-slate-700"
            >
              출석부 →
            </Link>
          </div>

          <div className="mt-3 flex flex-1 flex-col divide-y divide-slate-100">
            {data.periodRows.map((row) => (
              <div key={row.periodId} className="flex min-h-[60px] flex-1 items-center gap-3 py-3 md:min-h-[68px]">
                <div className="w-[88px] shrink-0">
                  <p className="text-sm font-semibold text-slate-900">{row.periodName}</p>
                  {row.label && <p className="text-[11px] text-slate-400">{row.label}</p>}
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
                      className={`h-full rounded-full transition-all ${
                        row.attendanceRate >= 90
                          ? "bg-emerald-400"
                          : row.attendanceRate >= 75
                            ? "bg-amber-400"
                            : "bg-rose-400"
                      }`}
                      style={{ width: `${row.attendanceRate}%` }}
                    />
                  </div>
                </div>

                {row.isUnchecked ? (
                  <Link
                    href={`/${divisionSlug}/admin/attendance`}
                    className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200"
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
            className={`rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)] ${
              featureFlags.attendanceManagement ? "" : "hidden"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-950">반복 지각 · 결석</h2>
              <div className="ml-auto flex items-center gap-2">
                {attentionPreview.length > 0 && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
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
                <div className="divide-y divide-slate-100">
                  {attentionPreview.map((student) => (
                    <div
                      key={`${student.type}-${student.studentId}`}
                      className="flex items-center gap-3 py-2.5"
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
                          <span className="text-xs text-slate-400">{student.studentNumber}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              student.type === "ABSENT"
                                ? "bg-rose-50 text-rose-600"
                                : "bg-amber-50 text-amber-600"
                            }`}
                          >
                            {student.type === "ABSENT" ? "결석 반복" : "지각 반복"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {student.message} · {student.seatLabel || "좌석 미배정"}
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
                <p className="py-4 text-center text-sm text-slate-400">
                  최근 7일 기준 반복 지각/결석 학생이 없습니다.
                </p>
              )}
            </div>
          </section>

          {/* 경고 위험 학생 */}
          {featureFlags.warningManagement && <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <Phone className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-950">경고 위험 학생</h2>
              <div className="ml-auto flex items-center gap-2">
                {riskPreview.length > 0 && (
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
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
                <div className="divide-y divide-slate-100">
                  {riskPreview.map((student) => (
                    <div key={student.id} className="flex items-center gap-3 py-2.5">
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
                          <span className="text-xs text-slate-400">{student.studentNumber}</span>
                          <WarningStageBadge stage={student.warningStage} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
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
                <p className="py-4 text-center text-sm text-slate-400">경고 위험 학생이 없습니다.</p>
              )}
            </div>
          </section>}
        </section>
      </div>

      {/* 운영 변동 */}
      {featureFlags.studentManagement && (
        <div className="grid gap-6 xl:grid-cols-2">
        {/* 수강 만료 임박 */}
        <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <CalendarX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  만료 예정
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">수강 만료 임박</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/students`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              학생 관리로
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {expiringPreview.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">학생</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">직렬</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">만료일</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">D-Day</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
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
                          <td className="py-3 pr-4">
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="font-semibold text-slate-900 transition group-hover:text-slate-600"
                            >
                              {student.name}
                            </Link>
                            <p className="text-xs text-slate-400">{student.studentNumber}</p>
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-500">{student.studyTrack || "—"}</td>
                          <td className="py-3 pr-4 text-xs text-slate-600">{student.courseEndDate}</td>
                          <td className="py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dBadge.cls}`}>
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
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                수강 만료 임박 학생이 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 신규 입실 */}
        <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  신규 입실
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">신규 입실</h2>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              최근 10일 {data.newStudents.length}명
            </span>
          </div>

          <div className="mt-5">
            {newStudentsPreview.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">학생</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">직렬</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">좌석</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">경과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {newStudentsPreview.map((student) => {
                      const dayLabel =
                        student.daysAgo === 0 ? "오늘" : student.daysAgo === 1 ? "어제" : `${student.daysAgo}일 전`;
                      const dayCls =
                        student.daysAgo === 0
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-600";
                      return (
                        <tr key={student.id} className="group">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/${divisionSlug}/admin/students/${student.id}`}
                              className="font-semibold text-slate-900 transition group-hover:text-slate-600"
                            >
                              {student.name}
                            </Link>
                            <p className="text-xs text-slate-400">{student.studentNumber}</p>
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-500">{student.studyTrack || "—"}</td>
                          <td className="py-3 pr-4 text-xs text-slate-500">{student.seatLabel || "미배정"}</td>
                          <td className="py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dayCls}`}>
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
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                최근 10일 이내 신규 입실 학생이 없습니다.
              </div>
            )}
          </div>
        </section>
        </div>
      )}

      {/* 최근 변동 */}
      <div className="grid gap-6 xl:grid-cols-2">
        {featureFlags.pointManagement && <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  최근 상벌점
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">최근 상벌점</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/points`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              전체 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {recentPointPreview.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {recentPointPreview.map((record) => (
                  <div key={record.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {record.studentName}
                        </span>
                        <span className="text-xs text-slate-400">{record.studentNumber}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {record.ruleName || "직접 입력"}
                        {record.notes ? ` · ${record.notes}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          record.points > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {formatPointValue(record.points)}
                      </span>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {new Date(record.date).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                최근 상벌점 기록이 없습니다.
              </div>
            )}
          </div>
        </section>}

        {featureFlags.paymentManagement && <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  최근 수납
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">최근 수납 내역</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/payments`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              수납 관리로
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {recentPaymentPreview.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">학생</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">유형</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate-500">금액</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">방법</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500">날짜</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentPaymentPreview.map((payment, index) => (
                      <tr key={index}>
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-slate-900">{payment.studentName}</p>
                          <p className="text-xs text-slate-400">{payment.studentNumber}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600">{payment.paymentTypeName}</td>
                        <td className="py-3 pr-4 text-right font-bold text-emerald-700">
                          {payment.amount.toLocaleString("ko-KR")}원
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-500">
                          {formatPaymentMethod(payment.method)}
                        </td>
                        <td className="py-3 text-xs text-slate-500">{payment.paymentDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
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
          className={`rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)] ${
            leaveManagementEnabled ? "" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <DoorOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  오늘 외출/휴가
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">오늘 외출/휴가</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/leave`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              외출/휴가 관리
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {data.todayLeaveStudents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.todayLeaveStudents.map((leave) => {
                  const statusInfo = LEAVE_STATUS_LABEL[leave.status] ?? { label: leave.status, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <div key={leave.id} className="flex items-center gap-3 py-3">
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
                          <span className="text-xs text-slate-400">{leave.studentNumber}</span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {LEAVE_TYPE_LABEL[leave.type] ?? leave.type}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {leave.seatLabel || "좌석 미배정"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                오늘 외출/휴가 학생이 없습니다.
              </div>
            )}
          </div>
        </section>

        {/* 면담 필요 학생 */}
        <section
          className={`rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)] ${
            interviewManagementEnabled ? "" : "hidden"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-700">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  면담 필요
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">면담 필요 학생</h2>
              </div>
            </div>
            <Link
              href={`/${divisionSlug}/admin/interviews`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              면담 기록
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5">
            {data.interviewNeededStudents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.interviewNeededStudents.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center gap-3 py-3">
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
                        <span className="text-xs text-slate-400">{student.studentNumber}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
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
              <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                면담이 필요한 학생이 없습니다.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
