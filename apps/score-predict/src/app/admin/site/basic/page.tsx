"use client";

import ConfirmModal from "@/components/admin/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asString, type SettingValue } from "../_lib/site-settings-client";
import { useSiteSettingsManager } from "../_lib/use-site-settings-manager";
import SiteSettingsSectionCard from "../_components/SiteSettingsSectionCard";
import SiteSettingsSectionDisabledState from "../_components/SiteSettingsSectionDisabledState";

export default function AdminSiteBasicTabPage() {
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
    section: "basic",
    loadErrorMessage: "기본 설정을 불러오지 못했습니다.",
    saveErrorMessage: "기본 설정 저장에 실패했습니다.",
    successMessage: "기본 설정이 저장되었습니다.",
    confirmTitle: "기본 설정 저장",
    confirmDescription: "사이트 기본 문구를 저장하시겠습니까?",
    buildPayload: (currentSettings) =>
      ({
        "site.title": asString(currentSettings["site.title"]),
        "site.heroBadge": asString(currentSettings["site.heroBadge"]),
        "site.heroTitle": asString(currentSettings["site.heroTitle"]),
        "site.heroSubtitle": asString(currentSettings["site.heroSubtitle"]),
        "site.footerDisclaimer": asString(currentSettings["site.footerDisclaimer"]),
      }) satisfies Record<string, SettingValue>,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-600">기본 설정을 불러오는 중입니다...</p>;
  }

  if (!sectionEnabled) {
    return (
      <SiteSettingsSectionDisabledState
        title="기본 사이트 설정이 비활성화되었습니다."
        description="이 지점에서는 사이트명과 히어로 문구 같은 기본 설정을 직접 수정할 수 없도록 잠겨 있습니다."
      />
    );
  }

  return (
    <>
      <SiteSettingsSectionCard
        title="기본 설정"
        description="사이트 이름, 히어로 문구, 푸터 안내 문구를 직접 관리합니다."
        notice={notice}
        footer={
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "기본 설정 저장"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="site-title">사이트 제목</Label>
          <Input
            id="site-title"
            value={asString(settings["site.title"])}
            onChange={(event) => updateSetting("site.title", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-badge">히어로 배지</Label>
          <Input
            id="hero-badge"
            value={asString(settings["site.heroBadge"])}
            onChange={(event) => updateSetting("site.heroBadge", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-title">히어로 제목</Label>
          <textarea
            id="hero-title"
            className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-fire-300 transition focus:ring"
            value={asString(settings["site.heroTitle"])}
            onChange={(event) => updateSetting("site.heroTitle", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-subtitle">히어로 부제목</Label>
          <textarea
            id="hero-subtitle"
            className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-fire-300 transition focus:ring"
            value={asString(settings["site.heroSubtitle"])}
            onChange={(event) => updateSetting("site.heroSubtitle", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="footer-disclaimer">푸터 면책 문구</Label>
          <textarea
            id="footer-disclaimer"
            className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-fire-300 transition focus:ring"
            value={asString(settings["site.footerDisclaimer"])}
            onChange={(event) => updateSetting("site.footerDisclaimer", event.target.value)}
          />
        </div>
      </SiteSettingsSectionCard>

      <ConfirmModal {...modalProps} />
    </>
  );
}
