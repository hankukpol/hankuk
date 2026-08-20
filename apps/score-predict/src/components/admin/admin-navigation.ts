import type { AdminSiteFeatureKey } from "@/lib/admin-site-features.shared";

export interface AdminNavigationItem {
  href: string;
  label: string;
  icon: string;
  feature?: AdminSiteFeatureKey;
  policeOnly?: boolean;
}

export interface AdminNavigationGroup {
  key: string;
  label: string;
  icon: string;
  items: AdminNavigationItem[];
}

export const adminDashboardItem: AdminNavigationItem = {
  href: "/admin",
  label: "대시보드",
  icon: "dashboard",
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  {
    key: "exam-ops",
    label: "시험 운영",
    icon: "exam",
    items: [
      { href: "/admin/exams", label: "시험 관리", icon: "exam", feature: "exams" },
      { href: "/admin/answers", label: "정답 관리", icon: "answers", feature: "answers" },
      { href: "/admin/regions", label: "모집인원 관리", icon: "regions", feature: "regions" },
      { href: "/admin/pass-cut", label: "합격컷 발표", icon: "release", feature: "passCut" },
    ],
  },
  {
    key: "participants",
    label: "참여자 관리",
    icon: "participants",
    items: [
      {
        href: "/admin/pre-registrations",
        label: "사전등록",
        icon: "registration",
        feature: "preRegistrations",
        policeOnly: true,
      },
      { href: "/admin/submissions", label: "제출 현황", icon: "submissions", feature: "submissions" },
      { href: "/admin/stats", label: "참여 통계", icon: "stats", feature: "stats" },
      { href: "/admin/visitors", label: "방문자 통계", icon: "visitors", feature: "visitors" },
      { href: "/admin/users", label: "사용자 관리", icon: "participants", feature: "users" },
      { href: "/admin/comments", label: "댓글 관리", icon: "comments", feature: "comments" },
    ],
  },
  {
    key: "content",
    label: "콘텐츠 관리",
    icon: "content",
    items: [
      { href: "/admin/promotions", label: "프로모션", icon: "content", feature: "promotions" },
      { href: "/admin/banners", label: "배너", icon: "content", feature: "banners" },
      { href: "/admin/events", label: "이벤트", icon: "events", feature: "events" },
      { href: "/admin/notices", label: "공지사항", icon: "comments", feature: "notices" },
      { href: "/admin/faqs", label: "FAQ", icon: "submissions", feature: "faqs" },
    ],
  },
];

export const adminSystemItems: AdminNavigationItem[] = [
  { href: "/admin/site", label: "사이트 설정", icon: "settings" },
  { href: "/admin/mock-data", label: "목업 데이터", icon: "database", feature: "mockData" },
];

export function isAdminNavigationItemActive(pathname: string, href: string): boolean {
  const normalize = (value: string) => value.replace(/^\/(police|fire)(?=\/|$)/, "") || "/";
  const currentPath = normalize(pathname);
  const targetPath = normalize(href);
  return targetPath === "/admin"
    ? currentPath === targetPath
    : currentPath.startsWith(targetPath);
}
