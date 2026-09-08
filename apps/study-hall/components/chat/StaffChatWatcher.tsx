"use client";

import { useCallback, useEffect, useRef } from "react";

import { playNotificationBeep, showBrowserNotification } from "@/lib/browser-notify";
import { nextPollIntervalMs, shouldNotifyForMessage } from "@/lib/chat-meta";
import { subscribeToChatSignal } from "@/lib/supabase/realtime";
import {
  bumpChatSignal,
  isChatDockOpen,
  requestOpenChat,
  setChatConnectionMode,
  setChatLatestMessageId,
  setChatUnreadCount,
  useChatStore,
} from "@/lib/chat-store";

type StaffChatWatcherProps = {
  divisionSlug: string;
  divisionId: string;
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
  divisionId,
  divisionName,
  viewerId,
  enabled,
  initialUnreadCount,
}: StaffChatWatcherProps) {
  // 도크가 열리고 닫힐 때 폴링 주기를 즉시 바꿔야 하므로 구독한다.
  const { isOpen } = useChatStore();
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const notifiedRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const modeRef = useRef<"realtime" | "polling">("polling");
  const pollRef = useRef<() => Promise<void>>(async () => {});
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
    // 연결 상태는 실시간 구독 결과가 나온 뒤에 정한다.
    // 먼저 polling 으로 표시하면 첫 로드마다 안내가 깜빡였다 사라진다.
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
          if (
            shouldNotifyForMessage({
              authorId: latest.authorId,
              messageId: latest.id,
              viewerId,
              isDeleted: false,
              isHidden: document.visibilityState === "hidden",
              // 채팅은 별도 페이지가 아니라 도크다. 열어놓고 보는 중이면 알리지 않는다.
              isOnChatPage: isChatDockOpen(),
              alreadyNotified: false,
            })
          ) {
            playNotificationBeep();
            showBrowserNotification(`${divisionName} 직원 채팅`, `${latest.authorName}: ${latest.preview}`, {
              tag: "staff-chat",
              // 이동하지 않고 그 자리에서 도크를 연다.
              onClick: requestOpenChat,
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

  // 렌더 중에 ref 를 건드리지 않는다.
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  // 실시간 구독. 붙으면 폴링은 안전망으로 물러나고, 실패하면 폴링이 그대로 주 경로가 된다.
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = subscribeToChatSignal(divisionId, {
      onSignal: () => {
        void pollRef.current();
      },
      onStatus: (status) => {
        modeRef.current = status === "connected" ? "realtime" : "polling";
        setChatConnectionMode(modeRef.current);
      },
    });

    return () => {
      unsubscribe();
      modeRef.current = "polling";
    };
  }, [divisionId, enabled]);

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
      // 채팅창을 열고 있는 동안은 4초로 좁혀 대화가 끊기지 않게 한다.
      const delay = nextPollIntervalMs(modeRef.current, visibility, failuresRef.current, isChatDockOpen());

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
    // isOpen 이 바뀌면 루프를 다시 걸어 새 주기가 곧바로 적용된다.
  }, [enabled, isOpen, poll]);

  return null;
}
