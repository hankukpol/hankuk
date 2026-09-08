"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { playNotificationBeep, showBrowserNotification } from "@/lib/browser-notify";
import { nextPollIntervalMs, shouldNotifyForMessage } from "@/lib/chat-meta";
import {
  bumpChatSignal,
  setChatConnectionMode,
  setChatLatestMessageId,
  setChatUnreadCount,
} from "@/lib/chat-store";

type StaffChatWatcherProps = {
  divisionSlug: string;
  divisionName: string;
  viewerId: string;
  enabled: boolean;
  initialUnreadCount: number;
};

type UnreadPayload = {
  unreadCount: number;
  latestMessage: {
    id: string;
    authorId: string | null;
    authorName: string;
    preview: string;
    createdAt: string;
  } | null;
};

const NOTIFIED_CACHE_LIMIT = 200;

/**
 * 레이아웃에 한 번 마운트되어 어느 화면에 있든 새 메시지를 감시한다.
 * 화면을 그리지 않는다.
 */
export function StaffChatWatcher({
  divisionSlug,
  divisionName,
  viewerId,
  enabled,
  initialUnreadCount,
}: StaffChatWatcherProps) {
  const pathname = usePathname();
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const notifiedRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const pathnameRef = useRef(pathname);

  pathnameRef.current = pathname;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setChatConnectionMode("off");
      return;
    }

    setChatUnreadCount(initialUnreadCount);
    setChatConnectionMode("polling");
  }, [enabled, initialUnreadCount]);

  const remember = useCallback((messageId: string) => {
    const seen = notifiedRef.current;
    seen.add(messageId);

    if (seen.size > NOTIFIED_CACHE_LIMIT) {
      // 오래된 것부터 버린다. Set 은 삽입 순서를 유지한다.
      const excess = seen.size - NOTIFIED_CACHE_LIMIT;

      for (const id of Array.from(seen).slice(0, excess)) {
        seen.delete(id);
      }
    }
  }, []);

  const poll = useCallback(async () => {
    // 응답이 읽음 처리보다 낡았는지 판단할 수 있도록 시작 시각을 남긴다.
    const startedAt = Date.now();

    try {
      const response = await fetch(`/api/${divisionSlug}/chat/unread`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("unread fetch failed");
      }

      const payload = (await response.json()) as UnreadPayload;

      if (!mountedRef.current) {
        return;
      }

      failuresRef.current = 0;
      setChatUnreadCount(payload.unreadCount, startedAt);

      const latest = payload.latestMessage;

      if (latest) {
        setChatLatestMessageId(latest.id);

        const isNew = !notifiedRef.current.has(latest.id);

        // 첫 조회는 기존 메시지를 알리지 않고 기준선만 잡는다.
        if (isFirstPollRef.current) {
          remember(latest.id);
        } else if (isNew) {
          const chatPath = pathnameRef.current?.endsWith("/chat") ?? false;

          if (
            shouldNotifyForMessage({
              authorId: latest.authorId,
              messageId: latest.id,
              viewerId,
              isDeleted: false,
              isHidden: document.visibilityState === "hidden",
              isOnChatPage: chatPath,
              alreadyNotified: false,
            })
          ) {
            playNotificationBeep();
            showBrowserNotification(`${divisionName} 직원 채팅`, `${latest.authorName}: ${latest.preview}`, {
              tag: "staff-chat",
              onClick: () => {
                window.location.href = `${pathnameRef.current?.includes("/assistant") ? `/${divisionSlug}/assistant` : `/${divisionSlug}/admin`}/chat`;
              },
            });
          }

          remember(latest.id);
          bumpChatSignal();
        }
      }

      isFirstPollRef.current = false;
    } catch {
      failuresRef.current += 1;
    }
  }, [divisionName, divisionSlug, remember, viewerId]);

  // 단일 타이머. 간격은 (연결 상태, 탭 표시 여부, 연속 실패)로 정한다.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const schedule = () => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
      const delay = nextPollIntervalMs("polling", visibility, failuresRef.current);

      if (delay === null) {
        return;
      }

      timerRef.current = setTimeout(async () => {
        await poll();
        schedule();
      }, delay);
    };

    const runNow = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      void poll().then(schedule);
    };

    runNow();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        runNow();
      }
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", runNow);

    return () => {
      cancelled = true;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", runNow);
    };
  }, [enabled, poll]);

  return null;
}
