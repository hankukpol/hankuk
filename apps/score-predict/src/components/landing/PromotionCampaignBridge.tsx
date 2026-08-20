"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import CustomHtmlPromotionFrame from "@/components/landing/CustomHtmlPromotionFrame";
import ExamFunctionArea from "@/components/landing/ExamFunctionArea";
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
import { splitPromotionAtExamFunctionsSlot } from "@/lib/promotions/exam-functions-slot";

interface PromotionTabEnabled {
  main?: boolean;
  input?: boolean;
  result?: boolean;
  final?: boolean;
  prediction?: boolean;
  comments?: boolean;
  notices?: boolean;
  faq?: boolean;
}

export function PromotionHtmlWithExamFunctions({
  htmlDocument,
  title = "프로모션 미리보기",
  onPreRegistration,
  isAuthenticated,
  hasSubmission = false,
  isAdmin = false,
  finalPredictionEnabled = false,
  commentsEnabled = false,
  tabEnabled = {},
}: {
  htmlDocument: string;
  title?: string;
  onPreRegistration?: () => void;
  isAuthenticated: boolean;
  hasSubmission?: boolean;
  isAdmin?: boolean;
  finalPredictionEnabled?: boolean;
  commentsEnabled?: boolean;
  tabEnabled?: PromotionTabEnabled;
}) {
  const splitDocument = splitPromotionAtExamFunctionsSlot(htmlDocument);

  if (!splitDocument) {
    return (
      <CustomHtmlPromotionFrame
        htmlDocument={htmlDocument}
        title={title}
        onPreRegistration={onPreRegistration}
      />
    );
  }

  return (
    <>
      <CustomHtmlPromotionFrame
        htmlDocument={splitDocument.beforeHtmlDocument}
        title={title}
        onPreRegistration={onPreRegistration}
      />
      {/* 상단 여백을 두면 프로모션과 다크 네비 사이에 흰 띠가 생겨 실수처럼 보인다.
          다크 네비 자체가 "홍보 영역이 끝나고 기능이 시작된다"는 경계를 충분히 만든다. */}
      <section className="bg-white pb-10 sm:pb-14" data-promotion-exam-functions="true">
        <div className="user-content-frame user-content-frame--promotion" data-promotion-exam-functions-frame="true">
          <ExamFunctionArea
            isAuthenticated={isAuthenticated}
            hasSubmission={hasSubmission}
            isAdmin={isAdmin}
            finalPredictionEnabled={finalPredictionEnabled}
            commentsEnabled={commentsEnabled}
            showEnabledTabsForGuests
            tabEnabled={tabEnabled}
            promotionFrame
          />
        </div>
      </section>
      <CustomHtmlPromotionFrame
        htmlDocument={splitDocument.afterHtmlDocument}
        title={`${title} 이벤트`}
        onPreRegistration={onPreRegistration}
      />
    </>
  );
}

export default function PromotionCampaignBridge({
  isAuthenticated,
  hasSubmission = false,
  isAdmin = false,
  preRegistrationEnabled,
  noticesEnabled,
  faqEnabled,
  finalPredictionEnabled = false,
  commentsEnabled = false,
  tabEnabled = {},
  templateKey,
  templateVersion,
  content,
}: {
  isAuthenticated: boolean;
  hasSubmission?: boolean;
  isAdmin?: boolean;
  preRegistrationEnabled: boolean;
  noticesEnabled: boolean;
  faqEnabled: boolean;
  finalPredictionEnabled?: boolean;
  commentsEnabled?: boolean;
  tabEnabled?: PromotionTabEnabled;
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
  const customHtmlDocument =
    templateKey === CUSTOM_HTML_PROMOTION_TEMPLATE_KEY &&
    templateVersion === CUSTOM_HTML_PROMOTION_TEMPLATE_VERSION &&
    isCustomHtmlPromotionContent(content)
      ? content.htmlDocument
      : null;
  const hasEmbeddedExamFunctions = customHtmlDocument
    ? splitPromotionAtExamFunctionsSlot(customHtmlDocument) !== null
    : false;

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
      {!hasEmbeddedExamFunctions && (noticesEnabled || faqEnabled) ? (
        <PublicExamNavigation
          activeKey="main"
          tenantType={tenant.type}
          preRegistrationEnabled={preRegistrationEnabled}
          noticesEnabled={noticesEnabled}
          faqEnabled={faqEnabled}
          isAuthenticated={effectiveAuthenticated}
        />
      ) : null}
      <div
        data-promotion-modal-open={open ? "true" : "false"}
        data-promotion-pre-registration-enabled={canUsePreRegistration ? "true" : "false"}
        data-promotion-authenticated={effectiveAuthenticated ? "true" : "false"}
        data-promotion-session-status={sessionStatus}
      >
        {customHtmlDocument ? (
          <PromotionHtmlWithExamFunctions
            htmlDocument={customHtmlDocument}
            onPreRegistration={openPreRegistration}
            isAuthenticated={effectiveAuthenticated}
            hasSubmission={hasSubmission}
            isAdmin={isAdmin}
            finalPredictionEnabled={finalPredictionEnabled}
            commentsEnabled={commentsEnabled}
            tabEnabled={tabEnabled}
          />
        ) : null}
      </div>
      <PreRegistrationModal
        open={open}
        isAuthenticated={effectiveAuthenticated}
        onOpenChange={handleOpenChange}
      />
      <Dialog open={unavailableOpen} onOpenChange={setUnavailableOpen}>
        <DialogContent className="public-product-shell rounded-none border-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="user-page-title">사전등록 기간이 아닙니다</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              현재 회차의 사전등록이 종료되었거나 아직 시작되지 않았습니다. 공지사항에서 운영 일정을 확인해
              주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 border-t border-slate-200 pt-6">
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => setUnavailableOpen(false)}
            >
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
