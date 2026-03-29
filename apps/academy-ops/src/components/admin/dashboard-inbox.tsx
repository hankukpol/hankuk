"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdminDashboardInboxResponse,
  InboxItem,
  InboxItemPriority,
  InboxItemType,
} from "@/app/api/admin/dashboard/inbox/route";

const POLL_INTERVAL_MS = 60_000;

// Priority dot colors
const PRIORITY_DOT: Record<InboxItemPriority, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-400",
  LOW: "bg-sky-400",
};

// Priority badge styles
const PRIORITY_BADGE: Record<InboxItemPriority, string> = {
  HIGH: "border-red-200 bg-red-50 text-red-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-sky-200 bg-sky-50 text-sky-700",
};

const PRIORITY_LABEL: Record<InboxItemPriority, string> = {
  HIGH: "긴급",
  MEDIUM: "보통",
  LOW: "참고",
};

const TYPE_LABEL: Record<InboxItemType, string> = {
  ABSENCE_NOTE_PENDING: "결석계",
  SCORE_MISSING: "성적 미입력",
  NOTIFICATION_FAILED: "발송 실패",
  INSTALLMENT_OVERDUE: "연체",
  ENROLLMENT_EXPIRING: "만료 임박",
};

const ACTION_LABEL: Record<InboxItemType, string> = {
  ABSENCE_NOTE_PENDING: "처리하기",
  SCORE_MISSING: "입력하기",
  NOTIFICATION_FAILED: "재발송",
  INSTALLMENT_OVERDUE: "확인하기",
  ENROLLMENT_EXPIRING: "확인하기",
};

function SkeletonRow() {
  return (
    <li className="rounded-[20px] border border-ink/10 bg-mist/40 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-ink/20" />
          <div className="h-4 w-32 animate-pulse rounded bg-ink/10" />
          <div className="h-4 w-48 animate-pulse rounded bg-ink/10" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-full bg-ink/10" />
      </div>
    </li>
  );
}

function formatLastUpdated(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours < 12 ? "오전" : "오후";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${period} ${displayHour}:${minutes}`;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AdminDashboardInboxResponse; fetchedAt: Date }
  | { status: "error"; message: string };

export function DashboardInbox() {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInbox = useCallback(async () => {
    setFetchState((prev) =>
      prev.status === "idle" ? { status: "loading" } : prev,
    );
    try {
      const res = await fetch("/api/admin/dashboard/inbox", {
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { data: AdminDashboardInboxResponse }
        | { error: string };

      if (!res.ok) {
        const errorMsg =
          "error" in json ? json.error : "인박스를 불러오지 못했습니다.";
        setFetchState({ status: "error", message: errorMsg });
        return;
      }

      if (!("data" in json)) {
        setFetchState({
          status: "error",
          message: "응답 형식을 인식하지 못했습니다.",
        });
        return;
      }

      setFetchState({
        status: "success",
        data: json.data,
        fetchedAt: new Date(),
      });
    } catch {
      setFetchState({
        status: "error",
        message: "네트워크 오류가 발생했습니다.",
      });
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  // Polling every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchInbox();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchInbox]);

  const handleRefresh = () => {
    void fetchInbox();
  };

  const isLoading = fetchState.status === "idle" || fetchState.status === "loading";
  const hasData = fetchState.status === "success";
  const hasError = fetchState.status === "error";
  const items: InboxItem[] = hasData ? fetchState.data.items : [];
  const totalCount: number = hasData ? fetchState.data.totalCount : 0;
  const lastUpdated: string | null = hasData ? fetchState.data.lastUpdated : null;

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">수신함</h2>
          {!isLoading && totalCount > 0 && (
            <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
              {totalCount}
            </span>
          )}
          {!isLoading && totalCount > 0 && (
            <span className="text-sm text-slate">처리 필요</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-forest/40 hover:bg-forest/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          새로고침
        </button>
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-ink/10" />

      {/* Error state */}
      {hasError && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchState.status === "error" ? fetchState.message : ""}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <ul className="mt-5 space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ul>
      )}

      {/* Empty state */}
      {!isLoading && !hasError && items.length === 0 && (
        <div className="mt-5 rounded-[24px] border border-dashed border-forest/30 bg-forest/5 px-5 py-8 text-center text-sm text-forest">
          모두 처리완료 — 처리가 필요한 항목이 없습니다.
        </div>
      )}

      {/* Items list */}
      {!isLoading && items.length > 0 && (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[20px] border border-ink/10 bg-mist/40 px-4 py-3 transition hover:border-ink/20 hover:bg-mist/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Left: dot + type badge + title + description */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`}
                    aria-label={PRIORITY_LABEL[item.priority]}
                  />
                  <span
                    className={`shrink-0 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_BADGE[item.priority]}`}
                  >
                    {TYPE_LABEL[item.type]}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-ink">
                    {item.title}
                  </span>
                  {item.count !== undefined && (
                    <span className="shrink-0 text-sm text-slate">
                      {item.count.toLocaleString()}건
                    </span>
                  )}
                </div>

                {/* Right: action link */}
                <Link
                  href={item.href}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-forest"
                >
                  {ACTION_LABEL[item.type]}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>

              {/* Description row */}
              <p className="mt-1.5 pl-10 text-xs leading-5 text-slate">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Footer: last updated */}
      {lastUpdated && (
        <p className="mt-4 text-right text-xs text-slate">
          마지막 갱신: {formatLastUpdated(lastUpdated)}
        </p>
      )}
    </section>
  );
}
