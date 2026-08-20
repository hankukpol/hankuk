"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import PreRegistrationModal from "@/components/landing/PreRegistrationModal";
import {
  EXAM_TAB_QUERY_PARAM,
  getEmbeddedExamTabCallbackHref,
  getPreferredExamTab,
  isExamSurfaceKey,
  type ExamSurfaceItem,
  type ExamSurfaceKey,
} from "@/lib/exam-surface";
import { withTenantPrefix } from "@/lib/tenant";
import GuestLoginDialog from "@/components/landing/GuestLoginDialog";

const ExamCommentsPageContent = dynamic(() => import("@/components/exam/ExamCommentsPageContent"));
const ExamFinalPageContent = dynamic(() => import("@/components/exam/ExamFinalPageContent"));
const ExamFaqPageContent = dynamic(() => import("@/components/exam/ExamFaqPageContent"));
const ExamInputPageContent = dynamic(() => import("@/components/exam/ExamInputPageContent"));
const ExamNoticesPageContent = dynamic(() => import("@/components/exam/ExamNoticesPageContent"));
const ExamPredictionPageContent = dynamic(() => import("@/components/exam/ExamPredictionPageContent"));
const ExamResultPageContent = dynamic(() => import("@/components/exam/ExamResultPageContent"));
const ExamMainOverviewPanel = dynamic(() => import("@/components/landing/ExamMainOverviewPanel"));
const PublicExamOverviewPanel = dynamic(() => import("@/components/landing/PublicExamOverviewPanel"));

type TabKey = ExamSurfaceKey;

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
  showEnabledTabsForGuests?: boolean;
  tabEnabled?: TabEnabledSettings;
  promotionFrame?: boolean;
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
  { key: "final", label: "최종 환산 예측", requireSubmission: true },
  { key: "prediction", label: "합격 예측", requireSubmission: true },
  { key: "comments", label: "실시간 댓글", requireSubmission: false },
  { key: "notices", label: "공지사항", requireSubmission: false },
  { key: "faq", label: "FAQ", requireSubmission: false },
];

const GUEST_ACCESSIBLE_TAB_KEYS = new Set<TabKey>(["main"]);

function tabClassName(active: boolean, disabled: boolean) {
  const base =
    "user-navigation-tab relative inline-flex h-16 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-service-400 sm:px-5 xl:px-6";

  if (disabled) {
    return `${base} cursor-not-allowed border-transparent text-white/35`;
  }

  if (active) {
    return `${base} border-service-400 bg-white/10 text-white`;
  }

  return `${base} border-transparent text-white/70 hover:border-service-400 hover:bg-white/5 hover:text-white`;
}

export default function ExamFunctionArea({
  isAuthenticated,
  hasSubmission,
  isAdmin = false,
  finalPredictionEnabled = false,
  commentsEnabled = true,
  showEnabledTabsForGuests = false,
  tabEnabled = {},
  promotionFrame = false,
}: ExamFunctionAreaProps) {
  const tenant = useTenantConfig();
  const [activeTab, setActiveTab] = useState<TabKey>("main");
  const [localHasSubmission, setLocalHasSubmission] = useState(hasSubmission);
  const [preRegistrationModalOpen, setPreRegistrationModalOpen] = useState(false);
  const [guestLoginDialogOpen, setGuestLoginDialogOpen] = useState(false);
  const [guestRequestedTab, setGuestRequestedTab] = useState<TabKey | null>(null);
  const [pendingRequestedTab, setPendingRequestedTab] = useState<TabKey | null>(null);
  const [isNavigationFixed, setIsNavigationFixed] = useState(false);
  const navigationAnchorRef = useRef<HTMLDivElement>(null);
  const canAccessRestrictedTabs = localHasSubmission || isAdmin;

  function handlePreRegistrationModalOpenChange(nextOpen: boolean) {
    setPreRegistrationModalOpen(nextOpen);
  }

  function handleTabChange(nextTab: TabKey) {
    if (!isAuthenticated && !isAdmin && !GUEST_ACCESSIBLE_TAB_KEYS.has(nextTab)) {
      setGuestRequestedTab(nextTab);
      setGuestLoginDialogOpen(true);
      return;
    }

    setActiveTab(nextTab);
    if (isAuthenticated || isAdmin) {
      const url = new URL(window.location.href);
      url.searchParams.set(EXAM_TAB_QUERY_PARAM, nextTab);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
    }
    if (!isNavigationFixed) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    navigationAnchorRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
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
        requiresSubmission: false,
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
          (showEnabledTabsForGuests || isAuthenticated || isAdmin || GUEST_ACCESSIBLE_TAB_KEYS.has(tab.key))
      ),
    [isAdmin, isAuthenticated, showEnabledTabsForGuests, surfaceItems]
  );

  useEffect(() => {
    setLocalHasSubmission(hasSubmission);
  }, [hasSubmission]);

  useEffect(() => {
    const updateNavigationPosition = () => {
      const anchor = navigationAnchorRef.current;
      if (!anchor) return;
      setIsNavigationFixed(anchor.getBoundingClientRect().top < 0);
    };

    updateNavigationPosition();
    window.addEventListener("scroll", updateNavigationPosition, { passive: true });
    window.addEventListener("resize", updateNavigationPosition);
    return () => {
      window.removeEventListener("scroll", updateNavigationPosition);
      window.removeEventListener("resize", updateNavigationPosition);
    };
  }, []);

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
    if (!isAuthenticated && !isAdmin) return;

    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get(EXAM_TAB_QUERY_PARAM);
    if (!isExamSurfaceKey(requestedTab)) return;

    const requestedItem = surfaceItems[requestedTab];
    if (!requestedItem.enabled) return;

    if (requestedItem.requiresSubmission && !canAccessRestrictedTabs) {
      setPendingRequestedTab(requestedTab);
      setActiveTab(surfaceItems.input.enabled ? "input" : preferredTab);
      return;
    }

    setPendingRequestedTab(null);
    setActiveTab(requestedTab);
  }, [canAccessRestrictedTabs, isAdmin, isAuthenticated, preferredTab, surfaceItems]);

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
        return isAdmin || (isAuthenticated && surfaceItems.prediction.enabled)
          ? <ExamMainOverviewPanel />
          : <PublicExamOverviewPanel />;
      case "input":
        return (
          <ExamInputPageContent
            embedded
            onSubmitted={() => {
              setLocalHasSubmission(true);
              const requestedTab = pendingRequestedTab;
              setPendingRequestedTab(null);
              setActiveTab(
                requestedTab && surfaceItems[requestedTab].enabled
                  ? requestedTab
                  : surfaceItems.result.enabled
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
    if (!isAuthenticated && !isAdmin && !GUEST_ACCESSIBLE_TAB_KEYS.has(tabKey)) return null;
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
      {/* space-y 를 쓰지 않는다. 1px 스크롤 앵커와 네비 사이에 간격이 생겨
          프로모션과 다크 네비 사이에 흰 띠로 보인다.
          네비 아래 여백은 콘텐츠 래퍼의 pt 가 담당한다. */}
      <section id="exam-functions">
        <div ref={navigationAnchorRef} className="h-px" aria-hidden="true" />
        <div className={`user-sticky-navigation ${isNavigationFixed ? "user-sticky-navigation--fixed" : ""}`}>
          <div
            className={`user-navigation-surface user-navigation-surface--adaptive overflow-x-auto ${
              promotionFrame ? "user-navigation-surface--promotion" : ""
            }`}
          >
          <div className="flex min-h-16 min-w-max items-stretch px-1 sm:px-3">
            {visibleTabs.map((tab) => {
              const disabled = isAuthenticated && tab.requireSubmission && !canAccessRestrictedTabs;

              return (
                <button
                  key={tab.key}
                  type="button"
                  className={tabClassName(activeTab === tab.key, disabled)}
                  disabled={disabled}
                  onClick={() => handleTabChange(tab.key)}
                  aria-pressed={activeTab === tab.key}
                  title={disabled ? "답안 제출 후 열리는 기능입니다." : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          </div>
        </div>
        {isNavigationFixed ? <div className="h-16" aria-hidden="true" /> : null}

        {/* 메뉴바와 페이지 제목 사이 여백. /exam 레이아웃과 동일하게 100px. */}
        <div className="pt-[100px]">{renderTabContent(activeTab)}</div>
      </section>
      {preRegistrationModal}
      <GuestLoginDialog
        open={guestLoginDialogOpen}
        onOpenChange={setGuestLoginDialogOpen}
        requestedLabel={ALL_TABS.find((tab) => tab.key === guestRequestedTab)?.label}
        callbackHref={guestRequestedTab ? getEmbeddedExamTabCallbackHref(guestRequestedTab) : "/"}
      />
    </>
  );
}
