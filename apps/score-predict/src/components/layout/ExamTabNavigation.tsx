"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { withTenantPrefix } from "@/lib/tenant";

interface ExamTabNavigationProps {
  hasSubmission: boolean;
  finalPredictionEnabled?: boolean;
  commentsEnabled?: boolean;
}

interface TabItem {
  key: "main" | "input" | "result" | "final" | "prediction" | "comments";
  href: string;
  label: string;
  disabled: boolean;
  tooltip?: string;
}

function tabClassName(active: boolean, disabled: boolean): string {
  const base =
    "inline-flex min-h-12 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition sm:min-w-[120px]";

  if (disabled) {
    return `${base} cursor-not-allowed border-transparent text-slate-400`;
  }

  if (active) {
    return `${base} border-service-700 text-service-700`;
  }

  return `${base} border-transparent text-slate-500 hover:border-service-300 hover:text-service-700`;
}

export default function ExamTabNavigation({
  hasSubmission,
  finalPredictionEnabled = false,
  commentsEnabled = true,
}: ExamTabNavigationProps) {
  const pathname = usePathname();
  const tenant = useTenantConfig();

  const tabs: TabItem[] = [
    { key: "main", href: withTenantPrefix("/exam/main", tenant.type), label: "풀서비스 메인", disabled: false },
    { key: "input", href: withTenantPrefix("/exam/input", tenant.type), label: "응시정보 입력", disabled: false },
    {
      key: "result",
      href: withTenantPrefix("/exam/result", tenant.type),
      label: "내 성적 분석",
      disabled: !hasSubmission,
      tooltip: "답안을 먼저 제출해야 열 수 있습니다.",
    },
    {
      key: "final",
      href: withTenantPrefix("/exam/final", tenant.type),
      label: "최종 환산 예측",
      disabled: !hasSubmission,
      tooltip: "답안을 먼저 제출해야 열 수 있습니다.",
    },
    {
      key: "prediction",
      href: withTenantPrefix("/exam/prediction", tenant.type),
      label: "합격 예측",
      disabled: !hasSubmission,
      tooltip: "답안을 먼저 제출해야 열 수 있습니다.",
    },
    {
      key: "comments",
      href: withTenantPrefix("/exam/comments", tenant.type),
      label: "실시간 의견",
      disabled: !hasSubmission,
      tooltip: "답안을 먼저 제출해야 열 수 있습니다.",
    },
  ];

  const visibleTabs = tabs.filter((tab) => {
    if (tab.key === "final") return finalPredictionEnabled;
    if (tab.key === "comments") return commentsEnabled;
    return true;
  });

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl min-w-max overflow-x-auto px-1 sm:px-4">
        {visibleTabs.map((tab) => {
          const active = pathname === tab.href;

          if (tab.disabled) {
            return (
              <span
                key={tab.href}
                className={tabClassName(active, true)}
                title={tab.tooltip}
                aria-disabled="true"
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link key={tab.href} href={tab.href} className={tabClassName(active, false)} title={tab.tooltip}>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
