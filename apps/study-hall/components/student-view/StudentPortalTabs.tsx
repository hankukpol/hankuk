"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type StudentPortalTabsProps = {
  divisionSlug: string;
  current:
    | "management-policy"
    | "attendance"
    | "study-ranking"
    | "points"
    | "exams";
  policyEnabled?: boolean;
  attendanceEnabled?: boolean;
  pointsEnabled?: boolean;
  examsEnabled?: boolean;
};

const items = [
  { key: "management-policy", label: "관리규정", href: "management-policy" },
  { key: "attendance", label: "출석", href: "attendance" },
  { key: "study-ranking", label: "학습 랭킹", href: "study-ranking" },
  { key: "points", label: "상벌점", href: "points" },
  { key: "exams", label: "성적", href: "exams" },
] as const;

export function StudentPortalTabs({
  divisionSlug,
  current,
  policyEnabled = false,
  attendanceEnabled = true,
  pointsEnabled = true,
  examsEnabled = true,
}: StudentPortalTabsProps) {
  const navRef = useRef<HTMLElement | null>(null);

  // DESIGN.md 5.4 — 긴 메뉴는 탭 영역 안에서 가로로 스크롤하되 활성 탭은 보이게 맞춘다.
  useEffect(() => {
    const nav = navRef.current;
    const activeTab = nav?.querySelector<HTMLElement>('[data-active="true"]');

    if (!nav || !activeTab) {
      return;
    }

    const navBox = nav.getBoundingClientRect();
    const tabBox = activeTab.getBoundingClientRect();

    if (tabBox.left >= navBox.left && tabBox.right <= navBox.right) {
      return;
    }

    nav.scrollTo({
      left: nav.scrollLeft + (tabBox.left - navBox.left),
      behavior: "auto",
    });
  }, [current]);

  const visibleItems = items.filter((item) => {
    if (item.key === "management-policy") return policyEnabled;
    if (item.key === "attendance") return attendanceEnabled;
    if (item.key === "points") return pointsEnabled;
    if (item.key === "exams") return examsEnabled;
    return true;
  });

  return (
    /* DESIGN.md 5.4 — 화면 이동은 1차 폴더 탭이다.
       경로를 오가므로 button/onChange 대신 Link 와 aria-current 를 쓴다. */
    <nav ref={navRef} className="admin-tabs" aria-label="학생 메뉴">
      {visibleItems.map((item) => {
        const isActive = current === item.key;
        const href = `/${divisionSlug}/student${item.href ? `/${item.href}` : ""}`;

        return (
          <Link
            key={item.key}
            href={href}
            prefetch={false}
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
