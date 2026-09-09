"use client";

import { useEffect, useRef } from "react";

import { playNotificationBeep, showBrowserNotification } from "@/lib/browser-notify";
import { createChatSyncQueue, isNewChatArrival, nextPollIntervalMs, shouldNotifyForMessage } from "@/lib/chat-meta";
import { subscribeToChatSignal } from "@/lib/supabase/realtime";
import { chatStoreKey, getChatStore, useChatStore } from "@/lib/chat-store";

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

/** Own one polling loop per identity. Realtime is only a wake-up signal. */
export function StaffChatWatcher(props: StaffChatWatcherProps) {
  return <ChatWatcherSession key={chatStoreKey(props.divisionSlug, props.viewerId)} {...props} />;
}

function ChatWatcherSession({
  divisionSlug, divisionId, divisionName, viewerId, enabled, initialUnreadCount,
}: StaffChatWatcherProps) {
  const key = chatStoreKey(divisionSlug, viewerId);
  const store = getChatStore(key);
  const { isOpen } = useChatStore(key);
  const initialCount = useRef(initialUnreadCount);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    store.reset();
    if (!enabled) return;
    store.set({ unreadCount: initialCount.current, mode: "polling" });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let first = true;
    let newest: UnreadPayload["latestMessage"] = null;
    let previousUnread = initialCount.current;
    let mode: "realtime" | "polling" = "polling";
    const controller = new AbortController();

    const schedule = () => {
      clearTimeout(timer);
      if (cancelled) return;
      const delay = nextPollIntervalMs(mode,
        document.visibilityState === "hidden" ? "hidden" : "visible",
        failures, store.getSnapshot().isOpen);
      if (delay !== null) timer = setTimeout(() => { void queue.run(); }, delay);
    };

    const queue = createChatSyncQueue(async () => {
      const token = store.beginUnreadRequest();
      try {
        const response = await fetch(`/api/${divisionSlug}/chat/unread`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("unread fetch failed");
        const payload = await response.json() as UnreadPayload;
        if (cancelled) return;
        failures = 0;
        // Polling must refresh edits/deletions too, even when the latest visible ID is unchanged.
        store.signal();
        if (!store.acceptUnread(payload.unreadCount, token)) return;
        const latest = payload.latestMessage;
        const arrival = isNewChatArrival(newest, latest);
        const unreadIncreased = payload.unreadCount > previousUnread;
        store.set({ latestMessageId: latest?.id ?? null });

        // Deleting the newest message exposes an older one: that is not a new arrival.
        // When our own send hides another author's arrival, use a generic unread notification.
        const candidate = arrival && latest?.authorId !== viewerId ? latest : null;
        const notify = !first && payload.unreadCount > 0 && (candidate !== null || unreadIncreased);
        if (notify && shouldNotifyForMessage({
          authorId: candidate?.authorId ?? null,
          messageId: candidate?.id ?? "unread",
          viewerId, isDeleted: false, alreadyNotified: false,
          isHidden: document.visibilityState === "hidden",
          isOnChatPage: store.getSnapshot().isOpen,
        })) {
          // Notification failures must not replay this batch on the next poll.
          previousUnread = payload.unreadCount;
          if (arrival) newest = latest;
          try {
            playNotificationBeep();
            showBrowserNotification(`${divisionName} 직원 채팅`,
              candidate ? `${candidate.authorName}: ${candidate.preview}` : "새로운 읽지 않은 메시지가 있습니다.", {
                tag: `staff-chat:${key}`,
                onClick: () => { if (!cancelled) store.requestOpen(); },
              });
          } catch { /* Browser permissions do not affect synchronization. */ }
        }
        if (arrival) newest = latest;
        previousUnread = payload.unreadCount;
        first = false;
      } catch {
        if (!cancelled) failures += 1;
      } finally {
        schedule();
      }
    });

    const wake = () => {
      clearTimeout(timer);
      void queue.run();
    };
    wakeRef.current = wake;
    const unsubscribe = subscribeToChatSignal(divisionId, {
      onSignal: () => {
        if (cancelled) return;
        store.signal();
        wake();
      },
      onStatus: (status) => {
        if (cancelled) return;
        mode = status === "connected" ? "realtime" : "polling";
        store.set({ mode });
        // Falling back from realtime must not leave a five-minute timer behind.
        wake();
      },
    });
    const visibility = () => {
      if (document.visibilityState === "visible") wake();
      else schedule();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", wake);
    wake();
    return () => {
      cancelled = true;
      wakeRef.current = () => {};
      clearTimeout(timer);
      queue.dispose();
      controller.abort();
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", wake);
      store.reset();
    };
  }, [divisionId, divisionName, divisionSlug, enabled, key, store, viewerId]);

  useEffect(() => { wakeRef.current(); }, [isOpen]);
  return null;
}
