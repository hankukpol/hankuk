"use client";

import { AlertTriangle, Calculator, LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useState } from "react";
import { normalizeExamAnalysisSettings, type ExamAnalysisSettings } from "@/lib/exam-analysis-settings";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { SettingsHistoryList } from "@/components/settings/SettingsHistoryList";
import type { PointRuleItem, WarningStageDistribution } from "@/lib/services/point.service";
import type { DivisionRuleSettings } from "@/lib/services/settings.service";
import type { SettingsHistoryItem } from "@/lib/services/settings-history.service";
import type { ManagementPolicy } from "@/lib/management-policy";
import Link from "next/link";

type RulesSettingsManagerProps = {
  divisionSlug: string;
  initialSettings: DivisionRuleSettings;
  pointRules: PointRuleItem[];
  policy?: ManagementPolicy | null;
  initialHistory: SettingsHistoryItem[];
  aggregationLabel: string;
  aggregationDescription: string;
};

type FormState = {
  examAnalysis: ExamAnalysisSettings;
  tardyMinutes: string;
  assistantPastEditAllowed: boolean;
  assistantPastEditDays: string;
  warnLevel1: string;
  warnLevel2: string;
  warnInterview: string;
  warnWithdraw: string;
  warnMsgLevel1: string;
  warnMsgLevel2: string;
  warnMsgInterview: string;
  warnMsgWithdraw: string;
  holidayLimit: string;
  halfDayLimit: string;
  healthLimit: string;
  holidayUnusedPts: string;
  halfDayUnusedPts: string;
  tardyPointRuleId: string;
  absentPointRuleId: string;
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: string;
  expirationWarningDays: string;
};

function toFormState(settings: DivisionRuleSettings): FormState {
  return {
    examAnalysis: normalizeExamAnalysisSettings(settings.examAnalysis),
    tardyMinutes: String(settings.tardyMinutes),
    assistantPastEditAllowed: settings.assistantPastEditAllowed,
    assistantPastEditDays: String(settings.assistantPastEditDays),
    warnLevel1: String(settings.warnLevel1),
    warnLevel2: String(settings.warnLevel2),
    warnInterview: String(settings.warnInterview),
    warnWithdraw: String(settings.warnWithdraw),
    warnMsgLevel1: settings.warnMsgLevel1,
    warnMsgLevel2: settings.warnMsgLevel2,
    warnMsgInterview: settings.warnMsgInterview,
    warnMsgWithdraw: settings.warnMsgWithdraw,
    holidayLimit: String(settings.holidayLimit),
    halfDayLimit: String(settings.halfDayLimit),
    healthLimit: String(settings.healthLimit),
    holidayUnusedPts: String(settings.holidayUnusedPts),
    halfDayUnusedPts: String(settings.halfDayUnusedPts),
    tardyPointRuleId: settings.tardyPointRuleId ?? "",
    absentPointRuleId: settings.absentPointRuleId ?? "",
    perfectAttendancePtsEnabled: settings.perfectAttendancePtsEnabled,
    perfectAttendancePts: String(settings.perfectAttendancePts),
    expirationWarningDays: String(settings.expirationWarningDays),
  };
}

function asNumber(value: string) {
  return Number(value || 0);
}

export function RulesSettingsManager({
  divisionSlug,
  initialSettings,
  pointRules,
  policy,
  initialHistory,
  aggregationLabel,
  aggregationDescription,
}: RulesSettingsManagerProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<FormState>(toFormState(initialSettings));
  const [history, setHistory] = useState(initialHistory);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<WarningStageDistribution | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();

  async function refreshHistory() {
    try {
      const response = await fetch(`/api/${divisionSlug}/settings/rules/history?limit=10`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.ok) {
        setHistory(data.history);
      }
    } catch {
      // 이력은 부가 정보다. 실패해도 저장 흐름을 막지 않는다.
    }
  }

  async function runPreview() {
    setIsPreviewing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/rules/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warnLevel1: form.warnLevel1,
          warnLevel2: form.warnLevel2,
          warnInterview: form.warnInterview,
          warnWithdraw: form.warnWithdraw,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "영향 미리보기를 계산하지 못했습니다.");
      }

      setPreview(data.preview);
    } catch (error) {
      setPreview(null);
      toast.error(
        error instanceof Error ? error.message : "영향 미리보기를 계산하지 못했습니다.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function refreshSettings(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/rules`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "운영 규칙을 불러오지 못했습니다.");
      }

      setSettings(data.settings);
      setForm(toFormState(data.settings));

      if (showToast) {
        toast.success("운영 규칙을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "운영 규칙을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/rules`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examAnalysis: form.examAnalysis,
          tardyMinutes: form.tardyMinutes,
          assistantPastEditAllowed: form.assistantPastEditAllowed,
          assistantPastEditDays: form.assistantPastEditAllowed ? form.assistantPastEditDays : "0",
          warnLevel1: form.warnLevel1,
          warnLevel2: form.warnLevel2,
          warnInterview: form.warnInterview,
          warnWithdraw: form.warnWithdraw,
          warnMsgLevel1: form.warnMsgLevel1,
          warnMsgLevel2: form.warnMsgLevel2,
          warnMsgInterview: form.warnMsgInterview,
          warnMsgWithdraw: form.warnMsgWithdraw,
          holidayLimit: form.holidayLimit,
          halfDayLimit: form.halfDayLimit,
          healthLimit: form.healthLimit,
          holidayUnusedPts: form.holidayUnusedPts,
          halfDayUnusedPts: form.halfDayUnusedPts,
          tardyPointRuleId: form.tardyPointRuleId || null,
          absentPointRuleId: form.absentPointRuleId || null,
          perfectAttendancePtsEnabled: form.perfectAttendancePtsEnabled,
          perfectAttendancePts: form.perfectAttendancePtsEnabled ? form.perfectAttendancePts : "0",
          expirationWarningDays: form.expirationWarningDays,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "운영 규칙 저장에 실패했습니다.");
      }

      setSettings(data.settings);
      setForm(toFormState(data.settings));
      setPreview(null);
      await refreshHistory();
      toast.success("운영 규칙을 저장했습니다.");
      showActionComplete({
        title: "운영 규칙 저장 완료",
        description: "지각 기준, 경고 임계값, 허가 한도와 자동 상벌점 연결이 저장되었습니다.",
        notice: "저장한 규칙은 출석 처리, 경고 대상 집계, 외출/휴가 정산에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "운영 규칙 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const warningGap = asNumber(form.warnWithdraw) - asNumber(form.warnLevel1);
  const selectedTardyRule = pointRules.find((rule) => rule.id === form.tardyPointRuleId) ?? null;
  const selectedAbsentRule = pointRules.find((rule) => rule.id === form.absentPointRuleId) ?? null;

  return (
    <>
      <section className="admin-section">
        <h2 className="admin-section-title">벌점 집계 기준</h2>
        <p className="mt-2 text-sm text-slate-700">
          현재 경고 단계는 <strong>{aggregationLabel}</strong> 벌점으로 계산됩니다.
        </p>
        <p className="admin-help mt-1">{aggregationDescription}</p>
      </section>
      {policy && <section className="admin-section"><h2 className="admin-section-title">{policy.version} 적용 중</h2><p>월 상점·벌점은 상계하지 않습니다. 지각은 교시 시작 후부터 기록하고, 출결 벌점은 관리자 확인 후 확정합니다. 일일 일반 개근 상점은 적용하지 않습니다. 건강 인정사유는 확인 내용을 기록하여 승인하며 횟수 제한으로 차단하지 않습니다.</p><Link className="admin-button" href={`/${divisionSlug}/admin/settings/periods#optional-study`}>교시 설정·선택자습 신청</Link></section>}
      <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <section className="space-y-4">
        <article className="admin-section">
          <h2 className="admin-section-title">현재 운영 규칙 요약</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="admin-dashboard-metric" data-tone="accent">
              <p className="admin-dashboard-metric-label">지각</p>
              <p className="admin-dashboard-metric-value">{form.tardyMinutes}분</p>
              <p className="admin-help mt-2">지각 판정 기준</p>
            </div>
            <div className="admin-dashboard-metric">
              <p className="admin-dashboard-metric-label">경고</p>
              <p className="admin-dashboard-metric-value text-attend-tardy">{form.warnWithdraw}점</p>
              <p className="admin-help mt-2">퇴실 기준, 시작점 대비 {warningGap}점 차이</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">{policy ? "관리자 확정 출결 벌점" : "출결 자동 상벌점 규칙"}</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>
                  지각: {selectedTardyRule ? `${selectedTardyRule.name} (${selectedTardyRule.points}점)` : "연동 안 함"}
                </p>
                <p>
                  결석: {selectedAbsentRule ? `${selectedAbsentRule.name} (${selectedAbsentRule.points}점)` : "연동 안 함"}
                </p>
              </div>
            </article>
            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">조교 출석 수정 범위</p>
              <p className="admin-help mt-2">
                {form.assistantPastEditAllowed
                  ? `당일 포함 최근 ${form.assistantPastEditDays}일 이내 수정 허용`
                  : "당일만 수정 가능"}
              </p>
            </article>

            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">휴가/외출 한도</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <span>휴무권 {form.holidayLimit}회</span>
                <span>반휴권 {form.halfDayLimit}회</span>
                <span>{policy ? "병가: 증빙 확인 후 횟수 제한 없이 인정" : `건강휴무 ${form.healthLimit}회`}</span>
                <span>반휴 미사용 +{form.halfDayUnusedPts}점</span>
              </div>
            </article>

            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">개근 상점</p>
              <p className="admin-help mt-2">
                {form.perfectAttendancePtsEnabled
                  ? `활성 — 매일 개근 시 +${form.perfectAttendancePts}점 자동 부여`
                  : "비활성"}
              </p>
            </article>

            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">수강 만료 알림</p>
              <p className="admin-help mt-2">
                수강 종료 {form.expirationWarningDays}일 전부터 만료 임박 표시
              </p>
            </article>

            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">최근 저장</p>
              <p className="admin-help mt-2">
                {new Date(settings.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </p>
            </article>

            <article className="admin-section">
              <p className="text-sm font-semibold text-slate-900">경고 문자 템플릿</p>
              <p className="admin-help mt-2">
                변수: {"{학원명}"} {"{직렬명}"} {"{학생이름}"} {"{벌점}"} {"{경고단계}"}
              </p>
            </article>
          </div>
        </article>

        <article className="admin-section">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">주의</p>
              <p className="mt-2 text-sm leading-6 text-amber-900/85">
                경고 기준을 낮추면 기존 누적 벌점 학생이 즉시 경고 대상자로 올라갈 수 있습니다.
                저장 전에 경고 대상자 페이지에서 영향 범위를 다시 확인하는 편이 안전합니다.
              </p>
            </div>
          </div>
        </article>
        </section>

        <section className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">지각 기준 / 경고 임계값 / 허가 한도</h2>
          </div>

          <button
            type="button"
            onClick={() => refreshSettings(true)}
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
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">출석 기준</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">지각 기준 (분)</span>
                <input
                  type="number"
                  min={0}
                  max={180}
                  disabled={!!policy}
                  value={form.tardyMinutes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tardyMinutes: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                <span>
                  <span className="admin-label block">조교 과거 출석 수정 허용</span>
                  <span className="admin-help block">끄면 당일 출석만 수정 가능합니다.</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.assistantPastEditAllowed}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assistantPastEditAllowed: event.target.checked,
                      assistantPastEditDays: event.target.checked
                        ? current.assistantPastEditDays
                        : "0",
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="admin-label mb-2 block">과거 수정 허용 일수</span>
              <input
                type="number"
                min={0}
                max={30}
                disabled={!form.assistantPastEditAllowed}
                value={form.assistantPastEditAllowed ? form.assistantPastEditDays : "0"}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assistantPastEditDays: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:bg-slate-100"
                required
              />
            </label>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">{policy ? "지각 벌점 규칙 (관리자 확정)" : "지각 자동 부여 규칙"}</span>
                <select
                  disabled={!!policy}
                  value={form.tardyPointRuleId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tardyPointRuleId: event.target.value }))
                  }
                  className="w-full"
                >
                  <option value="">연동 안 함</option>
                  {pointRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} ({rule.points > 0 ? `+${rule.points}` : rule.points}점)
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">결석 자동 부여 규칙</span>
                <select
                  disabled={!!policy}
                  value={form.absentPointRuleId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, absentPointRuleId: event.target.value }))
                  }
                  className="w-full"
                >
                  <option value="">연동 안 함</option>
                  {pointRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} ({rule.points > 0 ? `+${rule.points}` : rule.points}점)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">경고 임계값</h3>
            <p className="admin-help mt-2">
              {policy ? "관리주의 < 정식면담 < 최종경고 < 이용종료 순서로 설정합니다." : "1차 < 2차 < 면담 < 퇴실 순서로 설정해야 합니다."}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WARNING_1 ?? "1차 경고"} 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnLevel1}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnLevel1: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WARNING_2 ?? "2차 경고"} 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnLevel2}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnLevel2: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.INTERVIEW ?? "면담 대상"} 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnInterview}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnInterview: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WITHDRAWAL ?? "퇴실 대상"} 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnWithdraw}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnWithdraw: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
            </div>

            <div className="mt-5 border-t border-admin-line-soft pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="admin-help">
                  저장하기 전에 이 기준이면 대상자가 몇 명이 되는지 확인할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => void runPreview()}
                  disabled={isPreviewing}
                  className="admin-button"
                >
                  {isPreviewing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="h-4 w-4" />
                  )}
                  영향 확인
                </button>
              </div>

              {preview ? (
                <div className="admin-table-frame mt-4 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th>단계</th>
                        <th>현재 기준</th>
                        <th>입력 기준</th>
                        <th>변화</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.stages.map((stage) => {
                        const delta = stage.next - stage.current;

                        return (
                          <tr key={stage.stage}>
                            <td>{stage.label}</td>
                            <td className="tabular-nums">{stage.current}명</td>
                            <td className="tabular-nums font-semibold">{stage.next}명</td>
                            <td
                              className={`tabular-nums ${delta === 0 ? "text-slate-500" : delta > 0 ? "text-admin-danger" : "text-emerald-600"}`}
                            >
                              {delta === 0 ? "변화 없음" : delta > 0 ? `+${delta}명` : `${delta}명`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="font-semibold">경고 대상 합계</td>
                        <td className="tabular-nums">{preview.currentTotal}명</td>
                        <td className="tabular-nums font-semibold">{preview.nextTotal}명</td>
                        <td className="admin-help">운영 학생 {preview.totalStudents}명 기준</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">외출/휴가 한도</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">휴무권 월 한도</span>
                <input
                  type="number"
                  min={0}
                  value={form.holidayLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, holidayLimit: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">반휴권 월 한도</span>
                <input
                  type="number"
                  min={0}
                  value={form.halfDayLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, halfDayLimit: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy ? "병가 인정 기준" : "건강휴무 월 한도"}</span>
                {policy ? <p className="admin-help">확인 가능한 증빙과 사유를 기록하여 승인합니다. 월 횟수 제한과 휴일권 차감을 적용하지 않습니다.</p> : <input
                  type="number"
                  min={0}
                  disabled={!!policy}
                  value={form.healthLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, healthLimit: event.target.value }))
                  }
                  className="w-full"
                  required
                />}
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">휴무권 미사용 상점</span>
                <input
                  type="number"
                  min={0}
                  value={form.holidayUnusedPts}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, holidayUnusedPts: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
              <label className="block md:col-span-2">
                <span className="admin-label mb-2 block">반휴권 미사용 상점</span>
                <input
                  type="number"
                  min={0}
                  value={form.halfDayUnusedPts}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, halfDayUnusedPts: event.target.value }))
                  }
                  className="w-full"
                  required
                />
              </label>
            </div>
          </div>

          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">개근 상점</h3>
            <p className="admin-help mt-2">
              {policy ? "일일 일반 출석 개근 상점은 적용하지 않습니다. 아침모의고사 한 달 개근은 결과 확인 후 상벌점 메뉴에서 부여합니다." : "당일 모든 필수 교시에 출석한 학생에게 자동으로 상점을 부여합니다."}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                <span>
                  <span className="admin-label block">개근 상점 자동 부여</span>
                  <span className="admin-help block">끄면 개근 시에도 상점이 부여되지 않습니다.</span>
                </span>
                <input
                  type="checkbox"
                  disabled={!!policy}
                  checked={form.perfectAttendancePtsEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      perfectAttendancePtsEnabled: event.target.checked,
                      perfectAttendancePts: event.target.checked
                        ? current.perfectAttendancePts
                        : "0",
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">개근 시 부여 상점</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!form.perfectAttendancePtsEnabled}
                  value={form.perfectAttendancePtsEnabled ? form.perfectAttendancePts : "0"}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, perfectAttendancePts: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:bg-slate-100"
                  required
                />
              </label>
            </div>
          </div>

          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">수강 만료 알림</h3>
            <p className="admin-help mt-2">
              수강 종료일이 지정된 학생에 대해, 종료일로부터 며칠 전부터 만료 임박 알림을 표시할지 설정합니다.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">만료 알림 시작 일수</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={form.expirationWarningDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expirationWarningDays: event.target.value }))
                  }
                  className="w-full"
                  required
                />
                <span className="admin-help mt-1.5 block">
                  예: 14일로 설정하면, 수강 종료 14일 전부터 대시보드에 만료 임박으로 표시됩니다.
                </span>
              </label>
            </div>
          </div>

          <div className="admin-section">
            <h3 className="text-sm font-semibold text-slate-900">경고 문자 템플릿</h3>
            <p className="admin-help mt-2 leading-6">
              사용 가능 변수: {"{학원명}"} {"{직렬명}"} {"{학생이름}"} {"{벌점}"} {"{경고단계}"}
            </p>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WARNING_1 ?? "1차 경고"} 문자</span>
                <textarea
                  value={form.warnMsgLevel1}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgLevel1: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WARNING_2 ?? "2차 경고"} 문자</span>
                <textarea
                  value={form.warnMsgLevel2}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgLevel2: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.INTERVIEW ?? "면담"} 문자</span>
                <textarea
                  value={form.warnMsgInterview}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgInterview: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  required
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">{policy?.warningLabels.WITHDRAWAL ?? "퇴실"} 문자</span>
                <textarea
                  value={form.warnMsgWithdraw}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgWithdraw: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  required
                />
              </label>
            </div>
          </div>

          <section className="admin-section">
            <h3 className="admin-section-title">성적 분석 기준</h3>
            <p className="admin-help mt-2">점수 차이는 만점 대비 비율입니다. 분석 기능에서 사용할 기준을 저장합니다.</p>
            <h4 className="admin-label mt-4">아침 모의고사</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">연속 하락 횟수 (회)</span>
                <input className="w-full" type="number" required min={2} max={10} step={1}
                  value={Number.isFinite(form.examAnalysis.morning.consecutiveDrops) ? form.examAnalysis.morning.consecutiveDrops : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, consecutiveDrops: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">점수가 연속으로 내려간 횟수가 이 기준 이상이면 하락 신호로 표시합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">반 평균 대비 격차 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.morning.classGapPercent) ? form.examAnalysis.morning.classGapPercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, classGapPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">반 평균보다 낮은 점수 차이를 만점 대비 비율로 판단합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">본인 평균 대비 하락 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.morning.ownAverageDropPercent) ? form.examAnalysis.morning.ownAverageDropPercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, ownAverageDropPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">최근 평균이 이전 평균보다 낮아진 정도를 만점 대비 비율로 판단합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">이동평균 응시 횟수 (회)</span>
                <input className="w-full" type="number" required min={2} max={20} step={1}
                  value={Number.isFinite(form.examAnalysis.morning.movingAverageSessions) ? form.examAnalysis.morning.movingAverageSessions : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, movingAverageSessions: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">같은 과목에 최근 응시한 횟수만큼 평균을 냅니다. 미응시는 제외합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">추세 응시 횟수 (회)</span>
                <input className="w-full" type="number" required min={3} max={40} step={1}
                  value={Number.isFinite(form.examAnalysis.morning.trendWindowSessions) ? form.examAnalysis.morning.trendWindowSessions : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, trendWindowSessions: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">같은 과목의 추세를 분석할 응시 횟수이며 이동평균 응시 횟수 이상으로 설정합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">추세 해석 최소 응시율 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.morning.attendanceRatePercent) ? form.examAnalysis.morning.attendanceRatePercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    morning: { ...current.examAnalysis.morning, attendanceRatePercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">이 응시율에 미달하면 성적 추세 해석을 보류합니다.</span>
              </label>
            </div>
            <h4 className="admin-label mt-4">정기 모의고사</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">총점 하락 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.regular.totalDropPercent) ? form.examAnalysis.regular.totalDropPercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    regular: { ...current.examAnalysis.regular, totalDropPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">이전 회차보다 총점이 내려간 정도를 만점 대비 비율로 판단합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">반 인원 대비 석차 하락 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.regular.rankDropPercent) ? form.examAnalysis.regular.rankDropPercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    regular: { ...current.examAnalysis.regular, rankDropPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">반 전체 인원 대비 석차 하락 폭이 이 비율 이상이면 표시합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">목표 대비 미달 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.regular.targetGapPercent) ? form.examAnalysis.regular.targetGapPercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    regular: { ...current.examAnalysis.regular, targetGapPercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">목표 점수에 못 미치는 차이를 만점 대비 비율로 판단합니다.</span>
              </label>
            </div>
            <h4 className="admin-label mt-4">공통 문항·과목 기준</h4>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">취약 과목 성취율 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.common.weakSubjectRatePercent) ? form.examAnalysis.common.weakSubjectRatePercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    common: { ...current.examAnalysis.common, weakSubjectRatePercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">과목 만점 대비 성취율이 이 기준 미만이면 취약 과목으로 표시합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">과목 불균형 표준편차</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.common.balanceStdDev) ? form.examAnalysis.common.balanceStdDev : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    common: { ...current.examAnalysis.common, balanceStdDev: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">과목별 정규화 점수의 표준편차가 이 기준 이상이면 불균형으로 판단합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">쉬운 문항 정답률 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.common.easyMissedRatePercent) ? form.examAnalysis.common.easyMissedRatePercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    common: { ...current.examAnalysis.common, easyMissedRatePercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">정답률이 이 기준 이상인 문항을 틀리면 쉬운 문항 오답으로 표시합니다.</span>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">고난도 문항 정답률 (%)</span>
                <input className="w-full" type="number" required min={0} max={100} step={0.1}
                  value={Number.isFinite(form.examAnalysis.common.killerRatePercent) ? form.examAnalysis.common.killerRatePercent : ""}
                  onChange={(event) => setForm((current) => ({ ...current, examAnalysis: { ...current.examAnalysis,
                    common: { ...current.examAnalysis.common, killerRatePercent: event.target.value === "" ? Number.NaN : Number(event.target.value) },
                  } }))} />
                <span className="admin-help mt-2 block">정답률이 이 기준 이하인 문항을 고난도 문항으로 분류합니다.</span>
              </label>
            </div>
          </section>

          <button
            type="submit"
            disabled={isSaving}
            className="admin-button admin-button-primary"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            운영 규칙 저장
          </button>
        </form>
        </section>
      </div>
      <SettingsHistoryList history={history} />
      {actionCompleteModal}
    </>
  );
}
