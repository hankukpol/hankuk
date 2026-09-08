"use client";

import { LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import {
  OPERATING_DAY_KEYS,
  OPERATING_DAY_LABELS,
  type OperatingDays,
} from "@/lib/settings-schemas";
import type { DivisionGeneralSettings } from "@/lib/services/settings.service";

type GeneralSettingsManagerProps = {
  divisionSlug: string;
  initialSettings: DivisionGeneralSettings;
};

type FormState = {
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  operatingDays: OperatingDays;
  studyTracksText: string;
};

function toStudyTracksText(studyTracks: string[]) {
  return studyTracks.join("\n");
}

function parseStudyTracksText(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

function toFormState(settings: DivisionGeneralSettings): FormState {
  return {
    name: settings.name,
    fullName: settings.fullName,
    color: settings.color,
    isActive: settings.isActive,
    operatingDays: settings.operatingDays,
    studyTracksText: toStudyTracksText(settings.studyTracks),
  };
}

export function GeneralSettingsManager({
  divisionSlug,
  initialSettings,
}: GeneralSettingsManagerProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<FormState>(toFormState(initialSettings));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();

  const activeDayCount = OPERATING_DAY_KEYS.filter((key) => form.operatingDays[key]).length;
  const studyTracks = parseStudyTracksText(form.studyTracksText);

  async function refreshSettings(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/general`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "기본 정보를 불러오지 못했습니다.");
      }

      setSettings(data.settings);
      setForm(toFormState(data.settings));

      if (showToast) {
        toast.success("기본 정보를 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "기본 정보를 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/general`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          studyTracks,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "기본 정보 저장에 실패했습니다.");
      }

      setSettings(data.settings);
      setForm(toFormState(data.settings));
      router.refresh();
      toast.success("기본 정보를 저장했습니다.");
      showActionComplete({
        title: "기본 정보 저장 완료",
        description: "지점 기본 정보와 운영 요일, 직렬 설정이 저장되었습니다.",
        notice: "저장한 기본 정보는 관리자 화면과 학생/운영 화면에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "기본 정보 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="admin-section">
        {/* DESIGN.md 5.3 — 지점 색은 색면이 아니라 표식으로만 보여준다. */}
        <div className="admin-metric-box">
          <p className="admin-metric-box-label">지점 미리보기</p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="h-8 w-8 shrink-0 rounded-lg border border-admin-line"
              style={{ backgroundColor: form.color }}
              aria-hidden
            />
            <div className="min-w-0 text-left">
              <p className="text-[16px] font-bold text-admin-text">
                {form.name || "지점 이름"}
              </p>
              <p className="admin-help">{form.fullName || "학원 전체 이름"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="admin-badge">{form.isActive ? "운영 중" : "비활성"}</span>
            <span className="admin-badge">운영 요일 {activeDayCount}일</span>
            <span className="admin-badge">직렬 {studyTracks.length}개</span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <article className="admin-section">
            <p className="text-sm font-semibold text-slate-900">운영 요일</p>
            <p className="admin-help mt-2">현재 {activeDayCount}일 운영 중입니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OPERATING_DAY_KEYS.map((key) => (
                <span
                  key={key}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${ form.operatingDays[key] ? "bg-admin-accent text-white" : "bg-slate-200 text-slate-500" }`}
                >
                  {OPERATING_DAY_LABELS[key]}
                </span>
              ))}
            </div>
          </article>

          <article className="admin-section">
            <p className="text-sm font-semibold text-slate-900">직렬 목록 미리보기</p>
            <p className="admin-help mt-2">
              학생 등록과 목록 필터에서 이 직렬 목록을 기준으로 사용합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {studyTracks.length > 0 ? (
                studyTracks.map((track) => (
                  <span
                    key={track}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {track}
                  </span>
                ))
              ) : (
                <span className="admin-help">등록된 직렬이 없습니다.</span>
              )}
            </div>
          </article>

          <article className="admin-section">
            <p className="text-sm font-semibold text-slate-900">최종 저장</p>
            <p className="admin-help mt-2">
              {new Date(settings.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
            </p>
          </article>
        </div>
        </section>

        <section className="admin-section">
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="admin-label mb-2 block">지점 이름</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full"
                placeholder="예: 경찰"
                required
              />
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">브랜드 색상</span>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-10 w-14 rounded-lg border border-slate-200 bg-white"
                />
                <input
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-sm"
                  placeholder="#1B4FBB"
                  required
                />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="admin-label mb-2 block">학원 전체 이름</span>
            <input
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              className="w-full"
              placeholder="예: 시간통제 경찰학원"
              required
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-4">
            <span>
              <span className="admin-label block">지점 활성 상태</span>
              <span className="admin-help block">
                비활성화해도 기존 데이터는 유지되고 신규 운영 대상에서만 제외됩니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.checked }))
              }
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="admin-section">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">운영 요일</p>
                <p className="admin-help mt-1">
                  출석 계산과 학생 포털 캘린더에서 사용하는 운영 요일입니다.
                </p>
              </div>
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                주 {activeDayCount}일 운영
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {OPERATING_DAY_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-white bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {OPERATING_DAY_LABELS[key]}요일
                  </span>
                  <input
                    type="checkbox"
                    checked={form.operatingDays[key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        operatingDays: {
                          ...current.operatingDays,
                          [key]: event.target.checked,
                        },
                      }))
                    }
                    className="h-5 w-5 rounded border-slate-300"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block rounded-lg border border-slate-200 bg-white p-4">
            <span className="block text-sm font-semibold text-slate-900">직렬 목록</span>
            <span className="admin-help mt-1 block leading-6">
              학생 등록 시 선택할 직렬 목록입니다. 한 줄에 하나씩 입력하면 됩니다.
              올패스독학원과 한경스파르타처럼 여러 직렬이 섞인 지점은 여기서 자유롭게 확장할 수 있습니다.
            </span>
            <textarea
              value={form.studyTracksText}
              onChange={(event) =>
                setForm((current) => ({ ...current, studyTracksText: event.target.value }))
              }
              className="mt-4 min-h-[180px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
              placeholder={`예:\n경찰\n소방\n9급공무원\n행정직`}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {studyTracks.length > 0 ? (
                studyTracks.map((track) => (
                  <span
                    key={track}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {track}
                  </span>
                ))
              ) : (
                <span className="admin-help">등록된 직렬이 없습니다.</span>
              )}
            </div>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="admin-button admin-button-primary"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            기본 정보 저장
          </button>
        </form>
        </section>
      </div>
      {actionCompleteModal}
    </>
  );
}
