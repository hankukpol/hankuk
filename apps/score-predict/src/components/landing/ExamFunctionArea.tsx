"use client";

import { useEffect, useMemo, useState } from "react";
import ExamCommentsPageContent from "@/components/exam/ExamCommentsPageContent";
import ExamFinalPageContent from "@/components/exam/ExamFinalPageContent";
import ExamFaqPageContent from "@/components/exam/ExamFaqPageContent";
import ExamInputPageContent from "@/components/exam/ExamInputPageContent";
import ExamNoticesPageContent from "@/components/exam/ExamNoticesPageContent";
import ExamPredictionPageContent from "@/components/exam/ExamPredictionPageContent";
import ExamResultPageContent from "@/components/exam/ExamResultPageContent";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import ExamMainOverviewPanel from "@/components/landing/ExamMainOverviewPanel";
import PublicExamOverviewPanel from "@/components/landing/PublicExamOverviewPanel";
import { getPreferredExamTab, type ExamSurfaceItem } from "@/lib/exam-surface";
import { withTenantPrefix } from "@/lib/tenant";

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
    "relative inline-flex w-full min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-semibold transition xl:w-auto xl:px-6 xl:py-4 xl:text-base";

  if (disabled) {
    return `${base} cursor-not-allowed text-slate-400`;
  }

  if (active) {
    return `${base} bg-service-50 text-service-700 xl:bg-transparent xl:after:absolute xl:after:bottom-0 xl:after:left-0 xl:after:h-[2px] xl:after:w-full xl:after:bg-service-700`;
  }

  return `${base} text-slate-500 hover:bg-service-50 hover:text-service-700 xl:bg-transparent xl:text-slate-400 xl:hover:bg-transparent xl:hover:text-service-600`;
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
  const canAccessRestrictedTabs = localHasSubmission || isAdmin;

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

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <section id="exam-functions" className="border border-slate-200 bg-slate-50 p-0">
      <div className="border-b border-slate-200 bg-white px-1 sm:px-3">
        <div className="grid grid-cols-3 gap-1 py-1 xl:flex xl:min-w-max xl:items-center xl:gap-0 xl:py-0">
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

      <div className="bg-slate-50 p-0 sm:p-0">
        <div className="border border-t-0 border-slate-200 bg-white p-4 sm:p-8">{renderTabContent(activeTab)}</div>
      </div>
    </section>
  );
}
