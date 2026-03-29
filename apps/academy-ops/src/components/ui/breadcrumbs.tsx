"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
  admin: "관리자",
  students: "수강생 관리",
  enrollments: "수강 등록",
  payments: "수납 관리",
  scores: "성적",
  input: "입력",
  edit: "수정",
  bulk: "일괄",
  "bulk-import": "일괄 가져오기",
  analytics: "성적 분석",
  attendance: "출결",
  calendar: "캘린더",
  lecture: "강의 출결",
  "absence-notes": "사유서 관리",
  counseling: "면담",
  prospects: "상담 대기",
  points: "포인트",
  dropout: "탈락·경고",
  export: "내보내기",
  "audit-log": "감사 로그",
  notices: "공지사항",
  settings: "설정",
  results: "성적표",
  integrated: "전체 성적표",
  monthly: "월별",
  query: "다차원 조회",
  lockers: "사물함",
  "study-rooms": "스터디룸",
  graduates: "합격자",
  reports: "보고서",
  settlements: "정산",
  daily: "일계표",
  textbooks: "교재",
  cohorts: "기수",
  courses: "강좌",
  staff: "직원",
  notifications: "알림",
  sessions: "회차",
  new: "신규 등록",
  contract: "수강계약서",
  card: "수강증",
  compare: "비교 분석",
  installments: "할부",
};

export function Breadcrumbs({
  dynamicLabels,
}: {
  dynamicLabels?: Record<string, string>;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = dynamicLabels?.[seg] ?? ROUTE_LABELS[seg] ?? seg;
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <svg
              className="h-3 w-3 shrink-0 text-slate/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
          {crumb.isLast ? (
            <span className="font-medium text-ink">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="transition hover:text-ink"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
