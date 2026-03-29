"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  asBoolean,
  asNumber,
  asString,
  normalizeMode,
  normalizeProfile,
  type SettingValue,
} from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";
import SiteSettingsSectionDisabledState from "../_components/SiteSettingsSectionDisabledState";

export default function AdminSiteAutoPassCutTabPage() {
  const {
    settings,
    updateSetting,
    sectionEnabled,
    isLoading,
    isSaving,
    notice,
    handleSave,
    modalProps,
  } = useSiteSettingsManager({
    section: "auto-pass-cut",
    loadErrorMessage: "자동 합격컷 설정을 불러오지 못했습니다.",
    saveErrorMessage: "자동 합격컷 설정 저장에 실패했습니다.",
    successMessage: "자동 합격컷 설정이 저장되었습니다.",
    confirmTitle: "자동 합격컷 설정 저장",
    confirmDescription: "자동 합격컷 정책을 저장하시겠습니까?",
    buildPayload: (currentSettings) => {
      const autoPassCutCheckIntervalSec = Math.floor(
        asNumber(currentSettings["site.autoPassCutCheckIntervalSec"], 300)
      );

      if (!Number.isFinite(autoPassCutCheckIntervalSec) || autoPassCutCheckIntervalSec < 30) {
        throw new Error("자동 합격컷 체크 주기는 30초 이상이어야 합니다.");
      }

      return {
        "site.autoPassCutEnabled": asBoolean(
          currentSettings["site.autoPassCutEnabled"],
          false
        ),
        "site.autoPassCutMode": normalizeMode(
          asString(currentSettings["site.autoPassCutMode"], "HYBRID")
        ),
        "site.autoPassCutCheckIntervalSec": autoPassCutCheckIntervalSec,
        "site.autoPassCutThresholdProfile": normalizeProfile(
          asString(currentSettings["site.autoPassCutThresholdProfile"], "BALANCED")
        ),
        "site.autoPassCutReadyRatioProfile": normalizeProfile(
          asString(currentSettings["site.autoPassCutReadyRatioProfile"], "BALANCED")
        ),
      } satisfies Record<string, SettingValue>;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-slate-600">자동 합격컷 설정을 불러오는 중입니다...</p>;
  }

  if (!sectionEnabled) {
    return (
      <SiteSettingsSectionDisabledState
        title="자동 합격컷 설정이 비활성화되었습니다."
        description="이 지점에서는 자동 합격컷 발표 정책을 여기서 직접 수정할 수 없도록 잠겨 있습니다."
      />
    );
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="자동 합격컷 설정"
        description="자동 발표 모드, 체크 주기, 임계치 프로필을 한 번에 관리합니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "자동 합격컷 설정 저장"}
          </Button>
        }
      >
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={asBoolean(settings["site.autoPassCutEnabled"], false)}
            onChange={(event) => updateSetting("site.autoPassCutEnabled", event.target.checked)}
          />
          자동 발표 사용
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="auto-pass-cut-mode">동작 모드</Label>
            <select
              id="auto-pass-cut-mode"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={asString(settings["site.autoPassCutMode"], "HYBRID")}
              onChange={(event) => updateSetting("site.autoPassCutMode", event.target.value)}
            >
              <option value="HYBRID">HYBRID</option>
              <option value="TRAFFIC_ONLY">TRAFFIC_ONLY</option>
              <option value="CRON_ONLY">CRON_ONLY</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-pass-cut-interval">체크 주기 (초)</Label>
            <Input
              id="auto-pass-cut-interval"
              type="number"
              min={30}
              value={String(asNumber(settings["site.autoPassCutCheckIntervalSec"], 300))}
              onChange={(event) =>
                updateSetting("site.autoPassCutCheckIntervalSec", event.target.value)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-pass-cut-threshold-profile">참여자 수 임계치 프로필</Label>
            <select
              id="auto-pass-cut-threshold-profile"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={asString(settings["site.autoPassCutThresholdProfile"], "BALANCED")}
              onChange={(event) =>
                updateSetting("site.autoPassCutThresholdProfile", event.target.value)
              }
            >
              <option value="BALANCED">BALANCED</option>
              <option value="CONSERVATIVE">CONSERVATIVE</option>
              <option value="AGGRESSIVE">AGGRESSIVE</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auto-pass-cut-ready-ratio-profile">준비 비율 임계치 프로필</Label>
            <select
              id="auto-pass-cut-ready-ratio-profile"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={asString(settings["site.autoPassCutReadyRatioProfile"], "BALANCED")}
              onChange={(event) =>
                updateSetting("site.autoPassCutReadyRatioProfile", event.target.value)
              }
            >
              <option value="BALANCED">BALANCED</option>
              <option value="CONSERVATIVE">CONSERVATIVE</option>
              <option value="AGGRESSIVE">AGGRESSIVE</option>
            </select>
          </div>
        </div>
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
