"use client";

import { type FormEvent, useState } from "react";
import { LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  DIVISION_FEATURES,
  type DivisionFeatureFlags,
} from "@/lib/division-features";
import type { DivisionFeatureSettings } from "@/lib/services/settings.service";

type FeatureSettingsManagerProps = {
  divisionSlug: string;
  initialSettings: DivisionFeatureSettings;
};

function countEnabledFlags(featureFlags: DivisionFeatureFlags) {
  return DIVISION_FEATURES.filter(({ key }) => featureFlags[key]).length;
}

export function FeatureSettingsManager({
  divisionSlug,
  initialSettings,
}: FeatureSettingsManagerProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [featureFlags, setFeatureFlags] = useState(initialSettings.featureFlags);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const enabledCount = countEnabledFlags(featureFlags);
  const disabledCount = DIVISION_FEATURES.length - enabledCount;

  async function refreshSettings(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/features`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "기능 설정을 불러오지 못했습니다.");
      }

      setSettings(data.settings);
      setFeatureFlags(data.settings.featureFlags);

      if (showToast) {
        toast.success("기능 설정을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "기능 설정을 불러오지 못했습니다.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/settings/features`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          featureFlags,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "기능 설정 저장에 실패했습니다.");
      }

      setSettings(data.settings);
      setFeatureFlags(data.settings.featureFlags);
      router.refresh();
      toast.success("기능 설정을 저장했습니다.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "기능 설정 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="rounded-[10px] bg-slate-950 p-5 text-white">
          <p className="text-xs uppercase tracking-[0.24em] text-white/65">
            기능 요약
          </p>
          <h2 className="mt-3 text-3xl font-extrabold">
            {enabledCount}개 기능 사용 중
          </h2>
          <p className="mt-2 text-sm text-white/75">
            비활성 기능 {disabledCount}개는 해당 지점 관리자 화면과 주요 진입 경로에서
            함께 숨겨집니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              활성 {enabledCount}개
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              비활성 {disabledCount}개
            </span>
          </div>
        </div>

        <div className="mt-5 rounded-[10px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">적용 방식</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>비활성 기능은 관리자 사이드바와 설정 허브에서 함께 숨겨집니다.</li>
            <li>주요 관리자 페이지에 직접 접근해도 기능 설정 페이지로 이동합니다.</li>
            <li>설정은 현재 지점에만 적용되고 다른 지점에는 영향을 주지 않습니다.</li>
          </ul>
        </div>

        <article className="mt-5 rounded-[10px] border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">최종 저장</p>
          <p className="mt-2 text-sm text-slate-600">
            {new Date(settings.updatedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>
        </article>
      </section>

      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              설정 / 기능
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              지점 기능 설정
            </h2>
          </div>

          <button
            type="button"
            onClick={() => refreshSettings(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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
          <div className="grid gap-3 md:grid-cols-2">
            {DIVISION_FEATURES.map((feature) => {
              const enabled = featureFlags[feature.key];

              return (
                <label
                  key={feature.key}
                  className={`flex items-start justify-between gap-4 rounded-[10px] border px-4 py-4 transition ${
                    enabled
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {feature.label}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      {feature.description}
                    </span>
                  </span>
                  <span className="shrink-0">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) =>
                        setFeatureFlags((current) => ({
                          ...current,
                          [feature.key]: event.target.checked,
                        }))
                      }
                      className="h-5 w-5 rounded border-slate-300"
                    />
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              저장 후 화면을 새로고침하면 비활성 기능 메뉴와 화면이 자동으로 정리됩니다.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              기능 설정 저장
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
