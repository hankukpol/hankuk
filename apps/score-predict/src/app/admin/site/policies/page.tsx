"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { asString, type SettingValue } from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";
import SiteSettingsSectionDisabledState from "../_components/SiteSettingsSectionDisabledState";

export default function AdminSitePoliciesTabPage() {
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
    section: "policies",
    loadErrorMessage: "정책 설정을 불러오지 못했습니다.",
    saveErrorMessage: "정책 설정 저장에 실패했습니다.",
    successMessage: "정책 설정이 저장되었습니다.",
    confirmTitle: "정책 저장",
    confirmDescription: "이용약관과 개인정보처리방침을 저장하시겠습니까?",
    buildPayload: (currentSettings) =>
      ({
        "site.termsOfService": asString(currentSettings["site.termsOfService"]),
        "site.privacyPolicy": asString(currentSettings["site.privacyPolicy"]),
      }) satisfies Record<string, SettingValue>,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-600">정책 설정을 불러오는 중입니다...</p>;
  }

  if (!sectionEnabled) {
    return (
      <SiteSettingsSectionDisabledState
        title="정책 관리가 비활성화되었습니다."
        description="이 지점에서는 이용약관과 개인정보처리방침을 여기서 직접 수정할 수 없도록 잠겨 있습니다."
      />
    );
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="정책 관리"
        description="운영 정책에 맞게 이용약관과 개인정보처리방침 본문을 직접 수정합니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "정책 저장"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="terms-of-service">이용약관</Label>
          <textarea
            id="terms-of-service"
            className="min-h-56 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-fire-300 transition focus:ring"
            value={asString(settings["site.termsOfService"])}
            onChange={(event) => updateSetting("site.termsOfService", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="privacy-policy">개인정보처리방침</Label>
          <textarea
            id="privacy-policy"
            className="min-h-56 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-fire-300 transition focus:ring"
            value={asString(settings["site.privacyPolicy"])}
            onChange={(event) => updateSetting("site.privacyPolicy", event.target.value)}
          />
        </div>
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
