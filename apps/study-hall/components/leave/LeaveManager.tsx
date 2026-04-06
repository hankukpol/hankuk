"use client";

import { CalendarClock, LoaderCircle, Plus, RefreshCcw, Save } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import {
  getLeaveStatusClasses,
  getLeaveStatusLabel,
  getLeaveTypeLabel,
  LEAVE_TYPE_OPTIONS,
  type LeaveTypeValue,
} from "@/lib/leave-meta";
import type {
  LeavePermissionItem,
  LeaveSettlementPreviewResult,
} from "@/lib/services/leave.service";
import type { StudentListItem } from "@/lib/services/student.service";

type LeaveManagerProps = {
  divisionSlug: string;
  students: StudentListItem[];
  initialPermissions: LeavePermissionItem[];
  settings: {
    holidayLimit: number;
    halfDayLimit: number;
    healthLimit: number;
    holidayUnusedPts: number;
    halfDayUnusedPts: number;
  };
};

type FormState = {
  studentId: string;
  type: LeaveTypeValue;
  date: string;
  reason: string;
};

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentMonth() {
  return getKstToday().slice(0, 7);
}

function getPreviousMonth() {
  const [year, month] = getCurrentMonth().split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 2, 1));
  return target.toISOString().slice(0, 7);
}

function toFormState(studentId?: string): FormState {
  return {
    studentId: studentId ?? "",
    type: "HOLIDAY",
    date: getKstToday(),
    reason: "",
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

function getLimit(type: LeaveTypeValue, settings: LeaveManagerProps["settings"]) {
  switch (type) {
    case "HOLIDAY":
      return settings.holidayLimit;
    case "HALF_DAY":
      return settings.halfDayLimit;
    case "HEALTH":
      return settings.healthLimit;
    default:
      return null;
  }
}

export const LeaveManager = memo(function LeaveManager({
  divisionSlug,
  students,
  initialPermissions,
  settings,
}: LeaveManagerProps) {
  const initialMonth = getCurrentMonth();
  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const defaultStudentId = activeStudents[0]?.id ?? "";
  const [permissions, setPermissions] = useState(initialPermissions);
  const [form, setForm] = useState<FormState>(toFormState(defaultStudentId));
  const [summaryStudentId, setSummaryStudentId] = useState(defaultStudentId);
  const [summaryMonth, setSummaryMonth] = useState(getCurrentMonth());
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [historyMonth, setHistoryMonth] = useState(getCurrentMonth());
  const [settlementMonth, setSettlementMonth] = useState(getPreviousMonth());
  const [settlementPreview, setSettlementPreview] = useState<LeaveSettlementPreviewResult | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
    notice?: string;
  } | null>(null);
  const loadedMonthsRef = useRef(new Set<string>([initialMonth]));
  const { confirm, confirmDialog } = useConfirmDialog();

  function mergePermissionsForMonth(month: string, nextPermissions: LeavePermissionItem[]) {
    setPermissions((current) =>
      [
        ...current.filter((permission) => !permission.date.startsWith(month)),
        ...nextPermissions,
      ].sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      ),
    );
  }

  const requestPermissionsForMonth = useCallback(async (month: string) => {
    const response = await fetch(`/api/${divisionSlug}/leave?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "외출/휴가 내역을 불러오지 못했습니다.");
    }

    return data.permissions as LeavePermissionItem[];
  }, [divisionSlug]);


  const selectedSummaryStudent = activeStudents.find((student) => student.id === summaryStudentId) ?? null;
  const usageSummaryByType = useMemo(() => {
    const summary = new Map<LeaveTypeValue, number>();

    permissions.forEach((permission) => {
      if (
        permission.studentId !== summaryStudentId ||
        permission.status === "REJECTED" ||
        !permission.date.startsWith(summaryMonth)
      ) {
        return;
      }

      summary.set(permission.type, (summary.get(permission.type) ?? 0) + 1);
    });

    return summary;
  }, [permissions, summaryMonth, summaryStudentId]);

  const usageCards = useMemo(() => {
    if (!summaryStudentId) {
      return [];
    }

    return LEAVE_TYPE_OPTIONS.map((option) => {
      const used = usageSummaryByType.get(option.value) ?? 0;
      const limit = getLimit(option.value, settings);

      return {
        type: option.value,
        label: option.label,
        used,
        limit,
        remaining: limit === null ? null : Math.max(limit - used, 0),
      };
    });
  }, [settings, summaryStudentId, usageSummaryByType]);

  const historyRows = useMemo(() => {
    return permissions
      .filter((permission) => !historyStudentId || permission.studentId === historyStudentId)
      .filter((permission) => !historyMonth || permission.date.startsWith(historyMonth))
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.createdAt.localeCompare(left.createdAt),
      );
  }, [historyMonth, historyStudentId, permissions]);

  async function refreshPermissions(showToast = false, months = [summaryMonth, historyMonth]) {
    setIsRefreshing(true);

    try {
      const uniqueMonths = Array.from(new Set(months));
      const results = await Promise.all(
        uniqueMonths.map(async (month) => ({
          month,
          permissions: await requestPermissionsForMonth(month),
        })),
      );

      results.forEach(({ month, permissions }) => {
        mergePermissionsForMonth(month, permissions);
        loadedMonthsRef.current.add(month);
      });

      if (showToast) {
        toast.success("외출/휴가 내역을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "외출/휴가 내역을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const missingMonths = Array.from(new Set([summaryMonth, historyMonth])).filter(
      (month) => !loadedMonthsRef.current.has(month),
    );

    if (missingMonths.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingMonths.map(async (month) => ({
        month,
        permissions: await requestPermissionsForMonth(month),
      })),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }

        results.forEach(({ month, permissions }) => {
          mergePermissionsForMonth(month, permissions);
          loadedMonthsRef.current.add(month);
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "외출/휴가 내역을 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [historyMonth, requestPermissionsForMonth, summaryMonth]);

  async function loadSettlementPreview(showToast = false) {
    setIsPreviewLoading(true);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/leave/settle-month?month=${encodeURIComponent(settlementMonth)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "월말 정산 미리보기를 불러오지 못했습니다.");
      }

      setSettlementPreview(data.preview);

      if (showToast) {
        toast.success("월말 정산 미리보기를 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "월말 정산 미리보기를 불러오지 못했습니다.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function openCreatePanel(studentId?: string) {
    const targetStudentId = studentId ?? summaryStudentId ?? defaultStudentId;
    setForm(toFormState(targetStudentId));
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setForm(toFormState(summaryStudentId || defaultStudentId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          type: form.type,
          date: form.date,
          reason: form.reason || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "외출/휴가 등록에 실패했습니다.");
      }

      toast.success(form.type === "OUTING" ? "외출 허가를 등록했습니다." : "휴가를 등록하고 출결에 반영했습니다.");
      await refreshPermissions(false, [summaryMonth, historyMonth, form.date.slice(0, 7)]);
      setSummaryStudentId(form.studentId);
      closeEditor();
      setSaveSuccessModal({
        title: form.type === "OUTING" ? "외출 등록 완료" : "휴가 등록 완료",
        description:
          form.type === "OUTING"
            ? `${formatDate(form.date)} 외출 허가가 저장되었습니다.`
            : `${formatDate(form.date)} 휴가가 저장되고 출결에 반영되었습니다.`,
        notice: "등록된 외출·휴가 정보는 사용 현황과 이력 화면에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "외출/휴가 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSettleMonth() {
    if (!settlementPreview) {
      toast.error("먼저 미리보기를 조회해 주세요.");
      return;
    }
    if (!settlementPreview.isClosedMonth) {
      toast.error("진행 중인 월은 아직 정산할 수 없습니다.");
      return;
    }
    if (settlementPreview.grantableCount === 0) {
      toast.error("지급 가능한 정산 대상이 없습니다.");
      return;
    }

    const confirmed = await confirm({
      title: "월말 상점 지급",
      description: `${settlementPreview.month} 정산을 실행하시겠습니까? ${settlementPreview.grantableCount}명에게 총 ${settlementPreview.totalRewardPoints}점을 지급합니다.`,
      confirmLabel: "지급",
      cancelLabel: "취소",
      variant: "warning",
    });
    if (!confirmed) {
      return;
    }

    setIsSettling(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/leave/settle-month`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: settlementMonth }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "월말 정산에 실패했습니다.");
      }

      toast.success(`${data.result.createdCount}명에게 총 ${data.result.totalRewardPoints}점을 지급했습니다.`);
      await loadSettlementPreview();
      setSaveSuccessModal({
        title: "월말 정산 완료",
        description: `${data.result.createdCount}명에게 총 ${data.result.totalRewardPoints}점을 지급했습니다.`,
        notice: "정산 결과는 현재 월말 정산 미리보기와 포인트 현황에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "월말 정산에 실패했습니다.");
    } finally {
      setIsSettling(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {usageCards.map((card) => (
            <article key={card.type} className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{card.used}회</p>
              <p className="mt-2 text-xs text-slate-500">
                {card.limit === null ? "횟수 제한 없음" : `남은 횟수 ${card.remaining}회 / 월 최대 ${card.limit}회`}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                외출·휴가 데스크
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">외출 / 휴가 관리</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                학생별 사용 현황을 먼저 확인하고, 실제 외출·휴가 등록은 우측 패널에서 빠르게 처리합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshPermissions(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                새로고침
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                외출/휴가 등록
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-slate-950">월별 사용 현황</p>
                  <p className="mt-1 text-sm text-slate-500">학생별 휴가, 반차, 병가, 외출 사용 횟수를 월 단위로 확인합니다.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">학생</span>
                  <StudentSearchCombobox
                    students={activeStudents}
                    value={summaryStudentId}
                    onChange={setSummaryStudentId}
                    placeholder="학생을 선택해 주세요."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">기준 월</span>
                  <input
                    type="month"
                    value={summaryMonth}
                    onChange={(event) => setSummaryMonth(event.target.value)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                {selectedSummaryStudent
                  ? `${selectedSummaryStudent.studentNumber} · ${selectedSummaryStudent.name}의 ${summaryMonth} 사용 현황입니다.`
                  : "학생을 선택하면 월별 사용 현황을 확인할 수 있습니다."}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {usageCards.map((card) => (
                  <article key={card.type} className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                    <p className="text-sm text-slate-500">{card.label}</p>
                    <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{card.used}회</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {card.limit === null ? "횟수 제한 없음" : `남은 횟수 ${card.remaining}회`}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-bold text-slate-950">월말 미사용 휴가 정산</p>
                  <p className="mt-1 text-sm text-slate-500">이전 월 기준 남은 휴가권을 상점으로 전환합니다.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="month"
                    value={settlementMonth}
                    onChange={(event) => {
                      setSettlementMonth(event.target.value);
                      setSettlementPreview(null);
                    }}
                    className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => void loadSettlementPreview(true)}
                    disabled={isPreviewLoading}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isPreviewLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    미리보기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSettleMonth()}
                    disabled={isSettling || !settlementPreview || settlementPreview.grantableCount === 0}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isSettling ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    상점 지급
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
                휴가 미사용 1회당 +{settings.holidayUnusedPts}점, 반차 미사용 1회당 +{settings.halfDayUnusedPts}점을 지급합니다.
              </div>

              {settlementPreview ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">지급 대상</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{settlementPreview.grantableCount}명</p>
                    </article>
                    <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">총 지급 점수</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{settlementPreview.totalRewardPoints}점</p>
                    </article>
                    <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">이미 정산됨</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{settlementPreview.alreadySettledCount}명</p>
                    </article>
                  </div>

                  {!settlementPreview.isClosedMonth ? (
                    <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-amber-800">
                      진행 중인 월은 아직 정산할 수 없습니다. 지난달 또는 이전 월을 선택해 주세요.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                  정산 대상 월을 선택하고 미리보기를 조회해 주세요.
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">이력 조회</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">외출 / 휴가 이력</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StudentSearchCombobox
                students={activeStudents}
                value={historyStudentId}
                onChange={setHistoryStudentId}
                allStudentsLabel="전체 학생"
              />

              <input
                type="month"
                value={historyMonth}
                onChange={(event) => setHistoryMonth(event.target.value)}
                className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-3 font-medium">학생</th>
                  <th className="px-3 py-3 font-medium">유형</th>
                  <th className="px-3 py-3 font-medium">날짜</th>
                  <th className="px-3 py-3 font-medium">상태</th>
                  <th className="px-3 py-3 font-medium">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyRows.length > 0 ? (
                  historyRows.map((permission) => (
                    <tr key={permission.id} className="align-top">
                      <td className="px-3 py-4">
                        <p className="font-medium text-slate-900">{permission.studentName}</p>
                        <p className="mt-1 text-xs text-slate-500">{permission.studentNumber}</p>
                      </td>
                      <td className="px-3 py-4 text-slate-700">{getLeaveTypeLabel(permission.type)}</td>
                      <td className="px-3 py-4 text-slate-700">{formatDate(permission.date)}</td>
                      <td className="px-3 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getLeaveStatusClasses(permission.status)}`}>
                          {getLeaveStatusLabel(permission.status)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-slate-600">{permission.reason || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                      조건에 맞는 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        open={isEditorOpen}
        onClose={closeEditor}
        badge="빠른 등록"
        title="외출 / 휴가 등록"
        description="학생 선택, 유형, 날짜, 사유를 입력하면 사용 현황과 이력이 즉시 갱신됩니다."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">사용 등록</p>
                <p className="text-sm text-slate-500">학생별 외출, 휴가, 반차, 병가를 빠르게 등록합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">학생</span>
                <StudentSearchCombobox
                  students={activeStudents}
                  value={form.studentId}
                  onChange={(id) => {
                    setForm((current) => ({ ...current, studentId: id }));
                    setSummaryStudentId(id);
                  }}
                  placeholder="이름 또는 수험번호 검색"
                  showStudyTrack
                />
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">유형</span>
                <select
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as LeaveTypeValue }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  {LEAVE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">날짜</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  required
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-slate-700">사유</span>
              <textarea
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                className="min-h-[140px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="사유를 입력해 주세요."
              />
            </label>

            <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
              휴가, 반차, 병가는 월별 사용 한도와 연결되며, 미사용 권한은 월말 정산에서 상점으로 전환할 수 있습니다.
            </div>
          </section>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">등록 후 사용 현황과 이력이 즉시 반영됩니다.</p>
              <p className="mt-1 text-sm text-slate-500">외출은 허가 이력만 남고, 휴가 계열은 출결에도 바로 연결됩니다.</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                외출/휴가 등록
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ActionCompleteModal
        open={saveSuccessModal !== null}
        onClose={() => setSaveSuccessModal(null)}
        title={saveSuccessModal?.title ?? "저장 완료"}
        description={saveSuccessModal?.description}
        notice={saveSuccessModal?.notice}
      />
      {confirmDialog}
    </>
  );
});
