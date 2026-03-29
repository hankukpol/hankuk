"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";

const COMMANDS = [
  // 페이지
  { label: "대시보드", href: "/admin", group: "페이지" },
  { label: "수강생 관리", href: "/admin/students", group: "페이지" },
  { label: "수강 등록", href: "/admin/enrollments", group: "페이지" },
  { label: "수납 관리", href: "/admin/payments", group: "페이지" },
  { label: "사유서 관리", href: "/admin/absence-notes", group: "페이지" },
  { label: "면담 관리", href: "/admin/counseling", group: "페이지" },
  { label: "공지사항", href: "/admin/notices", group: "페이지" },
  // 성적
  { label: "성적 입력", href: "/admin/scores/input", group: "성적" },
  { label: "성적 수정", href: "/admin/scores/edit", group: "성적" },
  { label: "성적 분석", href: "/admin/analytics", group: "성적" },
  { label: "수강 분석", href: "/admin/analytics/enrollments", group: "성적" },
  // 출결
  { label: "출결 관리", href: "/admin/attendance", group: "출결" },
  { label: "출결 캘린더", href: "/admin/attendance/calendar", group: "출결" },
  { label: "강의 출결", href: "/admin/attendance/lecture", group: "출결" },
  // 운영
  { label: "포인트 관리", href: "/admin/points", group: "운영" },
  { label: "알림 발송", href: "/admin/notifications", group: "운영" },
  { label: "탈락·경고", href: "/admin/dropout", group: "운영" },
  { label: "합격자 관리", href: "/admin/graduates", group: "운영" },
  // 시설
  { label: "사물함 관리", href: "/admin/lockers", group: "시설" },
  { label: "스터디룸", href: "/admin/study-rooms", group: "시설" },
  // 설정
  { label: "직원 관리", href: "/admin/settings/staff", group: "설정" },
  { label: "강좌 설정", href: "/admin/settings/courses", group: "설정" },
  { label: "기수 설정", href: "/admin/settings/cohorts", group: "설정" },
  { label: "교재 설정", href: "/admin/settings/textbooks", group: "설정" },
  // 데이터
  { label: "감사 로그", href: "/admin/audit-log", group: "데이터" },
  { label: "데이터 내보내기", href: "/admin/export", group: "데이터" },
];

const GROUPS = ["페이지", "성적", "출결", "운영", "시설", "설정", "데이터"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 pt-20 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-[24px] border border-ink/10 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
            <svg
              className="h-4 w-4 shrink-0 text-slate"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Command.Input
              autoFocus
              placeholder="페이지 또는 기능 검색..."
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate/50"
            />
            <kbd className="rounded border border-ink/10 bg-mist px-1.5 py-0.5 text-xs text-slate">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-slate">
              검색 결과가 없습니다.
            </Command.Empty>
            {GROUPS.map((group) => {
              const items = COMMANDS.filter((c) => c.group === group);
              if (items.length === 0) return null;
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-slate/60"
                >
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => {
                        router.push(item.href);
                        setOpen(false);
                      }}
                      className="flex cursor-pointer items-center rounded-2xl px-3 py-2.5 text-sm text-ink transition aria-selected:bg-mist aria-selected:text-ember"
                    >
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
          <div className="border-t border-ink/10 px-5 py-3 flex items-center gap-4">
            <span className="text-xs text-slate">
              <kbd className="rounded border border-ink/10 bg-mist px-1 py-0.5 font-mono text-xs">↑</kbd>
              <kbd className="ml-1 rounded border border-ink/10 bg-mist px-1 py-0.5 font-mono text-xs">↓</kbd>
              {" "}이동
            </span>
            <span className="text-xs text-slate">
              <kbd className="rounded border border-ink/10 bg-mist px-1.5 py-0.5 font-mono text-xs">Enter</kbd>
              {" "}실행
            </span>
            <span className="ml-auto text-xs text-slate">
              <kbd className="rounded border border-ink/10 bg-mist px-1 py-0.5 font-mono text-xs">Ctrl</kbd>
              {" "}+{" "}
              <kbd className="rounded border border-ink/10 bg-mist px-1 py-0.5 font-mono text-xs">K</kbd>
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
