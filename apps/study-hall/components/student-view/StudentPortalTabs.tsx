import Link from "next/link";

type StudentPortalTabsProps = {
  divisionSlug: string;
  current:
    | "management-policy"
    | "dashboard"
    | "announcements"
    | "attendance"
    | "study-ranking"
    | "points"
    | "exams";
  policyEnabled?: boolean;
  attendanceEnabled?: boolean;
  announcementsEnabled?: boolean;
  pointsEnabled?: boolean;
  examsEnabled?: boolean;
};

const items = [
  { key: "management-policy", label: "관리규정", href: "management-policy" },
  { key: "dashboard", label: "대시보드", href: "" },
  { key: "announcements", label: "공지사항", href: "announcements" },
  { key: "attendance", label: "출석 상세", href: "attendance" },
  { key: "study-ranking", label: "학습 랭킹", href: "study-ranking" },
  { key: "points", label: "상벌점 상세", href: "points" },
  { key: "exams", label: "성적 상세", href: "exams" },
] as const;

export function StudentPortalTabs({
  divisionSlug,
  current,
  policyEnabled = false,
  attendanceEnabled = true,
  announcementsEnabled = true,
  pointsEnabled = true,
  examsEnabled = true,
}: StudentPortalTabsProps) {
  const visibleItems = items.filter((item) => {
    if (item.key === "management-policy") return policyEnabled;
    if (item.key === "attendance") return attendanceEnabled;
    if (item.key === "announcements") return announcementsEnabled;
    if (item.key === "points") return pointsEnabled;
    if (item.key === "exams") return examsEnabled;
    return true;
  });

  return (
    /* DESIGN.md 5.5 — 밑줄형 텍스트 탭. 선택 항목을 박스로 채우지 않는다. */
    <nav className="admin-subtabs flex-nowrap overflow-x-auto" aria-label="학생 메뉴">
      {visibleItems.map((item) => {
        const isActive = current === item.key;
        const href = `/${divisionSlug}/student${item.href ? `/${item.href}` : ""}`;

        return (
          <Link
            key={item.key}
            href={href}
            prefetch={false}
            className="admin-subtab shrink-0"
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
