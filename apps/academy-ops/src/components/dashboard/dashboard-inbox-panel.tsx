"use client";

import Link from "next/link";
import { useState } from "react";
import type { DashboardInboxData, DashboardInboxItem } from "@/lib/dashboard/inbox";

type DashboardInboxPanelProps = {
  initialData: DashboardInboxData;
  canRetry: boolean;
};

type RetryResultStatus = "sent" | "failed" | "skipped";

type RetryResponse = {
  sourceLogId: number;
  log: {
    id: number;
    status: string;
  };
};

const RETRY_STATUS_LABEL: Record<RetryResultStatus, string> = {
  sent: "발송 완료",
  failed: "실패",
  skipped: "건너뜀",
};

const ITEM_STYLE: Record<DashboardInboxItem["type"], { label: string; badge: string }> = {
  ABSENCE_NOTE_PENDING: {
    label: "사유서 대기",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  },
  NOTIFICATION_FAILED: {
    label: "발송 실패",
    badge: "border-red-200 bg-red-50 text-red-700",
  },
  SCORE_MISSING: {
    label: "성적 입력",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
  },
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: init?.cache ?? "no-store",
  });

  const text = await response.text();
  const payload = text.trim()
    ? (JSON.parse(text) as T & { error?: string })
    : ({} as T & { error?: string });

  if (!response.ok) {
    throw new Error(payload.error ?? "요청에 실패했습니다.");
  }

  return payload as T;
}

function isRetryResultStatus(value: string): value is RetryResultStatus {
  return value === "sent" || value === "failed" || value === "skipped";
}

function isRetryResponse(value: unknown): value is RetryResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    sourceLogId?: unknown;
    log?: {
      id?: unknown;
      status?: unknown;
    };
  };

  return (
    Number.isInteger(payload.sourceLogId) &&
    Number.isInteger(payload.log?.id) &&
    typeof payload.log?.status === "string"
  );
}

function applyRetryResult(
  current: DashboardInboxData,
  sourceLogId: number,
  nextLogId: number,
  nextStatus: RetryResultStatus,
): DashboardInboxData {
  const nextFailedCount =
    nextStatus === "failed"
      ? current.counts.failedNotifications
      : Math.max(0, current.counts.failedNotifications - 1);
  const nextTotal = nextStatus === "failed" ? current.total : Math.max(0, current.total - 1);

  return {
    ...current,
    total: nextTotal,
    counts: {
      ...current.counts,
      failedNotifications: nextFailedCount,
    },
    items: current.items.flatMap((item) => {
      if (item.retryPayload?.notificationLogId !== sourceLogId) {
        return [item];
      }

      if (nextStatus !== "failed") {
        return [];
      }

      return [
        {
          ...item,
          id: `notification-log-${nextLogId}`,
          retryPayload: {
            notificationLogId: nextLogId,
          },
        },
      ];
    }),
  };
}

export function DashboardInboxPanel({ initialData, canRetry }: DashboardInboxPanelProps) {
  const [data, setData] = useState(initialData);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeRetryId, setActiveRetryId] = useState<number | null>(null);

  async function refreshInbox() {
    const next = await requestJson<DashboardInboxData>("/api/dashboard/inbox", {
      method: "GET",
    });
    setData(next);
  }

  async function retryNotification(notificationLogId: number) {
    if (activeRetryId !== null) {
      return;
    }

    setNotice(null);
    setErrorMessage(null);
    setActiveRetryId(notificationLogId);

    try {
      const result = await requestJson<unknown>("/api/dashboard/inbox/retry", {
        method: "POST",
        body: JSON.stringify({ notificationLogId }),
      });

      if (!isRetryResponse(result)) {
        try {
          await refreshInbox();
          setNotice("실패 알림을 다시 시도했습니다. 최신 상태를 다시 불러왔습니다.");
        } catch {
          setErrorMessage(
            "알림 재시도 응답 형식을 확인하지 못했고 목록 새로고침에도 실패했습니다. 알림 센터에서 상태를 확인해 주세요.",
          );
        }
        return;
      }

      if (!isRetryResultStatus(result.log.status)) {
        try {
          await refreshInbox();
          setNotice("실패 알림을 다시 시도했습니다. 최신 상태를 다시 불러왔습니다.");
        } catch {
          setErrorMessage(
            "알림 재시도 응답 상태를 확인하지 못했고 목록 새로고침에도 실패했습니다. 알림 센터에서 상태를 확인해 주세요.",
          );
        }
        return;
      }

      const retryStatus = result.log.status;
      const statusLabel = RETRY_STATUS_LABEL[retryStatus];

      setData((current) =>
        applyRetryResult(current, result.sourceLogId, result.log.id, retryStatus),
      );
      setNotice(`실패 알림을 다시 시도했습니다. 결과: ${statusLabel}`);

      try {
        await refreshInbox();
      } catch {
        setNotice(
          `실패 알림을 다시 시도했습니다. 결과: ${statusLabel}. 목록 새로고침에 실패해 최신 상태가 일부 늦게 보일 수 있습니다.`,
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "재시도에 실패했습니다.");
    } finally {
      setActiveRetryId(null);
    }
  }

  const summaryPills = [
    {
      key: "absence",
      label: "사유서 대기",
      value: data.counts.pendingAbsenceNotes,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      key: "failed",
      label: "발송 실패",
      value: data.counts.failedNotifications,
      className: "border-red-200 bg-red-50 text-red-700",
    },
    {
      key: "scores",
      label: "성적 입력",
      value: data.counts.missingScores,
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
  ];

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">즉시 처리 필요</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            사유서 검토, 실패 알림 재시도, 오늘 성적 입력 진행 상황을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summaryPills.map((pill) => (
            <div
              key={pill.key}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${pill.className}`}
            >
              <span>{pill.label}</span>
              <span>{pill.value}</span>
            </div>
          ))}
        </div>
      </div>

      {notice ? (
        <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-forest/30 bg-forest/5 px-5 py-8 text-sm text-forest">
          현재 즉시 처리할 항목이 없습니다.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {data.items.map((item) => {
            const style = ITEM_STYLE[item.type];
            const retryPayload = item.retryPayload;
            const retryId = retryPayload?.notificationLogId ?? null;
            const isActiveRetry = activeRetryId === retryId;
            const retryDisabled = activeRetryId !== null;

            return (
              <li key={item.id} className="rounded-[24px] border border-ink/10 bg-mist/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-xs text-slate">{item.createdAtLabel}</span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate">{item.description}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {retryPayload && canRetry ? (
                      <button
                        type="button"
                        onClick={() => {
                          void retryNotification(retryPayload.notificationLogId);
                        }}
                        disabled={retryDisabled}
                        className="inline-flex items-center rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isActiveRetry ? "재시도 중..." : "재시도"}
                      </button>
                    ) : null}
                    <Link
                      href={item.actionUrl}
                      className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}