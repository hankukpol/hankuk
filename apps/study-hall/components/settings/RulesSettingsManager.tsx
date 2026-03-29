"use client";

import { AlertTriangle, LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { DivisionRuleSettings } from "@/lib/services/settings.service";

type RulesSettingsManagerProps = {
  divisionSlug: string;
  initialSettings: DivisionRuleSettings;
};

type FormState = {
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
  perfectAttendancePtsEnabled: boolean;
  perfectAttendancePts: string;
  expirationWarningDays: string;
};

function toFormState(settings: DivisionRuleSettings): FormState {
  return {
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
}: RulesSettingsManagerProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<FormState>(toFormState(initialSettings));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      toast.success("운영 규칙을 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "운영 규칙 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  const warningGap = asNumber(form.warnWithdraw) - asNumber(form.warnLevel1);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
      <section className="space-y-4">
        <article className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            설정 / 운영 규칙
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">현재 운영 규칙 요약</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] bg-[var(--division-color)] p-4 text-white">
              <p className="text-xs uppercase tracking-[0.22em] text-white/60">지각</p>
              <p className="mt-3 text-3xl font-extrabold">{form.tardyMinutes}분</p>
              <p className="mt-2 text-sm text-white/70">지각 판정 기준</p>
            </div>
            <div className="rounded-[10px] bg-white p-4 text-amber-900">
              <p className="text-xs uppercase tracking-[0.22em] text-amber-700">경고</p>
              <p className="mt-3 text-3xl font-extrabold">{form.warnWithdraw}점</p>
              <p className="mt-2 text-sm text-amber-800">퇴실 기준, 시작점 대비 {warningGap}점 차이</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">조교 출석 수정 범위</p>
              <p className="mt-2 text-sm text-slate-600">
                {form.assistantPastEditAllowed
                  ? `당일 포함 최근 ${form.assistantPastEditDays}일 이내 수정 허용`
                  : "당일만 수정 가능"}
              </p>
            </article>

            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">휴가/외출 한도</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <span>휴무권 {form.holidayLimit}회</span>
                <span>반휴권 {form.halfDayLimit}회</span>
                <span>건강휴무 {form.healthLimit}회</span>
                <span>반휴 미사용 +{form.halfDayUnusedPts}점</span>
              </div>
            </article>

            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">개근 상점</p>
              <p className="mt-2 text-sm text-slate-600">
                {form.perfectAttendancePtsEnabled
                  ? `활성 — 매일 개근 시 +${form.perfectAttendancePts}점 자동 부여`
                  : "비활성"}
              </p>
            </article>

            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">수강 만료 알림</p>
              <p className="mt-2 text-sm text-slate-600">
                수강 종료 {form.expirationWarningDays}일 전부터 만료 임박 표시
              </p>
            </article>

            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">최근 저장</p>
              <p className="mt-2 text-sm text-slate-600">
                {new Date(settings.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
              </p>
            </article>

            <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">경고 문자 템플릿</p>
              <p className="mt-2 text-sm text-slate-600">
                변수: {"{학원명}"} {"{직렬명}"} {"{학생이름}"} {"{벌점}"} {"{경고단계}"}
              </p>
            </article>
          </div>
        </article>

        <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5">
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

      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              규칙 편집
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">지각 기준 / 경고 임계값 / 허가 한도</h2>
          </div>

          <button
            type="button"
            onClick={() => refreshSettings(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">출석 기준</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">지각 기준 (분)</span>
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={form.tardyMinutes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tardyMinutes: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>

              <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-slate-800">조교 과거 출석 수정 허용</span>
                  <span className="block text-xs text-slate-500">끄면 당일 출석만 수정 가능합니다.</span>
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
              <span className="mb-2 block text-sm font-medium text-slate-700">과거 수정 허용 일수</span>
              <input
                type="number"
                min={0}
                max={30}
                disabled={!form.assistantPastEditAllowed}
                value={form.assistantPastEditAllowed ? form.assistantPastEditDays : "0"}
                onChange={(event) =>
                  setForm((current) => ({ ...current, assistantPastEditDays: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                required
              />
            </label>
          </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">경고 임계값</h3>
            <p className="mt-2 text-sm text-slate-600">
              1차 &lt; 2차 &lt; 면담 &lt; 퇴실 순서로 설정해야 합니다.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">1차 경고 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnLevel1}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnLevel1: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">2차 경고 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnLevel2}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnLevel2: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">면담 대상 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnInterview}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnInterview: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">퇴실 대상 기준 벌점</span>
                <input
                  type="number"
                  min={0}
                  value={form.warnWithdraw}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnWithdraw: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">외출/휴가 한도</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">휴무권 월 한도</span>
                <input
                  type="number"
                  min={0}
                  value={form.holidayLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, holidayLimit: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">반휴권 월 한도</span>
                <input
                  type="number"
                  min={0}
                  value={form.halfDayLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, halfDayLimit: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">건강휴무 월 한도</span>
                <input
                  type="number"
                  min={0}
                  value={form.healthLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, healthLimit: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">휴무권 미사용 상점</span>
                <input
                  type="number"
                  min={0}
                  value={form.holidayUnusedPts}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, holidayUnusedPts: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">반휴권 미사용 상점</span>
                <input
                  type="number"
                  min={0}
                  value={form.halfDayUnusedPts}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, halfDayUnusedPts: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">개근 상점</h3>
            <p className="mt-2 text-sm text-slate-600">
              당일 모든 필수 교시에 출석한 학생에게 자동으로 상점을 부여합니다.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-slate-800">개근 상점 자동 부여</span>
                  <span className="block text-xs text-slate-500">끄면 개근 시에도 상점이 부여되지 않습니다.</span>
                </span>
                <input
                  type="checkbox"
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
                <span className="mb-2 block text-sm font-medium text-slate-700">개근 시 부여 상점</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={!form.perfectAttendancePtsEnabled}
                  value={form.perfectAttendancePtsEnabled ? form.perfectAttendancePts : "0"}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, perfectAttendancePts: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                  required
                />
              </label>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">수강 만료 알림</h3>
            <p className="mt-2 text-sm text-slate-600">
              수강 종료일이 지정된 학생에 대해, 종료일로부터 며칠 전부터 만료 임박 알림을 표시할지 설정합니다.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">만료 알림 시작 일수</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={form.expirationWarningDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expirationWarningDays: event.target.value }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
                <span className="mt-1.5 block text-xs text-slate-500">
                  예: 14일로 설정하면, 수강 종료 14일 전부터 대시보드에 만료 임박으로 표시됩니다.
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">경고 문자 템플릿</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              사용 가능 변수: {"{학원명}"} {"{직렬명}"} {"{학생이름}"} {"{벌점}"} {"{경고단계}"}
            </p>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">1차 경고 문자</span>
                <textarea
                  value={form.warnMsgLevel1}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgLevel1: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">2차 경고 문자</span>
                <textarea
                  value={form.warnMsgLevel2}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgLevel2: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">면담 문자</span>
                <textarea
                  value={form.warnMsgInterview}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgInterview: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">퇴실 문자</span>
                <textarea
                  value={form.warnMsgWithdraw}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warnMsgWithdraw: event.target.value }))
                  }
                  className="min-h-[110px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  required
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            운영 규칙 저장
          </button>
        </form>
      </section>
    </div>
  );
}
