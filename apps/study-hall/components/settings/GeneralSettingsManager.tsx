"use client";

import { LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/lib/sonner";

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "기본 정보 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div
          className="rounded-[10px] p-5 text-white"
          style={{
            backgroundColor: `${form.color}`,
          }}
        >
          <p className="text-xs uppercase tracking-[0.24em] text-white/70">지점 미리보기</p>
          <h2 className="mt-3 text-3xl font-extrabold">{form.name || "지점 이름"}</h2>
          <p className="mt-2 text-sm text-white/80">{form.fullName || "학원 전체 이름"}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1.5">
              {form.isActive ? "운영 중" : "비활성"}
            </span>
            <span className="rounded-full bg-white/15 px-3 py-1.5">운영 요일 {activeDayCount}일</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5">직렬 {studyTracks.length}개</span>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">운영 요일</p>
            <p className="mt-2 text-sm text-slate-600">현재 {activeDayCount}일 운영 중입니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OPERATING_DAY_KEYS.map((key) => (
                <span
                  key={key}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    form.operatingDays[key]
                      ? "bg-slate-950 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {OPERATING_DAY_LABELS[key]}
                </span>
              ))}
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">직렬 목록 미리보기</p>
            <p className="mt-2 text-sm text-slate-600">
              학생 등록과 목록 필터에서 이 직렬 목록을 기준으로 사용합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {studyTracks.length > 0 ? (
                studyTracks.map((track) => (
                  <span
                    key={track}
                    className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {track}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">등록된 직렬이 없습니다.</span>
              )}
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">최종 저장</p>
            <p className="mt-2 text-sm text-slate-600">
              {new Date(settings.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              설정 / 일반
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">지점 기본 정보</h2>
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">지점 이름</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 경찰"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">브랜드 색상</span>
              <div className="flex items-center gap-3 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-10 w-14 rounded-[10px] border border-slate-200-slate-200 bg-white"
                />
                <input
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  placeholder="#1B4FBB"
                  required
                />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">학원 전체 이름</span>
            <input
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 시간통제 경찰학원"
              required
            />
          </label>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
            <span>
              <span className="block text-sm font-medium text-slate-800">지점 활성 상태</span>
              <span className="block text-xs text-slate-500">
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

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">운영 요일</p>
                <p className="mt-1 text-sm text-slate-600">
                  출석 계산과 학생 포털 캘린더에서 사용하는 운영 요일입니다.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                주 {activeDayCount}일 운영
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {OPERATING_DAY_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-[10px] border border-slate-200-white bg-white px-4 py-3"
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

          <label className="block rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <span className="block text-sm font-semibold text-slate-900">직렬 목록</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              학생 등록 시 선택할 직렬 목록입니다. 한 줄에 하나씩 입력하면 됩니다.
              올패스독학원과 한경스파르타처럼 여러 직렬이 섞인 지점은 여기서 자유롭게 확장할 수 있습니다.
            </span>
            <textarea
              value={form.studyTracksText}
              onChange={(event) =>
                setForm((current) => ({ ...current, studyTracksText: event.target.value }))
              }
              className="mt-4 min-h-[180px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder={`예:\n경찰\n소방\n9급공무원\n행정직`}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {studyTracks.length > 0 ? (
                studyTracks.map((track) => (
                  <span
                    key={track}
                    className="rounded-full border border-slate-200-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {track}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">등록된 직렬이 없습니다.</span>
              )}
            </div>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            기본 정보 저장
          </button>
        </form>
      </section>
    </div>
  );
}
