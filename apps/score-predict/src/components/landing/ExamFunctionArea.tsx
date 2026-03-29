"use client";

import Link from "next/link";
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
import {
  DEFAULT_TAB_LOCKED_MESSAGE,
  getPreferredExamTab,
  type ExamSurfaceItem,
} from "@/lib/exam-surface";
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
  tabLockedMessage?: string;
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

function isAdminLocked(tabKey: TabKey, tabEnabled: TabEnabledSettings): boolean {
  return tabEnabled[tabKey] === false;
}

function tabClassName(active: boolean, disabled: boolean, locked: boolean) {
  const base =
    "relative inline-flex w-full min-w-0 items-center justify-center rounded-md px-2 py-2 text-xs font-semibold transition sm:w-auto sm:px-6 sm:py-4 sm:text-base";

  if (disabled) {
    return `${base} cursor-not-allowed text-slate-400`;
  }

  if (locked && !active) {
    return `${base} text-slate-400 hover:text-slate-500 sm:bg-transparent sm:text-slate-400 sm:hover:text-slate-500`;
  }

  if (active) {
    return `${base} bg-slate-100 text-slate-900 sm:bg-transparent sm:after:absolute sm:after:bottom-0 sm:after:left-0 sm:after:h-[2px] sm:after:w-full sm:after:bg-slate-900`;
  }

  return `${base} text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:bg-transparent sm:text-slate-400 sm:hover:bg-transparent sm:hover:text-slate-600`;
}

const LOCK_ICON = (
  <svg className="h-7 w-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const LOCK_ICON_SMALL = (
  <svg className="mr-1 inline-block h-3 w-3 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

function BlurOverlay({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[400px] select-none overflow-hidden rounded-lg">
      <div className="pointer-events-none blur-sm" aria-hidden="true">
        <div className="space-y-6 p-4">
          <div className="h-8 w-2/3 rounded bg-slate-200" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 rounded-lg bg-slate-100" />
            <div className="h-32 rounded-lg bg-slate-100" />
            <div className="h-32 rounded-lg bg-slate-100" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-slate-100" />
            <div className="h-4 w-5/6 rounded bg-slate-100" />
            <div className="h-4 w-4/6 rounded bg-slate-100" />
          </div>
          <div className="h-48 rounded-lg bg-slate-50" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 rounded-lg bg-slate-100" />
            <div className="h-24 rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px]">
        <div className="rounded-2xl bg-white/95 px-8 py-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            {LOCK_ICON}
          </div>
          <p className="text-lg font-semibold text-slate-900">{title}</p>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function ExamFunctionArea({
  isAuthenticated,
  hasSubmission,
  isAdmin = false,
  finalPredictionEnabled = false,
  commentsEnabled = true,
  tabEnabled = {},
  tabLockedMessage = DEFAULT_TAB_LOCKED_MESSAGE,
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

  const visibleTabs = useMemo(() => ALL_TABS, []);

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

  const activeTabMeta = useMemo(
    () => visibleTabs.find((tab) => tab.key === activeTab) ?? visibleTabs[0],
    [activeTab, visibleTabs]
  );

  useEffect(() => {
    const activeItem = surfaceItems[activeTab];
    const activeLocked = isAdminLocked(activeTab, mergedTabEnabled);
    const activeBlockedBySubmission =
      isAuthenticated && !activeLocked && activeItem.requiresSubmission && !canAccessRestrictedTabs;

    if ((!activeItem.enabled || activeBlockedBySubmission) && activeTab !== preferredTab) {
      setActiveTab(preferredTab);
    }
  }, [activeTab, canAccessRestrictedTabs, isAuthenticated, mergedTabEnabled, preferredTab, surfaceItems]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const locked = isAdminLocked(activeTabMeta.key, mergedTabEnabled);
    if (!locked && activeTabMeta.requireSubmission && !canAccessRestrictedTabs && activeTab !== preferredTab) {
      setActiveTab(preferredTab);
    }
  }, [
    activeTab,
    activeTabMeta.key,
    activeTabMeta.requireSubmission,
    canAccessRestrictedTabs,
    isAuthenticated,
    mergedTabEnabled,
    preferredTab,
  ]);

  function getTabContent(tabKey: TabKey) {
    switch (tabKey) {
      case "main":
        return <ExamMainOverviewPanel />;
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
    const locked = isAdminLocked(tabKey, mergedTabEnabled);

    if (locked && !isAdmin) {
      return (
        <BlurOverlay
          title={tabLockedMessage}
          subtitle="관리자 설정에 따라 이 기능은 현재 열려 있지 않습니다."
        />
      );
    }

    if (locked && isAdmin) {
      return (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <svg className="h-5 w-5 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              <span className="font-semibold">잠금 상태</span>로 저장된 기능입니다. 현재 화면은 관리자 미리보기입니다.
            </p>
          </div>
          {getTabContent(tabKey)}
        </>
      );
    }

    if (!isAuthenticated) {
      return (
        <BlurOverlay
          title="로그인 후 이용할 수 있습니다"
          subtitle="회원가입 또는 로그인 후 전체 기능을 바로 사용할 수 있습니다."
          action={
            <div className="flex items-center justify-center gap-3">
              <Link
                href={withTenantPrefix("/login", tenant.type)}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                로그인
              </Link>
              <Link
                href={withTenantPrefix("/register", tenant.type)}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                회원가입
              </Link>
            </div>
          }
        />
      );
    }

    return getTabContent(tabKey);
  }

  return (
    <section id="exam-functions" className="border border-slate-200 bg-slate-50 p-0">
      <div className="border-b border-slate-200 bg-white px-1 sm:px-3">
        <div className="grid grid-cols-3 gap-1 py-1 sm:flex sm:min-w-max sm:items-center sm:gap-0 sm:py-0">
          {visibleTabs.map((tab) => {
            const locked = isAdminLocked(tab.key, mergedTabEnabled);
            const disabled = isAuthenticated && !locked && tab.requireSubmission && !canAccessRestrictedTabs;

            return (
              <button
                key={tab.key}
                type="button"
                className={tabClassName(activeTab === tab.key, disabled, locked || !isAuthenticated)}
                disabled={disabled}
                onClick={() => setActiveTab(tab.key)}
                title={
                  locked
                    ? tabLockedMessage
                    : !isAuthenticated
                      ? "로그인 후 이용할 수 있습니다."
                      : disabled
                        ? "답안 제출 후 열리는 기능입니다."
                        : undefined
                }
              >
                {locked ? LOCK_ICON_SMALL : null}
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
