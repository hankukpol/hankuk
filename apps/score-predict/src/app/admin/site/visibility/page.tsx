"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asString, type SettingValue } from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";
import SiteSettingsSectionDisabledState from "../_components/SiteSettingsSectionDisabledState";

const DEFAULT_LOCKED_MESSAGE = "시험 정보 준비 중입니다.";

export default function AdminSiteVisibilityTabPage() {
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
    section: "visibility",
    loadErrorMessage: "잠금 안내 설정을 불러오지 못했습니다.",
    saveErrorMessage: "잠금 안내 설정 저장에 실패했습니다.",
    successMessage: "잠금 안내 설정이 저장되었습니다.",
    confirmTitle: "잠금 안내 설정 저장",
    confirmDescription: "잠금 안내 문구를 저장하시겠습니까?",
    buildPayload: (currentSettings) => {
      const tabLockedMessage = asString(
        currentSettings["site.tabLockedMessage"],
        DEFAULT_LOCKED_MESSAGE
      ).trim();

      if (!tabLockedMessage) {
        throw new Error("잠금 안내 메시지를 입력해 주세요.");
      }

      return {
        "site.tabLockedMessage": tabLockedMessage,
      } satisfies Record<string, SettingValue>;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-slate-600">잠금 안내 설정을 불러오는 중입니다...</p>;
  }

  if (!sectionEnabled) {
    return (
      <SiteSettingsSectionDisabledState
        title="잠금 안내 설정이 비활성화되었습니다."
        description="이 지점에서는 비활성 메뉴 안내 문구를 여기서 직접 수정할 수 없도록 잠겨 있습니다."
      />
    );
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="잠금 안내 설정"
        description="비활성화된 메뉴나 직접 접근 차단 시 공통으로 노출할 안내 문구를 설정합니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "잠금 안내 저장"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="tab-locked-message">잠금 안내 메시지</Label>
          <Input
            id="tab-locked-message"
            value={asString(settings["site.tabLockedMessage"], DEFAULT_LOCKED_MESSAGE)}
            onChange={(event) => updateSetting("site.tabLockedMessage", event.target.value)}
            placeholder={DEFAULT_LOCKED_MESSAGE}
          />
          <p className="text-xs text-slate-500">
            비활성 메뉴를 눌렀을 때 공통으로 보여 줄 안내 문구입니다.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">미리보기</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {asString(settings["site.tabLockedMessage"], DEFAULT_LOCKED_MESSAGE)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            기능 설정에서 메뉴나 기능을 끄면 공개 페이지와 직접 접근 페이지에서 이 문구를 사용합니다.
          </p>
        </div>
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
