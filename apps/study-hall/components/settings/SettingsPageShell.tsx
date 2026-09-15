"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

export type SettingsSectionId =
  | "templates"
  | "general"
  | "features"
  | "periods"
  | "rules"
  | "tuition"
  | "seats"
  | "exams"
  | "exam-schedules"
  | "point-rules"
  | "staff";

const SETTINGS_TABS: ReadonlyArray<{
  id: SettingsSectionId;
  label: string;
  path: string;
}> = [
  { id: "templates", label: "설정 템플릿", path: "settings/templates" },
  { id: "general", label: "기본 정보", path: "settings/general" },
  { id: "features", label: "기능", path: "settings/features" },
  { id: "periods", label: "교시", path: "settings/periods" },
  { id: "rules", label: "운영 규칙", path: "settings/rules" },
  { id: "tuition", label: "등록 금액", path: "settings/tuition" },
  { id: "seats", label: "자습실·좌석", path: "settings/seats" },
  { id: "exams", label: "시험 템플릿", path: "settings/exams" },
  { id: "exam-schedules", label: "시험 일정", path: "settings/exam-schedules" },
  { id: "point-rules", label: "상벌점 규칙", path: "points/rules" },
  { id: "staff", label: "직원", path: "staff" },
];

function SettingsRouteTabs({
  divisionSlug,
  activeId,
}: {
  divisionSlug: string;
  activeId: SettingsSectionId;
}) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const revealCurrentTab = () => {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
      const frame = nav.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      nav.scrollLeft += tab.left - frame.left - (frame.width - tab.width) / 2;
    };
    revealCurrentTab();
    window.addEventListener("resize", revealCurrentTab);
    return () => window.removeEventListener("resize", revealCurrentTab);
  }, [activeId, divisionSlug]);

  return (
    <nav ref={navRef} className="admin-tabs" aria-label="설정 항목">
      {SETTINGS_TABS.map((item) => {
        const isActive = item.id === activeId;

        return (
          <Link
            key={item.id}
            href={`/${divisionSlug}/admin/${item.path}`}
            className="admin-tab"
            data-active={isActive}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsPageShell({
  divisionSlug,
  activeId,
  title,
  description,
  children,
  mobileTitleInShell = false,
}: {
  divisionSlug: string;
  activeId: SettingsSectionId;
  title: string;
  description: ReactNode;
  children: ReactNode;
  mobileTitleInShell?: boolean;
}) {
  return (
    <div className="admin-flat-page admin-compact-workspace admin-settings-workspace">
      <section className={mobileTitleInShell ? "max-md:sr-only" : undefined}>
        <h1 className="admin-page-title">{title}</h1>
        <p className="admin-page-description">{description}</p>
      </section>

      <SettingsRouteTabs divisionSlug={divisionSlug} activeId={activeId} />

      {children}
    </div>
  );
}
