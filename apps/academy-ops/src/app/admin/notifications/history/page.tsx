import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/constants";
import {
  NotificationHistoryClient,
  type NotificationLogRow,
} from "./notification-history-client";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateRangeFilter(
  dateFrom: string | undefined,
  dateTo: string | undefined
): { gte?: Date; lte?: Date } | undefined {
  const now = new Date();

  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    const from = new Date(dateFrom + "T00:00:00");
    let to: Date;
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      // Clamp: max 30 days from `from`
      const requested = new Date(dateTo + "T23:59:59");
      const maxTo = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
      to = requested < maxTo ? requested : maxTo;
    } else {
      to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000);
      to.setHours(23, 59, 59, 999);
    }
    return { gte: from, lte: to };
  }

  // Default: last 7 days
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { gte: from, lte: now };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Type filter values ───────────────────────────────────────────────────────
const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "전체 유형" },
  { value: NotificationType.ENROLLMENT_COMPLETE, label: NOTIFICATION_TYPE_LABEL.ENROLLMENT_COMPLETE },
  { value: NotificationType.PAYMENT_COMPLETE, label: NOTIFICATION_TYPE_LABEL.PAYMENT_COMPLETE },
  { value: NotificationType.REFUND_COMPLETE, label: NOTIFICATION_TYPE_LABEL.REFUND_COMPLETE },
  { value: NotificationType.WARNING_1, label: NOTIFICATION_TYPE_LABEL.WARNING_1 },
  { value: NotificationType.WARNING_2, label: NOTIFICATION_TYPE_LABEL.WARNING_2 },
  { value: NotificationType.DROPOUT, label: NOTIFICATION_TYPE_LABEL.DROPOUT },
  { value: NotificationType.ABSENCE_NOTE, label: NOTIFICATION_TYPE_LABEL.ABSENCE_NOTE },
  { value: NotificationType.POINT, label: NOTIFICATION_TYPE_LABEL.POINT },
  { value: NotificationType.NOTICE, label: NOTIFICATION_TYPE_LABEL.NOTICE },
  { value: NotificationType.SCORE_DEADLINE, label: NOTIFICATION_TYPE_LABEL.SCORE_DEADLINE },
];

// ─── Page Props ───────────────────────────────────────────────────────────────
type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function NotificationHistoryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = searchParams ? await searchParams : {};

  function getParam(key: string): string | undefined {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  }

  const page = Math.max(1, parseInt(getParam("page") ?? "1", 10));
  const limit = 50;

  const typeParam = getParam("type")?.trim() || "ALL";
  const statusParam = getParam("status")?.trim() || "ALL";
  const dateFromParam = getParam("from")?.trim();
  const dateToParam = getParam("to")?.trim();
  const searchParam = getParam("search")?.trim() || "";

  const typeFilter =
    typeParam !== "ALL" &&
    Object.values(NotificationType).includes(typeParam as NotificationType)
      ? (typeParam as NotificationType)
      : undefined;

  const statusFilter = statusParam !== "ALL" ? statusParam : undefined;

  const sentAtFilter = toDateRangeFilter(dateFromParam, dateToParam);

  // Default dates for the filter form (display)
  const defaultFrom = sentAtFilter?.gte ? toDateStr(sentAtFilter.gte) : "";
  const defaultTo = sentAtFilter?.lte ? toDateStr(sentAtFilter.lte instanceof Date ? sentAtFilter.lte : new Date(sentAtFilter.lte)) : "";

  const where = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sentAtFilter ? { sentAt: sentAtFilter } : {}),
    ...(searchParam
      ? {
          student: {
            name: { contains: searchParam },
          },
        }
      : {}),
  };

  const prisma = getPrisma();

  // Last 7 days KPI
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Current month KPI
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Last 6 months for chart
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);

  const [
    filteredTotal,
    logs,
    week7Total,
    week7Sent,
    week7Failed,
    week7Pending,
    monthTotal,
    monthFail,
    chartRawLogs,
  ] = await Promise.all([
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      where,
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    // 7-day KPIs
    prisma.notificationLog.count({
      where: { sentAt: { gte: sevenDaysAgo, lte: now } },
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: sevenDaysAgo, lte: now }, status: "sent" },
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: sevenDaysAgo, lte: now }, status: "failed" },
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: sevenDaysAgo, lte: now }, status: "pending" },
    }),
    // Month stats for chart context
    prisma.notificationLog.count({
      where: { sentAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.notificationLog.count({
      where: {
        sentAt: { gte: monthStart, lte: monthEnd },
        status: "failed",
      },
    }),
    prisma.notificationLog.findMany({
      where: { sentAt: { gte: sixMonthsAgo } },
      select: { sentAt: true, status: true },
      orderBy: { sentAt: "asc" },
    }),
  ]);

  const monthSuccess = monthTotal - monthFail;
  const successRate = monthTotal > 0 ? Math.round((monthSuccess / monthTotal) * 100) : 100;
  const week7FailRate = week7Total > 0 ? Math.round((week7Failed / week7Total) * 100) : 0;
  const totalPages = Math.ceil(filteredTotal / limit);

  // Build monthly chart data
  const chartMap = new Map<string, { sent: number; failed: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    chartMap.set(key, { sent: 0, failed: 0 });
  }
  for (const log of chartRawLogs) {
    const d = log.sentAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (chartMap.has(key)) {
      const entry = chartMap.get(key)!;
      if (log.status === "sent") entry.sent += 1;
      else if (log.status === "failed") entry.failed += 1;
    }
  }
  const monthlyChart = Array.from(chartMap.entries()).map(([month, counts]) => ({
    month,
    ...counts,
  }));

  // Build pagination URL helper
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (typeParam !== "ALL") params.set("type", typeParam);
    if (statusParam !== "ALL") params.set("status", statusParam);
    if (dateFromParam) params.set("from", dateFromParam);
    if (dateToParam) params.set("to", dateToParam);
    if (searchParam) params.set("search", searchParam);
    params.set("page", String(p));
    return `/admin/notifications/history?${params.toString()}`;
  }

  // Serialize logs for client component
  const serializedLogs: NotificationLogRow[] = logs.map((log) => ({
    id: log.id,
    type: log.type,
    channel: log.channel,
    status: log.status,
    message: log.message,
    failReason: log.failReason,
    sentAt: log.sentAt.toISOString(),
    student: {
      examNumber: log.student.examNumber,
      name: log.student.name,
      phone: log.student.phone,
    },
  }));

  const korMonth = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        알림·공지
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">알림 발송 이력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            카카오 알림톡·SMS 발송 이력을 조회하고 성공률을 확인합니다.
            실패 건은 재발송 버튼으로 즉시 재처리할 수 있습니다.
          </p>
        </div>
        <Link
          href="/admin/notifications/send"
          className="flex-shrink-0 inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          수동 발송
        </Link>
      </div>

      {/* KPI Cards — 최근 7일 */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 총 발송 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">최근 7일 총 발송</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {week7Total.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-1 text-xs text-slate/70">{toDateStr(sevenDaysAgo)} ~ {toDateStr(now)}</p>
        </div>

        {/* 성공 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">최근 7일 성공</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {week7Sent.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-1 text-xs text-slate/70">
            {week7Total > 0 ? `성공률 ${Math.round((week7Sent / week7Total) * 100)}%` : "발송 없음"}
          </p>
        </div>

        {/* 실패 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">최근 7일 실패</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={`text-3xl font-bold ${week7Failed > 0 ? "text-red-600" : "text-ink"}`}>
              {week7Failed.toLocaleString("ko-KR")}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            {week7FailRate > 5 && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                실패율 {week7FailRate}%
              </span>
            )}
          </div>
          {week7Failed > 0 && week7FailRate <= 5 && (
            <p className="mt-1 text-xs text-slate/70">실패율 {week7FailRate}%</p>
          )}
        </div>

        {/* 대기중 */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">최근 7일 대기중</p>
          <p className={`mt-2 text-3xl font-bold ${week7Pending > 0 ? "text-amber-600" : "text-ink"}`}>
            {week7Pending.toLocaleString("ko-KR")}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-1 text-xs text-slate/70">
            {korMonth} 성공률 {successRate}%
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <form
        method="GET"
        action="/admin/notifications/history"
        className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {/* Student name search */}
          <div className="lg:col-span-2">
            <label htmlFor="search" className="mb-2 block text-sm font-medium">
              학생 이름 검색
            </label>
            <input
              id="search"
              type="text"
              name="search"
              defaultValue={searchParam}
              placeholder="학생 이름"
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>

          {/* Type filter */}
          <div>
            <label htmlFor="type" className="mb-2 block text-sm font-medium">
              알림 유형
            </label>
            <select
              id="type"
              name="type"
              defaultValue={typeParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="status" className="mb-2 block text-sm font-medium">
              발송 상태
            </label>
            <select
              id="status"
              name="status"
              defaultValue={statusParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="ALL">전체 상태</option>
              <option value="sent">성공</option>
              <option value="failed">실패</option>
              <option value="pending">대기중</option>
              <option value="skipped">제외</option>
            </select>
          </div>

          {/* Date from */}
          <div>
            <label htmlFor="from" className="mb-2 block text-sm font-medium">
              시작일
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={defaultFrom}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>

          {/* Date to */}
          <div>
            <label htmlFor="to" className="mb-2 block text-sm font-medium">
              종료일 <span className="text-xs font-normal text-slate">(최대 30일)</span>
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={defaultTo}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        {/* Submit row */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-slate">
            {filteredTotal.toLocaleString("ko-KR")}건 조회됨
            {sentAtFilter?.gte && sentAtFilter?.lte && (
              <span className="ml-2 text-xs text-slate/70">
                ({toDateStr(sentAtFilter.gte)} ~ {toDateStr(sentAtFilter.lte instanceof Date ? sentAtFilter.lte : new Date(sentAtFilter.lte))})
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <a
              href="/admin/notifications/history"
              className="inline-flex items-center rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-medium text-slate transition hover:border-ink/40"
            >
              초기화
            </a>
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              검색
            </button>
          </div>
        </div>
      </form>

      {/* Client section: Chart + Table */}
      <div className="mt-8 space-y-8">
        <NotificationHistoryClient
          logs={serializedLogs}
          monthlyChart={monthlyChart}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between rounded-[28px] border border-ink/10 bg-white px-6 py-4">
          <p className="text-sm text-slate">
            {page} / {totalPages} 페이지 &nbsp;·&nbsp;{" "}
            {filteredTotal.toLocaleString("ko-KR")}건 &nbsp;·&nbsp; 페이지당 50건
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <a
                href={pageUrl(page - 1)}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                ← 이전
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                ← 이전
              </span>
            )}
            {page < totalPages ? (
              <a
                href={pageUrl(page + 1)}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
              >
                다음 →
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate/40">
                다음 →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
