"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import CustomHtmlPromotionFrame from "@/components/landing/CustomHtmlPromotionFrame";
import PreRegistrationModal from "@/components/landing/PreRegistrationModal";
import PublicExamNavigation from "@/components/layout/PublicExamNavigation";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CUSTOM_HTML_PROMOTION_TEMPLATE_KEY,
  CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION,
  isCustomHtmlPromotionContent,
} from "@/lib/promotions/template-registry";

export default function PromotionCampaignBridge({
  isAuthenticated,
  preRegistrationEnabled,
  noticesEnabled,
  faqEnabled,
  templateKey,
  templateVersion,
  content,
}: {
  isAuthenticated: boolean;
  preRegistrationEnabled: boolean;
  noticesEnabled: boolean;
  faqEnabled: boolean;
  templateKey: string;
  templateVersion: number;
  content: unknown;
}) {
  const tenant = useTenantConfig();
  const { status: sessionStatus } = useSession();
  const [open, setOpen] = useState(false);
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const effectiveAuthenticated = isAuthenticated || sessionStatus === "authenticated";
  const canUsePreRegistration = tenant.features.preRegistration && preRegistrationEnabled;

  const openPreRegistration = () => {
    if (canUsePreRegistration) {
      setOpen(true);
      return;
    }
    setUnavailableOpen(true);
  };

  useEffect(() => {
    if (!effectiveAuthenticated || !canUsePreRegistration) return;
    const url = new URL(window.location.href);
    const requestedByCallback = url.searchParams.get("openPreRegistration") === "1";
    let requestedBySession = false;
    try {
      requestedBySession =
        window.sessionStorage.getItem("score-predict:open-pre-registration-after-auth") === "1";
      if (requestedBySession) {
        window.sessionStorage.removeItem("score-predict:open-pre-registration-after-auth");
      }
    } catch {
      // 저장소 접근이 막혀도 랜딩은 정상 동작한다.
    }
    if (!requestedByCallback && !requestedBySession) return;
    if (requestedByCallback) {
      url.searchParams.delete("openPreRegistration");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    // Strict Mode의 effect 재실행에서도 로그인 복귀 신호를 잃지 않도록
    // 신호 소비가 끝난 다음 마이크로태스크에서 모달을 연다.
    queueMicrotask(() => setOpen(true));
  }, [canUsePreRegistration, effectiveAuthenticated]);

  useEffect(() => {
    const openFromLocationHash = () => {
      if (window.location.hash !== "#pre-registration") return;
      if (canUsePreRegistration) {
        setOpen(true);
      } else {
        setUnavailableOpen(true);
      }
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    };

    openFromLocationHash();
    window.addEventListener("hashchange", openFromLocationHash);
    return () => window.removeEventListener("hashchange", openFromLocationHash);
  }, [canUsePreRegistration]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && window.location.hash === "#pre-registration") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  };

  return (
    <>
      {noticesEnabled || faqEnabled ? (
        <PublicExamNavigation
          activeKey="main"
          tenantType={tenant.type}
          preRegistrationEnabled={preRegistrationEnabled}
          noticesEnabled={noticesEnabled}
          faqEnabled={faqEnabled}
        />
      ) : null}
      <div
        data-promotion-modal-open={open ? "true" : "false"}
        data-promotion-pre-registration-enabled={canUsePreRegistration ? "true" : "false"}
        data-promotion-authenticated={effectiveAuthenticated ? "true" : "false"}
        data-promotion-session-status={sessionStatus}
      >
        {templateKey === CUSTOM_HTML_PROMOTION_TEMPLATE_KEY &&
          templateVersion === CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION &&
          isCustomHtmlPromotionContent(content) ? (
          <CustomHtmlPromotionFrame
            htmlDocument={content.htmlDocument}
            onPreRegistration={openPreRegistration}
          />
        ) : null}
      </div>
      <PreRegistrationModal
        open={open}
        isAuthenticated={effectiveAuthenticated}
        onOpenChange={handleOpenChange}
      />
      <Dialog open={unavailableOpen} onOpenChange={setUnavailableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>사전등록 기간이 아닙니다</DialogTitle>
            <DialogDescription className="leading-6">
              현재 회차의 사전등록이 종료되었거나 아직 시작되지 않았습니다. 공지사항에서 운영 일정을 확인해
              주세요.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" className="mt-2 w-full" onClick={() => setUnavailableOpen(false)}>
            확인
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
