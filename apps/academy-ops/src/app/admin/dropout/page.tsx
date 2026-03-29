import { AdminRole, StudentStatus } from "@prisma/client";
import { DropoutNotificationActions } from "@/components/dropout/dropout-notification-actions";
import { DropoutMonitorTable } from "@/components/dropout/dropout-monitor-table";
import { WeeklyStatusHistoryTable } from "@/components/dropout/weekly-status-history-table";
import {
  getDropoutMonitor,
  getWeeklyStatusHistory,
} from "@/lib/analytics/service";
import {
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: StudentStatus.DROPOUT, label: "탈락" },
  { value: StudentStatus.WARNING_2, label: "2차 경고" },
  { value: StudentStatus.WARNING_1, label: "1차 경고" },
  { value: StudentStatus.NORMAL, label: "정상" },
] as const;

const VIEW_OPTIONS = [
  { value: "current", label: "현재 상태" },
  { value: "history", label: "주차 이력" },
] as const;

export default async function AdminDropoutPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const selectedView = readStringParam(searchParams, "view") ?? "current";
  const selectedStatus = readStringParam(searchParams, "status") ?? "ALL";
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeekKey = readStringParam(searchParams, "weekKey");
  const selectedWeek =
    weekOptions.find((option) => option.key === requestedWeekKey) ??
    weekOptions.find((option) => option.key === getTuesdayWeekKey(new Date())) ??
    weekOptions[weekOptions.length - 1] ??
    null;

  const currentData =
    selectedPeriod && selectedView === "current"
      ? await getDropoutMonitor(selectedPeriod.id, examType)
      : null;
  const historyData =
    selectedPeriod && selectedView === "history" && selectedWeek
      ? await getWeeklyStatusHistory(selectedPeriod.id, examType, selectedWeek.key)
      : null;

  const currentRows =
    currentData?.rows.filter((row) => (selectedStatus === "ALL" ? true : row.status === selectedStatus)) ??
    [];
  const historyRows =
    historyData?.rows.filter((row) => (selectedStatus === "ALL" ? true : row.status === selectedStatus)) ??
    [];
  const notificationStatuses =
    selectedStatus === "ALL"
      ? [StudentStatus.WARNING_1, StudentStatus.WARNING_2, StudentStatus.DROPOUT]
      : selectedStatus === StudentStatus.WARNING_1 ||
          selectedStatus === StudentStatus.WARNING_2 ||
          selectedStatus === StudentStatus.DROPOUT
        ? [selectedStatus]
        : [];
  const notificationTargetCount = currentRows.filter(
    (row) => row.isActive && notificationStatuses.some((status) => status === row.status),
  ).length;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-05 Dropout
      </div>
      <h1 className="mt-5 text-3xl font-semibold">탈락 · 경고 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        오늘 기준 현재 상태와, 과거 특정 화요일~월요일 주차의 판정 이력을 각각 조회할 수 있습니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-5">
        <div>
          <label className="mb-2 block text-sm font-medium">조회 모드</label>
          <select
            name="view"
            defaultValue={selectedView}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">시험 기간</label>
          <select
            name="periodId"
            defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">상태 필터</label>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">주차</label>
          <select
            name="weekKey"
            defaultValue={selectedWeek?.key ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {weekOptions.length === 0 ? <option value="">주차 없음</option> : null}
            {weekOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-5 flex justify-end">
          <button
            type="submit"
            className="inline-flex min-w-[240px] items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {!selectedPeriod ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          시험 기간을 먼저 선택하세요.
        </div>
      ) : selectedView === "current" ? (
        currentRows.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
            해당 조건의 학생이 없습니다.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <DropoutNotificationActions
              periodId={selectedPeriod.id}
              examType={examType}
              statuses={notificationStatuses}
              recipientCount={notificationTargetCount}
            />
            <DropoutMonitorTable rows={currentRows} />
          </div>
        )
      ) : !selectedWeek ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          조회할 주차를 선택하세요.
        </div>
      ) : historyRows.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          해당 조건의 학생이 없습니다.
        </div>
      ) : (
        <WeeklyStatusHistoryTable
          rows={historyRows}
          weekLabel={historyData?.week.label ?? selectedWeek.label}
        />
      )}
    </div>
  );
}
