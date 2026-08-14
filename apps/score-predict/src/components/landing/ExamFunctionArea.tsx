"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import PreRegistrationModal from "@/components/landing/PreRegistrationModal";
import { getPreferredExamTab, type ExamSurfaceItem } from "@/lib/exam-surface";
import { withTenantPrefix } from "@/lib/tenant";

const ExamCommentsPageContent = dynamic(() => import("@/components/exam/ExamCommentsPageContent"));
const ExamFinalPageContent = dynamic(() => import("@/components/exam/ExamFinalPageContent"));
const ExamFaqPageContent = dynamic(() => import("@/components/exam/ExamFaqPageContent"));
const ExamInputPageContent = dynamic(() => import("@/components/exam/ExamInputPageContent"));
const ExamNoticesPageContent = dynamic(() => import("@/components/exam/ExamNoticesPageContent"));
const ExamPredictionPageContent = dynamic(() => import("@/components/exam/ExamPredictionPageContent"));
const ExamResultPageContent = dynamic(() => import("@/components/exam/ExamResultPageContent"));
const ExamMainOverviewPanel = dynamic(() => import("@/components/landing/ExamMainOverviewPanel"));
const PublicExamOverviewPanel = dynamic(() => import("@/components/landing/PublicExamOverviewPanel"));

type TabKey = "main" | "input" | "result" | "final" | "prediction" | "comments" | "notices" | "faq";

interface TabEnabledSettings {
  main?: boolean;
  input?: boolean;
  result?: boolean;
  final?: boolean;
  prediction?: boolean;
  comments?: boolean;
  notices?: boolean;
  faq?: boolean;
}

interface ExamFunctionAreaProps {
  isAuthenticated: boolean;
  hasSubmission: boolean;
  isAdmin?: boolean;
  finalPredictionEnabled?: boolean;
  commentsEnabled?: boolean;
  tabEnabled?: TabEnabledSettings;
}

interface TabItem {
  key: TabKey;
  label: string;
  requireSubmission: boolean;
}

const ALL_TABS: TabItem[] = [
  { key: "main", label: "풀서비스 메인", requireSubmission: false },
  { key: "input", label: "응시정보 입력", requireSubmission: false },
  { key: "result", label: "내 성적 분석", requireSubmission: true },
  { key: "final", label: "최종 예상 컷", requireSubmission: true },
  { key: "prediction", label: "합격 예측 정보", requireSubmission: true },
  { key: "comments", label: "실시간 댓글", requireSubmission: true },
  { key: "notices", label: "공지사항", requireSubmission: false },
  { key: "faq", label: "FAQ", requireSubmission: false },
];

const PUBLIC_TAB_KEYS = new Set<TabKey>(["main", "notices", "faq"]);

function tabClassName(active: boolean, disabled: boolean) {
  const base =
    "relative inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition sm:px-5 xl:px-6 xl:text-base";

  if (disabled) {
    return `${base} cursor-not-allowed border-transparent text-slate-400`;
  }

  if (active) {
    return `${base} border-service-700 text-service-700`;
  }

  return `${base} border-transparent text-slate-500 hover:border-service-300 hover:text-service-700`;
}

export default function ExamFunctionArea({
  isAuthenticated,
  hasSubmission,
  isAdmin = false,
  finalPredictionEnabled = false,
  commentsEnabled = true,
  tabEnabled = {},
}: ExamFunctionAreaProps) {
  const tenant = useTenantConfig();
  const [activeTab, setActiveTab] = useState<TabKey>("main");
  const [localHasSubmission, setLocalHasSubmission] = useState(hasSubmission);
  const [preRegistrationModalOpen, setPreRegistrationModalOpen] = useState(false);
  const canAccessRestrictedTabs = localHasSubmission || isAdmin;

  function handlePreRegistrationModalOpenChange(nextOpen: boolean) {
    setPreRegistrationModalOpen(nextOpen);
  }

  useEffect(() => {
    if (!tenant.features.preRegistration) return;

    function handlePreRegistrationTrigger(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const trigger = event.target.closest<HTMLElement>(
        'a[href="#pre-registration"], [data-pre-registration-modal="true"]'
      );
      if (!trigger) return;

      event.preventDefault();
      setPreRegistrationModalOpen(true);
    }

    document.addEventListener("click", handlePreRegistrationTrigger);
    return () => document.removeEventListener("click", handlePreRegistrationTrigger);
  }, [tenant.features.preRegistration]);

  useEffect(() => {
    if (!tenant.features.preRegistration || !isAuthenticated) return;

    try {
      if (window.sessionStorage.getItem("score-predict:open-pre-registration-after-auth") !== "1") {
        return;
      }
      window.sessionStorage.removeItem("score-predict:open-pre-registration-after-auth");
      setPreRegistrationModalOpen(true);
    } catch {
      // 브라우저 저장소를 사용할 수 없으면 로그인 후 메인 화면을 그대로 유지한다.
    }
  }, [isAuthenticated, tenant.features.preRegistration]);

  const mergedTabEnabled = useMemo<TabEnabledSettings>(
    () => ({
      main: tabEnabled.main ?? true,
      input: tabEnabled.input ?? true,
      result: tabEnabled.result ?? true,
      final: finalPredictionEnabled && (tabEnabled.final ?? true),
      prediction: tabEnabled.prediction ?? true,
      comments: commentsEnabled && (tabEnabled.comments ?? true),
      notices: tabEnabled.notices ?? true,
      faq: tabEnabled.faq ?? true,
    }),
    [commentsEnabled, finalPredictionEnabled, tabEnabled]
  );

  const surfaceItems = useMemo<Record<TabKey, ExamSurfaceItem>>(
    () => ({
      main: {
        key: "main",
        href: withTenantPrefix("/exam/main", tenant.type),
        enabled: mergedTabEnabled.main ?? true,
        requiresSubmission: false,
      },
      input: {
        key: "input",
        href: withTenantPrefix("/exam/input", tenant.type),
        enabled: mergedTabEnabled.input ?? true,
        requiresSubmission: false,
      },
      result: {
        key: "result",
        href: withTenantPrefix("/exam/result", tenant.type),
        enabled: mergedTabEnabled.result ?? true,
        requiresSubmission: true,
      },
      final: {
        key: "final",
        href: withTenantPrefix("/exam/final", tenant.type),
        enabled: mergedTabEnabled.final ?? true,
        requiresSubmission: true,
      },
      prediction: {
        key: "prediction",
        href: withTenantPrefix("/exam/prediction", tenant.type),
        enabled: mergedTabEnabled.prediction ?? true,
        requiresSubmission: true,
      },
      comments: {
        key: "comments",
        href: withTenantPrefix("/exam/comments", tenant.type),
        enabled: mergedTabEnabled.comments ?? true,
        requiresSubmission: true,
      },
      notices: {
        key: "notices",
        href: withTenantPrefix("/exam/notices", tenant.type),
        enabled: mergedTabEnabled.notices ?? true,
        requiresSubmission: false,
      },
      faq: {
        key: "faq",
        href: withTenantPrefix("/exam/faq", tenant.type),
        enabled: mergedTabEnabled.faq ?? true,
        requiresSubmission: false,
      },
    }),
    [mergedTabEnabled, tenant.type]
  );

  const visibleTabs = useMemo(
    () =>
      ALL_TABS.filter(
        (tab) =>
          surfaceItems[tab.key].enabled &&
          (isAuthenticated || isAdmin || PUBLIC_TAB_KEYS.has(tab.key))
      ),
    [isAdmin, isAuthenticated, surfaceItems]
  );

  useEffect(() => {
    setLocalHasSubmission(hasSubmission);
  }, [hasSubmission]);

  const preferredTab = useMemo(
    () =>
      getPreferredExamTab(surfaceItems, {
        isAuthenticated,
        canAccessRestrictedTabs,
        isAdmin,
      }) as TabKey,
    [canAccessRestrictedTabs, isAdmin, isAuthenticated, surfaceItems]
  );

  useEffect(() => {
    const activeItem = surfaceItems[activeTab];
    const activeBlockedBySubmission =
      isAuthenticated && activeItem.requiresSubmission && !canAccessRestrictedTabs;

    if ((!activeItem.enabled || activeBlockedBySubmission) && activeTab !== preferredTab) {
      setActiveTab(preferredTab);
    }
  }, [activeTab, canAccessRestrictedTabs, isAuthenticated, preferredTab, surfaceItems]);

  function getTabContent(tabKey: TabKey) {
    switch (tabKey) {
      case "main":
        return isAuthenticated || isAdmin ? <ExamMainOverviewPanel /> : <PublicExamOverviewPanel />;
      case "input":
        return (
          <ExamInputPageContent
            embedded
            onSubmitted={() => {
              setLocalHasSubmission(true);
              setActiveTab(
                surfaceItems.result.enabled
                  ? "result"
                  : (getPreferredExamTab(surfaceItems, {
                    isAuthenticated: true,
                    canAccessRestrictedTabs: true,
                    isAdmin,
                  }) as TabKey)
              );
            }}
          />
        );
      case "result":
        return <ExamResultPageContent embedded />;
      case "final":
        return <ExamFinalPageContent embedded />;
      case "prediction":
        return <ExamPredictionPageContent embedded />;
      case "comments":
        return <ExamCommentsPageContent embedded />;
      case "notices":
        return <ExamNoticesPageContent embedded />;
      case "faq":
        return <ExamFaqPageContent embedded />;
      default:
        return null;
    }
  }

  function renderTabContent(tabKey: TabKey) {
    return getTabContent(tabKey);
  }

  const preRegistrationModal = (
    <PreRegistrationModal
      open={preRegistrationModalOpen}
      isAuthenticated={isAuthenticated}
      onOpenChange={handlePreRegistrationModalOpenChange}
    />
  );

  if (visibleTabs.length === 0) {
    return preRegistrationModal;
  }

  return (
    <>
      {/* 탭 바가 스스로 하나의 표면이다. 패널까지 감싸면 패널이 '카드 안 카드'가 된다. */}
      <section id="exam-functions" className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex min-w-max items-center px-1 sm:px-3">
            {visibleTabs.map((tab) => {
              const disabled = isAuthenticated && tab.requireSubmission && !canAccessRestrictedTabs;

              return (
                <button
                  key={tab.key}
                  type="button"
                  className={tabClassName(activeTab === tab.key, disabled)}
                  disabled={disabled}
                  onClick={() => setActiveTab(tab.key)}
                  title={disabled ? "답안 제출 후 열리는 기능입니다." : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>{renderTabContent(activeTab)}</div>
      </section>
      {preRegistrationModal}
    </>
  );
}
