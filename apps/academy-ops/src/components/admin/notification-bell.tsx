"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: number;
  type: string;
  channel: string;
  status: string;
  message: string;
  sentAt: string;
  studentName: string | null;
  examNumber: string;
  isNew: boolean;
};

type UnreadResponse = {
  data: {
    notifications: NotificationItem[];
    unreadCount: number;
  };
};

const LAST_READ_KEY = "notif_last_read_at";
const POLL_INTERVAL_MS = 60 * 1000; // 1분마다 폴링

function getTypeIcon(type: string): string {
  if (type === "PAYMENT_COMPLETE") return "💰";
  if (type === "ENROLLMENT_COMPLETE") return "📋";
  if (type === "REFUND_COMPLETE") return "↩️";
  if (type === "WARNING_1" || type === "WARNING_2" || type === "DROPOUT") return "⚠️";
  if (type === "SCORE_DEADLINE") return "📝";
  if (type === "NOTICE") return "📢";
  if (type === "ABSENCE_NOTE") return "📄";
  if (type === "POINT") return "⭐";
  return "🔔";
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    PAYMENT_COMPLETE: "수납 완료",
    ENROLLMENT_COMPLETE: "수강 등록",
    REFUND_COMPLETE: "환불",
    WARNING_1: "1차 경고",
    WARNING_2: "2차 경고",
    DROPOUT: "탈락",
    SCORE_DEADLINE: "성적 마감",
    ABSENCE_NOTE: "사유서",
    NOTICE: "공지",
    POINT: "포인트",
  };
  return labels[type] ?? type;
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getLastReadAt = () => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ?? null;
  };

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const lastReadAt = getLastReadAt();
      const url = lastReadAt
        ? `/api/notifications/unread?lastReadAt=${encodeURIComponent(lastReadAt)}`
        : "/api/notifications/unread";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as UnreadResponse;
      setNotifications(payload.data.notifications);
      setUnreadCount(payload.data.unreadCount);
    } catch {
      // 네트워크 오류 무시
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 마운트 시 + 주기적 폴링
  useEffect(() => {
    void fetchNotifications();
    const timer = setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      void fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (res.ok) {
        const payload = (await res.json()) as { data: { readAt: string } };
        localStorage.setItem(LAST_READ_KEY, payload.data.readAt);
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isNew: false })));
      }
    } catch {
      // 무시
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 벨 버튼 */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-white/10 hover:text-white focus:outline-none"
        aria-label="알림"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-xl">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">알림</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-slate underline transition hover:text-ember"
                >
                  모두 읽음
                </button>
              )}
              {isLoading && (
                <span className="text-xs text-slate">로딩 중...</span>
              )}
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate">
                새 알림이 없습니다.
              </div>
            ) : (
              <ul>
                {notifications.map((notif) => (
                  <li
                    key={notif.id}
                    className={`border-b border-ink/5 px-4 py-3 last:border-0 ${
                      notif.isNew ? "bg-ember/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 text-lg leading-none">
                        {getTypeIcon(notif.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full border border-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate">
                            {getTypeLabel(notif.type)}
                          </span>
                          {notif.isNew && (
                            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-ink">
                          {notif.studentName
                            ? `${notif.studentName} (${notif.examNumber})`
                            : notif.examNumber}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate">
                          {notif.message}
                        </p>
                        <p className="mt-1 text-[10px] text-slate/70">
                          {formatRelativeTime(notif.sentAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 하단 */}
          <div className="border-t border-ink/10 px-4 py-3">
            <Link
              href="/admin/notifications/history"
              className="block text-center text-xs font-semibold text-forest underline transition hover:text-ember"
              onClick={() => setIsOpen(false)}
            >
              전체 알림 이력 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
