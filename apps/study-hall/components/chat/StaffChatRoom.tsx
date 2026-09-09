"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/browser-notify";
import { advanceChatCursor, canDeleteChatMessage, createChatSyncQueue, isNewChatArrival, mergeChatMessages } from "@/lib/chat-meta";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/chat-schemas";
import { chatStoreKey, getChatStore } from "@/lib/chat-store";
import { toast } from "@/lib/sonner";
import type { ChatAuthorRole, ChatMessageItem } from "@/lib/services/chat.service";

type StaffChatRoomProps = {
  divisionSlug: string;
  viewerId: string;
  viewerRole: ChatAuthorRole;
  initialMessages: ChatMessageItem[];
  initialHasMoreBefore: boolean;
  initialSyncedAt: string | null;
  /** 도크 감시자가 새 신호를 받을 때마다 올린다. 값이 바뀌면 증분 동기화한다. */
  signalAt?: number;
  connectionMode?: "realtime" | "polling" | "off";
};

const ROLE_LABEL: Record<ChatAuthorRole, string> = {
  SUPER_ADMIN: "최고관리자",
  ADMIN: "관리자",
  ASSISTANT: "조교",
};

const PENDING_PREFIX = "pending-";
const SCROLL_STICKY_THRESHOLD_PX = 120;
const READ_DEBOUNCE_MS = 1000;
const COMPOSER_MAX_HEIGHT_PX = 120;

function formatTime(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDay(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function StaffChatRoom({
  divisionSlug,
  viewerId,
  viewerRole,
  initialMessages,
  initialHasMoreBefore,
  initialSyncedAt,
  signalAt = 0,
  connectionMode = "off",
}: StaffChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  // Read acknowledgement has its own watermark: mutation responses are not a fetched history.
  const [readAnchor, setReadAnchor] = useState<ChatMessageItem | null>(initialMessages.at(-1) ?? null);
  const [hasMoreBefore, setHasMoreBefore] = useState(initialHasMoreBefore);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("granted");

  const store = getChatStore(chatStoreKey(divisionSlug, viewerId));
  const lifecycleRef = useRef<AbortController | null>(null);
  const syncRef = useRef<() => void>(() => {});
  const readInFlightRef = useRef(false);
  const lastReadIdRef = useRef<string | null>(null);
  const latestReceivedRef = useRef<string | null>(null);
  const syncedAtRef = useRef<string | null>(initialSyncedAt);
  const mountedRef = useRef(true);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const basePath = `/api/${divisionSlug}/chat`;

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    lifecycleRef.current = controller;

    return () => {
      mountedRef.current = false;
      controller.abort();

      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  const markRead = useCallback(() => {
    const id = latestReceivedRef.current;
    const signal = lifecycleRef.current?.signal;
    if (!id || id === lastReadIdRef.current || readInFlightRef.current ||
      signal?.aborted || document.visibilityState !== "visible") return;
    readInFlightRef.current = true;
    const finish = store.beginRead();
    void (async () => {
      try {
        const response = await fetch(`${basePath}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastReadMessageId: id }),
          cache: "no-store", signal,
        });
        if (!response.ok) return;
        const payload = await response.json() as { unreadCount: number };
        if (signal?.aborted) return;
        lastReadIdRef.current = id;
        finish(payload.unreadCount);
      } catch { /* A later successful sync retries the read. */ }
      finally {
        finish();
        readInFlightRef.current = false;
      }
    })();
  }, [basePath, store]);

  const scheduleMarkRead = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
    }

    readTimerRef.current = setTimeout(() => {
      if (mountedRef.current && document.visibilityState === "visible") {
        markRead();
      }
    }, READ_DEBOUNCE_MS);
  }, [markRead]);

  const applyIncoming = useCallback((incoming: ChatMessageItem[]) => {
    if (incoming.length === 0) {
      return;
    }

    setMessages((current) => mergeChatMessages(current, incoming));

  }, []);

  useEffect(() => {
    // Only an initial snapshot or fully drained sync is eligible, after React commits it.
    latestReceivedRef.current = readAnchor?.id ?? null;
    scheduleMarkRead();
  }, [readAnchor, scheduleMarkRead]);

  useEffect(() => {
    const signal = lifecycleRef.current?.signal;
    let cancelled = false;
    const queue = createChatSyncQueue(async () => {
      try {
        // Empty rooms still need a cursor; never use the client's clock as a server watermark.
        let since = syncedAtRef.current ?? "1970-01-01T00:00:00.000Z";
        let fetchedAnchor: ChatMessageItem | null = null;
        while (!cancelled) {
          const response = await fetch(`${basePath}/messages?since=${encodeURIComponent(since)}`, {
            cache: "no-store", signal,
          });
          if (!response.ok) return;
          const payload = await response.json() as {
            chatMessages?: ChatMessageItem[];
            syncedAt?: string | null;
          };
          if (cancelled || signal?.aborted) return;
          const incoming = payload.chatMessages ?? [];
          applyIncoming(incoming);
          for (const message of incoming) {
            if (isNewChatArrival(fetchedAnchor, message)) fetchedAnchor = message;
          }
          // Server returns every row tied at the page boundary, including pages over 200 rows.
          const next = payload.syncedAt ?? advanceChatCursor(syncedAtRef.current, incoming);
          if (next && next > since) syncedAtRef.current = next;
          if (incoming.length === 0 || !next || next <= since) break;
          since = next;
        }
        const completedAnchor = fetchedAnchor;
        if (completedAnchor) {
          setReadAnchor((current) => isNewChatArrival(current, completedAnchor) ? completedAnchor : current);
        }
        scheduleMarkRead();
      } catch { /* Polling and queued signals retry without dropping the cursor. */ }
    });
    const sync = () => { void queue.run(); };
    syncRef.current = sync;
    const onVisible = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    sync();
    return () => {
      cancelled = true;
      queue.dispose();
      syncRef.current = () => {};
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [applyIncoming, basePath, scheduleMarkRead]);

  useEffect(() => { syncRef.current(); }, [signalAt]);

  // 열자마자 맨 아래에서 시작한다.
  useEffect(() => {
    const body = bodyRef.current;

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, []);

  // 새 메시지가 와도 과거를 읽는 중이면 끌어내리지 않는다.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    const body = bodyRef.current;

    if (!body || !lastMessageId) {
      return;
    }

    const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;

    if (distanceFromBottom <= SCROLL_STICKY_THRESHOLD_PX) {
      body.scrollTop = body.scrollHeight;
    }
  }, [lastMessageId]);

  const handleLoadOlder = useCallback(async () => {
    const oldest = messages.find((message) => !message.id.startsWith(PENDING_PREFIX));

    if (!oldest || isLoadingOlder) {
      return;
    }

    const signal = lifecycleRef.current?.signal;
    setIsLoadingOlder(true);
    const body = bodyRef.current;
    const previousHeight = body?.scrollHeight ?? 0;

    try {
      const response = await fetch(`${basePath}/messages?before=${encodeURIComponent(oldest.id)}`, {
        cache: "no-store", signal,
      });

      if (!response.ok) {
        throw new Error("이전 메시지를 불러오지 못했습니다.");
      }

      const payload = (await response.json()) as {
        chatMessages?: ChatMessageItem[];
        hasMoreBefore?: boolean;
      };

      if (!mountedRef.current || signal?.aborted) {
        return;
      }

      setMessages((current) => mergeChatMessages(current, payload.chatMessages ?? []));
      setHasMoreBefore(Boolean(payload.hasMoreBefore));

      // 위에 내용이 붙은 만큼 스크롤을 밀어 읽던 위치를 지킨다.
      requestAnimationFrame(() => {
        if (body && !signal?.aborted) {
          body.scrollTop += body.scrollHeight - previousHeight;
        }
      });
    } catch (error) {
      if (!signal?.aborted) toast.error(error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.");
    } finally {
      if (mountedRef.current && !signal?.aborted) {
        setIsLoadingOlder(false);
      }
    }
  }, [basePath, isLoadingOlder, messages]);

  const resetComposerHeight = useCallback(() => {
    const node = composerRef.current;

    if (node) {
      node.style.height = "auto";
    }
  }, []);

  const handleSend = useCallback(async () => {
    const body = draft.trim();

    if (!body || isSending) {
      return;
    }

    const signal = lifecycleRef.current?.signal;
    const pendingId = `${PENDING_PREFIX}${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: ChatMessageItem = {
      id: pendingId,
      divisionId: "",
      authorId: viewerId,
      authorName: "나",
      authorRole: viewerRole,
      body,
      isDeleted: false,
      deletedAt: null,
      deletedByName: null,
      createdAt: now,
      updatedAt: now,
    };

    setDraft("");
    resetComposerHeight();
    setIsSending(true);
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await fetch(`${basePath}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
        cache: "no-store", signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | { chatMessage?: ChatMessageItem; error?: string }
        | null;

      if (!response.ok || !payload?.chatMessage) {
        throw new Error(payload?.error ?? "메시지를 보내지 못했습니다.");
      }

      if (!mountedRef.current || signal?.aborted) {
        return;
      }

      const saved = payload.chatMessage;
      setMessages((current) =>
        mergeChatMessages(
          current.filter((message) => message.id !== pendingId),
          [saved],
        ),
      );
      syncRef.current();
    } catch (error) {
      if (!mountedRef.current || signal?.aborted) {
        return;
      }

      // 실패하면 낙관적 행을 걷어내고 초안을 되돌려 준다.
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      setDraft((current) => (current ? current : body));
      toast.error(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      if (mountedRef.current && !signal?.aborted) {
        setIsSending(false);
      }
    }
  }, [basePath, draft, isSending, resetComposerHeight, viewerId, viewerRole]);

  const handleDelete = useCallback(
    async (message: ChatMessageItem) => {
      const signal = lifecycleRef.current?.signal;
      const confirmed = await confirm({
        title: "메시지를 삭제할까요?",
        description: "삭제해도 자리에는 삭제된 메시지로 남습니다.",
        confirmLabel: "삭제",
        variant: "danger",
      });

      if (!confirmed || signal?.aborted) {
        return;
      }

      try {
        const response = await fetch(`${basePath}/messages/${encodeURIComponent(message.id)}`, {
          method: "DELETE",
          cache: "no-store", signal,
        });

        const payload = (await response.json().catch(() => null)) as
          | { chatMessage?: ChatMessageItem; error?: string }
          | null;

        if (!response.ok || !payload?.chatMessage) {
          throw new Error(payload?.error ?? "메시지를 삭제하지 못했습니다.");
        }

        if (mountedRef.current && !signal?.aborted) {
          applyIncoming([payload.chatMessage]);
          syncRef.current();
        }
      } catch (error) {
        if (!signal?.aborted) toast.error(error instanceof Error ? error.message : "메시지를 삭제하지 못했습니다.");
      }
    },
    [applyIncoming, basePath, confirm],
  );

  const handleEnableNotifications = useCallback(async () => {
    const next = await requestBrowserNotificationPermission();
    setPermission(next);

    if (next === "denied") {
      toast.warning("브라우저 설정에서 알림을 허용해 주세요.");
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 한글 조합 중 Enter 는 글자를 확정하는 키다. 여기서 보내면 마지막 자모가 삼켜진다.
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }

      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  const handleDraftChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH));

    const node = event.target;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, []);

  /** 날짜가 바뀌는 첫 메시지에만 구분선을 붙인다. */
  const dayBreaks = useMemo(() => {
    const breaks = new Set<string>();
    let previousDay = "";

    for (const message of messages) {
      const day = message.createdAt.slice(0, 10);

      if (day !== previousDay) {
        breaks.add(message.id);
        previousDay = day;
      }
    }

    return breaks;
  }, [messages]);

  return (
    <>
      <div className="admin-chat-dock-body" ref={bodyRef}>
        {permission === "default" ? (
          <div className="admin-notice admin-chat-dock-notice">
            <span>다른 화면을 보고 있어도 새 메시지를 알려드립니다.</span>
            <button
              type="button"
              className="admin-button admin-button-compact"
              onClick={handleEnableNotifications}
            >
              알림 허용
            </button>
          </div>
        ) : null}

        {connectionMode === "polling" ? (
          /* 포털을 거쳐 들어오면 실시간이 원래 없다. 고장이 아니므로 경고색을 쓰지 않는다. */
          <p className="admin-help admin-chat-dock-status">새 메시지를 15초마다 확인합니다.</p>
        ) : null}

        {hasMoreBefore ? (
          <div className="admin-chat-dock-more">
            <button
              type="button"
              className="admin-button admin-button-compact"
              onClick={handleLoadOlder}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? "불러오는 중…" : "이전 메시지 더 보기"}
            </button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="admin-empty-state">아직 대화가 없습니다. 첫 메시지를 남겨보세요.</p>
        ) : (
          messages.map((message) => {
            const isOwn = message.authorId !== null && message.authorId === viewerId;
            const isPending = message.id.startsWith(PENDING_PREFIX);
            const canDelete =
              !message.isDeleted &&
              !isPending &&
              canDeleteChatMessage({ id: viewerId, role: viewerRole }, message);

            return (
              <div key={message.id}>
                {dayBreaks.has(message.id) ? (
                  <p className="admin-chat-day">{formatDay(message.createdAt)}</p>
                ) : null}

                <article className="admin-chat-message" data-own={isOwn}>
                  <p className="admin-chat-meta">
                    <span className="admin-chat-author">{message.authorName}</span>
                    {message.authorRole && !isOwn ? (
                      <span className="admin-badge">{ROLE_LABEL[message.authorRole]}</span>
                    ) : null}
                    <span>{isPending ? "보내는 중…" : formatTime(message.createdAt)}</span>
                    {canDelete ? (
                      <button
                        type="button"
                        className="admin-chat-delete"
                        onClick={() => void handleDelete(message)}
                      >
                        삭제
                      </button>
                    ) : null}
                  </p>

                  {message.isDeleted ? (
                    <p className="admin-chat-bubble admin-chat-bubble-deleted">삭제된 메시지</p>
                  ) : (
                    <p className="admin-chat-bubble">{message.body}</p>
                  )}
                </article>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-chat-dock-composer">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요"
          title="Enter 로 보내고 Shift+Enter 로 줄을 바꿉니다."
          aria-label="메시지 입력"
          rows={1}
        />
        <button
          type="button"
          className="admin-button admin-button-primary"
          onClick={() => void handleSend()}
          disabled={isSending || draft.trim().length === 0}
        >
          보내기
        </button>
      </div>

      {confirmDialog}
    </>
  );
}
