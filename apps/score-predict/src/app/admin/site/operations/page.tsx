"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  asBoolean,
  asNumber,
  asString,
  type SettingValue,
} from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";
import SiteSettingsSectionDisabledState from "../_components/SiteSettingsSectionDisabledState";

export default function AdminSiteOperationsTabPage() {
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
    section: "operations",
    loadErrorMessage: "운영 설정을 불러오지 못했습니다.",
    saveErrorMessage: "운영 설정 저장에 실패했습니다.",
    successMessage: "운영 설정이 저장되었습니다.",
    confirmTitle: "운영 설정 저장",
    confirmDescription: "운영 정책을 저장하시겠습니까?",
    buildPayload: (currentSettings) => {
      const refreshInterval = Math.floor(
        asNumber(currentSettings["site.mainPageRefreshInterval"], 60)
      );
      if (!Number.isFinite(refreshInterval) || refreshInterval < 10) {
        throw new Error("메인 페이지 자동 새로고침 주기는 10초 이상이어야 합니다.");
      }

      const submissionEditLimit = Math.floor(
        asNumber(currentSettings["site.submissionEditLimit"], 3)
      );
      if (!Number.isFinite(submissionEditLimit) || submissionEditLimit < 0) {
        throw new Error("답안 수정 횟수 제한은 0 이상이어야 합니다.");
      }

      return {
        "site.maintenanceMode": asBoolean(currentSettings["site.maintenanceMode"], false),
        "site.maintenanceMessage": asString(currentSettings["site.maintenanceMessage"]),
        "site.mainPageAutoRefresh": asBoolean(
          currentSettings["site.mainPageAutoRefresh"],
          true
        ),
        "site.mainPageRefreshInterval": String(refreshInterval),
        "site.submissionEditLimit": submissionEditLimit,
      } satisfies Record<string, SettingValue>;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-slate-600">운영 설정을 불러오는 중입니다...</p>;
  }

  if (!sectionEnabled) {
    return (
      <SiteSettingsSectionDisabledState
        title="운영 설정이 비활성화되었습니다."
        description="이 지점에서는 점검 모드와 답안 수정 제한 같은 운영 정책을 여기서 직접 바꿀 수 없도록 잠겨 있습니다."
      />
    );
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="운영 설정"
        description="점검 모드, 메인 자동 새로고침, 답안 수정 제한 같은 운영 정책을 관리합니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "운영 설정 저장"}
          </Button>
        }
      >
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={asBoolean(settings["site.maintenanceMode"], false)}
            onChange={(event) => updateSetting("site.maintenanceMode", event.target.checked)}
          />
          점검 모드
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={asBoolean(settings["site.mainPageAutoRefresh"], true)}
            onChange={(event) => updateSetting("site.mainPageAutoRefresh", event.target.checked)}
          />
          메인 페이지 자동 새로고침
        </label>

        <div className="space-y-2">
          <Label htmlFor="main-refresh-interval">메인 새로고침 주기 (초)</Label>
          <Input
            id="main-refresh-interval"
            type="number"
            min={10}
            value={asString(settings["site.mainPageRefreshInterval"], "60")}
            onChange={(event) => updateSetting("site.mainPageRefreshInterval", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="submission-edit-limit">답안 수정 제한 (0이면 수정 불가)</Label>
          <Input
            id="submission-edit-limit"
            type="number"
            min={0}
            value={String(asNumber(settings["site.submissionEditLimit"], 3))}
            onChange={(event) => updateSetting("site.submissionEditLimit", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maintenance-message">점검 안내 메시지</Label>
          <Input
            id="maintenance-message"
            value={asString(settings["site.maintenanceMessage"])}
            onChange={(event) => updateSetting("site.maintenanceMessage", event.target.value)}
          />
        </div>
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
