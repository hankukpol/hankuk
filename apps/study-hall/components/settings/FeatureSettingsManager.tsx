"use client";

import { type FormEvent, useState } from "react";
import { LoaderCircle, RefreshCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
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
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();

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
      showActionComplete({
        title: "기능 설정 저장 완료",
        description: "지점 기능 on/off 설정이 저장되었습니다.",
        notice: "비활성화한 기능은 관리자 메뉴와 관련 화면에서 자동으로 숨겨집니다.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "기능 설정 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="admin-section">
        {/* DESIGN.md 5.3 — 색면 카드 대신 선으로 구분한 요약 박스 */}
        <div className="admin-metric-box">
          <p className="admin-metric-box-label">기능 요약</p>
          <p className="admin-metric-box-value">{enabledCount}개 기능 사용 중</p>
          <p className="admin-help mt-2">
            비활성 기능 {disabledCount}개는 해당 지점 관리자 화면과 주요 진입 경로에서 함께
            숨겨집니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="admin-badge">활성 {enabledCount}개</span>
            <span className="admin-badge">비활성 {disabledCount}개</span>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">적용 방식</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>비활성 기능은 관리자 사이드바와 설정 허브에서 함께 숨겨집니다.</li>
            <li>주요 관리자 페이지에 직접 접근해도 기능 설정 페이지로 이동합니다.</li>
            <li>설정은 현재 지점에만 적용되고 다른 지점에는 영향을 주지 않습니다.</li>
          </ul>
        </div>

        <article className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">최종 저장</p>
          <p className="admin-help mt-2">
            {new Date(settings.updatedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
          </p>
        </article>
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
          <div className="grid gap-3 md:grid-cols-2">
            {DIVISION_FEATURES.map((feature) => {
              const enabled = featureFlags[feature.key];

              return (
                <label
                  key={feature.key}
                  className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-4 transition ${ enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50" }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">
                      {feature.label}
                    </span>
                    <span className="admin-help mt-1 block leading-6">
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
            <p className="admin-help">
              저장 후 화면을 새로고침하면 비활성 기능 메뉴와 화면이 자동으로 정리됩니다.
            </p>
            <button
              type="submit"
              disabled={isSaving}
              className="admin-button admin-button-primary"
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
      {actionCompleteModal}
    </>
  );
}
