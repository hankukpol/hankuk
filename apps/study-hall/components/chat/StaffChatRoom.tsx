"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/browser-notify";
import { canDeleteChatMessage, mergeChatMessages } from "@/lib/chat-meta";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/chat-schemas";
import { markChatReadLocally } from "@/lib/chat-store";
import { toast } from "@/lib/sonner";
import type { ChatAuthorRole, ChatMessageItem } from "@/lib/services/chat.service";

type StaffChatRoomProps = {
  divisionSlug: string;
  viewerId: string;
  viewerRole: ChatAuthorRole;
  initialMessages: ChatMessageItem[];
  initialHasMoreBefore: boolean;
  initialSyncedAt: string | null;
  variant: "admin" | "assistant";
  /** 레이아웃 감시자가 새 신호를 받을 때마다 올린다. 값이 바뀌면 증분 동기화한다. */
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

function formatTime(iso: string) {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StaffChatRoom({
  divisionSlug,
  viewerId,
  viewerRole,
  initialMessages,
  initialHasMoreBefore,
  initialSyncedAt,
  variant,
  signalAt = 0,
  connectionMode = "off",
}: StaffChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(initialMessages);
  const [hasMoreBefore, setHasMoreBefore] = useState(initialHasMoreBefore);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>("granted");

  const syncedAtRef = useRef<string | null>(initialSyncedAt);
  const mountedRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const basePath = `/api/${divisionSlug}/chat`;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (readTimerRef.current) {
        clearTimeout(readTimerRef.current);
      }
    };
  }, []);

  // 권한 상태는 클라이언트에서만 알 수 있으므로 마운트 후에 읽는다.
  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  const markRead = useCallback(() => {
    markChatReadLocally();

    void fetch(`${basePath}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    }).catch(() => {
      // 읽음 처리 실패는 사용자에게 알릴 일이 아니다. 다음 기회에 다시 보낸다.
    });
  }, [basePath]);

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

    for (const message of incoming) {
      if (syncedAtRef.current === null || message.updatedAt > syncedAtRef.current) {
        syncedAtRef.current = message.updatedAt;
      }
    }
  }, []);

  const syncSince = useCallback(async () => {
    const since = syncedAtRef.current;

    if (!since) {
      return;
    }

    try {
      const response = await fetch(`${basePath}/messages?since=${encodeURIComponent(since)}`, {
        cache: "no-store",
      });

      if (!response.ok || !mountedRef.current) {
        return;
      }

      const payload = (await response.json()) as { chatMessages?: ChatMessageItem[] };
      applyIncoming(payload.chatMessages ?? []);
      scheduleMarkRead();
    } catch {
      // 동기화 실패는 조용히 넘긴다. 다음 신호나 폴링이 다시 시도한다.
    }
  }, [applyIncoming, basePath, scheduleMarkRead]);

  // 감시자 신호마다 증분 동기화
  useEffect(() => {
    if (signalAt === 0) {
      return;
    }

    void syncSince();
  }, [signalAt, syncSince]);

  // 마운트 직후와 창이 다시 포커스될 때 읽음 처리
  useEffect(() => {
    markRead();

    const handleFocus = () => {
      markRead();
      void syncSince();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [markRead, syncSince]);

  // 이미 하단을 보고 있을 때만 최신으로 따라간다. 과거를 읽는 중이면 끌어내리지 않는다.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    if (!lastMessageId) {
      return;
    }

    const distanceFromBottom =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

    if (distanceFromBottom <= SCROLL_STICKY_THRESHOLD_PX) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [lastMessageId]);

  const handleLoadOlder = useCallback(async () => {
    const oldest = messages.find((message) => !message.id.startsWith(PENDING_PREFIX));

    if (!oldest || isLoadingOlder) {
      return;
    }

    setIsLoadingOlder(true);

    try {
      const response = await fetch(`${basePath}/messages?before=${encodeURIComponent(oldest.id)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("이전 메시지를 불러오지 못했습니다.");
      }

      const payload = (await response.json()) as {
        chatMessages?: ChatMessageItem[];
        hasMoreBefore?: boolean;
      };

      if (!mountedRef.current) {
        return;
      }

      setMessages((current) => mergeChatMessages(current, payload.chatMessages ?? []));
      setHasMoreBefore(Boolean(payload.hasMoreBefore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이전 메시지를 불러오지 못했습니다.");
    } finally {
      if (mountedRef.current) {
        setIsLoadingOlder(false);
      }
    }
  }, [basePath, isLoadingOlder, messages]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();

    if (!body || isSending) {
      return;
    }

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
    setIsSending(true);
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await fetch(`${basePath}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as
        | { chatMessage?: ChatMessageItem; error?: string }
        | null;

      if (!response.ok || !payload?.chatMessage) {
        throw new Error(payload?.error ?? "메시지를 보내지 못했습니다.");
      }

      if (!mountedRef.current) {
        return;
      }

      const saved = payload.chatMessage;
      setMessages((current) =>
        mergeChatMessages(
          current.filter((message) => message.id !== pendingId),
          [saved],
        ),
      );
      syncedAtRef.current = saved.updatedAt;
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      // 실패하면 낙관적 행을 걷어내고 초안을 되돌려 준다.
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      setDraft((current) => (current ? current : body));
      toast.error(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      if (mountedRef.current) {
        setIsSending(false);
      }
    }
  }, [basePath, draft, isSending, viewerId, viewerRole]);

  const handleDelete = useCallback(
    async (message: ChatMessageItem) => {
      const confirmed = await confirm({
        title: "메시지를 삭제할까요?",
        description: "삭제해도 자리에는 삭제된 메시지로 남습니다.",
        confirmLabel: "삭제",
        variant: "danger",
      });

      if (!confirmed) {
        return;
      }

      try {
        const response = await fetch(`${basePath}/messages/${encodeURIComponent(message.id)}`, {
          method: "DELETE",
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as
          | { chatMessage?: ChatMessageItem; error?: string }
          | null;

        if (!response.ok || !payload?.chatMessage) {
          throw new Error(payload?.error ?? "메시지를 삭제하지 못했습니다.");
        }

        if (mountedRef.current) {
          applyIncoming([payload.chatMessage]);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "메시지를 삭제하지 못했습니다.");
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

  const visibleCount = useMemo(
    () => messages.filter((message) => !message.isDeleted).length,
    [messages],
  );

  return (
    <>
      {permission === "default" ? (
        <div className="admin-notice flex flex-wrap items-center justify-between gap-3">
          <span>다른 화면을 보고 있어도 새 메시지를 알려드립니다.</span>
          <button type="button" className="admin-button" onClick={handleEnableNotifications}>
            브라우저 알림 허용
          </button>
        </div>
      ) : null}

      {connectionMode === "polling" ? (
        <div className="admin-notice admin-notice-warning">
          실시간 연결이 끊겨 주기적으로 새 메시지를 확인하고 있습니다. 도착이 몇 초 늦을 수 있습니다.
        </div>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2 className="admin-section-title">전체 대화</h2>
          <span className="admin-tab-count">{visibleCount}건</span>
        </div>

        {hasMoreBefore ? (
          <div className="admin-list-load-more">
            <button
              type="button"
              className="admin-button"
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
              <article key={message.id} className="admin-panel-row" data-own={isOwn}>
                <div className="min-w-0 flex-1">
                  <p className="admin-chat-meta">
                    <span className="admin-chat-author">{message.authorName}</span>
                    {message.authorRole ? (
                      <span className="admin-badge">{ROLE_LABEL[message.authorRole]}</span>
                    ) : null}
                    <span>{formatTime(message.createdAt)}</span>
                    {isPending ? <span>보내는 중…</span> : null}
                  </p>

                  {message.isDeleted ? (
                    <p className="admin-help">삭제된 메시지</p>
                  ) : (
                    <p className="admin-chat-body">{message.body}</p>
                  )}
                </div>

                {canDelete ? (
                  <button
                    type="button"
                    className="admin-button admin-button-compact"
                    onClick={() => void handleDelete(message)}
                  >
                    삭제
                  </button>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <div className={`admin-chat-composer${variant === "assistant" ? " admin-chat-composer-assistant" : ""}`}>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
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
          {isSending ? "보내는 중…" : "보내기"}
        </button>
      </div>

      {confirmDialog}
    </>
  );
}
