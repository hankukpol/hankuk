"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CalendarCheck, GraduationCap, ScrollText, Star, Trophy, UserRound } from "lucide-react";

type StudentPortalTabsProps = {
  divisionSlug: string;
  current:
    | "management-policy"
    | "attendance"
    | "study-ranking"
    | "points"
    | "exams"
    | "profile";
  policyEnabled?: boolean;
  attendanceEnabled?: boolean;
  pointsEnabled?: boolean;
  examsEnabled?: boolean;
};

const items = [
  { key: "management-policy", label: "관리규정", href: "management-policy", Icon: ScrollText },
  { key: "attendance", label: "출석", href: "attendance", Icon: CalendarCheck },
  { key: "study-ranking", label: "학습 랭킹", href: "study-ranking", Icon: Trophy },
  { key: "points", label: "상벌점", href: "points", Icon: Star },
  { key: "exams", label: "성적", href: "exams", Icon: GraduationCap },
  // 신원 정보는 화면마다 붙어 있지 않고 이 항목 하나로 들어간다.
  { key: "profile", label: "내 정보", href: "profile", Icon: UserRound },
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
    /* 좁은 화면에서는 화면 아래 고정 바가 된다. 엄지가 닿는 곳에 두면 화면을 오갈 때마다
       위로 손을 올리지 않아도 되고, 위쪽 자리는 보러 온 내용에 돌아간다. */
    <nav ref={navRef} className="admin-tabs admin-portal-nav" aria-label="학생 메뉴">
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
            <item.Icon className="admin-portal-nav-icon" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
