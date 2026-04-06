import Link from "next/link";

import { portalCardClass } from "@/components/student-view/StudentPortalUi";

type StudentPortalTabsProps = {
  divisionSlug: string;
  current:
    | "dashboard"
    | "announcements"
    | "attendance"
    | "study-ranking"
    | "points"
    | "exams";
  attendanceEnabled?: boolean;
  announcementsEnabled?: boolean;
  pointsEnabled?: boolean;
  examsEnabled?: boolean;
};

const items = [
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
  attendanceEnabled = true,
  announcementsEnabled = true,
  pointsEnabled = true,
  examsEnabled = true,
}: StudentPortalTabsProps) {
  const visibleItems = items.filter((item) => {
    if (item.key === "attendance") return attendanceEnabled;
    if (item.key === "announcements") return announcementsEnabled;
    if (item.key === "points") return pointsEnabled;
    if (item.key === "exams") return examsEnabled;
    return true;
  });

  const baseColsClass =
    visibleItems.length >= 5
      ? "grid-cols-3"
      : visibleItems.length === 4
        ? "grid-cols-2"
        : visibleItems.length === 3
          ? "grid-cols-3"
          : "grid-cols-2";
  const mdColsClass =
    visibleItems.length >= 6
      ? "md:grid-cols-6"
      : visibleItems.length === 5
        ? "md:grid-cols-5"
        : visibleItems.length === 4
          ? "md:grid-cols-4"
          : visibleItems.length === 3
            ? "md:grid-cols-3"
            : "md:grid-cols-2";
  const gridClass = `grid gap-1 ${baseColsClass} ${mdColsClass}`;

  return (
    <nav className={`${portalCardClass} p-1`}>
      <div className={gridClass}>
        {visibleItems.map((item) => {
          const isActive = current === item.key;
          const href = `/${divisionSlug}/student${item.href ? `/${item.href}` : ""}`;

          return (
            <Link
              key={item.key}
              href={href}
              prefetch={false}
              className={`flex min-h-[40px] items-center justify-center rounded-[10px] px-2 py-2 text-center text-[12px] font-medium leading-4 transition md:min-h-[44px] md:px-3 md:py-2.5 md:text-[13px] ${
                isActive
                  ? "font-semibold"
                  : "text-[var(--muted)] hover:bg-[#F4F4F2] hover:text-[var(--foreground)]"
              }`}
              style={
                isActive
                  ? {
                      color: "var(--division-color)",
                      backgroundColor: "rgb(var(--division-color-rgb) / 0.12)",
                    }
                  : undefined
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
