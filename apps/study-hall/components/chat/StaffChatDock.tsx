"use client";

import { MessagesSquare, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { StaffChatRoom } from "@/components/chat/StaffChatRoom";
import { formatUnreadBadge } from "@/lib/chat-meta";
import { chatStoreKey, getChatStore, useChatStore } from "@/lib/chat-store";
import type { ChatAuthorRole, ChatMessageItem } from "@/lib/services/chat.service";

type StaffChatDockProps = {
  divisionSlug: string;
  divisionName: string;
  viewerId: string;
  viewerRole: ChatAuthorRole;
  enabled: boolean;
};

type LoadedRoom = {
  chatMessages: ChatMessageItem[];
  hasMoreBefore: boolean;
  syncedAt: string | null;
};

/**
 * 헤더의 채팅 아이콘과 오른쪽 도킹 패널.
 *
 * 별도 페이지를 두지 않고 레이아웃에 상주하므로 어느 화면에서든 열 수 있다.
 * 페이지를 가리는 오버레이를 두지 않는다 — 열어 둔 채로 다른 작업을 계속할 수 있어야 한다.
 * 그래서 포커스 트랩과 스크롤 잠금도 걸지 않는다(모달이 아니다).
 */
export function StaffChatDock(props: StaffChatDockProps) {
  return <ChatDockSession key={`${chatStoreKey(props.divisionSlug, props.viewerId)}:${props.enabled}`} {...props} />;
}

function ChatDockSession({
  divisionSlug,
  divisionName,
  viewerId,
  viewerRole,
  enabled,
}: StaffChatDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [room, setRoom] = useState<LoadedRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const storeKey = chatStoreKey(divisionSlug, viewerId);
  const store = getChatStore(storeKey);
  const { unreadCount, signalAt, mode, openRequestAt } = useChatStore(storeKey);
  const loadRevision = useRef(0);
  const consumedOpenRequest = useRef(openRequestAt);
  const mountedRef = useRef(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // 패널은 .admin-shell 직속으로 포털한다.
  // 트리거가 놓인 헤더는 z-index 로 쌓임 맥락을 만들어, 그 안에 두면 하단 탐색(z-40)이 패널 위로 그려진다.
  // body 가 아니라 .admin-shell 로 보내야 5.12 정규화 레이어(.admin-shell ...)가 그대로 적용된다.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    setPortalTarget(document.querySelector<HTMLElement>(".admin-shell") ?? document.body);

    return () => {
      mountedRef.current = false;
      loadRevision.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/${divisionSlug}/chat/messages?limit=50`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("채팅을 불러오지 못했습니다.");
      }

      const payload = (await response.json()) as LoadedRoom;

      if (mountedRef.current && revision === loadRevision.current) {
        setRoom(payload);
      }
    } catch (error) {
      if (mountedRef.current && revision === loadRevision.current) {
        setLoadError(error instanceof Error ? error.message : "채팅을 불러오지 못했습니다.");
      }
    } finally {
      if (mountedRef.current && revision === loadRevision.current) {
        setIsLoading(false);
      }
    }
  }, [divisionSlug]);

  const open = useCallback(() => {
    setIsOpen(true);

    // Closing unmounts the room; reopen with a fresh snapshot instead of stale cached props.
    if (!isLoading) {
      void load();
    }
  }, [isLoading, load]);

  const close = useCallback(() => {
    setIsOpen(false);
    loadRevision.current += 1;
    setIsLoading(false);
    setRoom(null);
    triggerRef.current?.focus();
  }, []);

  // 알림을 눌렀을 때 그 자리에서 열린다.
  useEffect(() => {
    if (openRequestAt > consumedOpenRequest.current) {
      consumedOpenRequest.current = openRequestAt;
      open();
    }
    // open 은 room/isLoading 에 따라 새로 만들어지므로 의존성에 넣지 않는다.
    // 이 효과는 알림 요청이 올 때만 돌아야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestAt]);

  // 감시자가 알림을 울릴지 판단할 때 이 값을 본다.
  useEffect(() => {
    store.set({ isOpen: isOpen && room !== null && !isLoading && !loadError });

    return () => {
      store.set({ isOpen: false });
    };
  }, [isOpen, isLoading, loadError, room, store]);

  // Escape 로 닫는다. 모달이 아니므로 그 외 키는 가로채지 않는다.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      // 삭제 확인 모달이 열려 있으면 그쪽이 먼저 닫힌다. 도크까지 같이 닫지 않는다.
      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      close();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [close, isOpen]);

  if (!enabled) {
    return null;
  }

  const badge = formatUnreadBadge(unreadCount);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="admin-chat-trigger"
        onClick={() => (isOpen ? close() : open())}
        aria-expanded={isOpen}
        aria-controls="staff-chat-dock"
        aria-label={
          unreadCount > 0 ? `직원 채팅, 읽지 않은 메시지 ${unreadCount}개` : "직원 채팅"
        }
        title="직원 채팅"
      >
        <MessagesSquare className="h-5 w-5" aria-hidden="true" />
        {badge ? <span className="admin-chat-trigger-badge">{badge}</span> : null}
      </button>

      {isOpen && portalTarget
        ? createPortal(
        <aside id="staff-chat-dock" className="admin-chat-dock" aria-label="직원 채팅">
          <header className="admin-chat-dock-head">
            <div className="min-w-0">
              <p className="admin-chat-dock-title">직원 채팅</p>
              <p className="admin-help">{divisionName} · 관리자와 조교</p>
            </div>
            <button
              type="button"
              className="admin-dialog-close"
              onClick={close}
              aria-label="채팅 닫기"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          {isLoading && !room ? (
            <p className="admin-empty-state">불러오는 중…</p>
          ) : loadError ? (
            <div className="admin-chat-dock-body">
              <p className="admin-notice admin-notice-danger">{loadError}</p>
              <div className="admin-chat-dock-more">
                <button type="button" className="admin-button admin-button-compact" onClick={() => void load()}>
                  다시 시도
                </button>
              </div>
            </div>
          ) : room ? (
            <StaffChatRoom
              divisionSlug={divisionSlug}
              viewerId={viewerId}
              viewerRole={viewerRole}
              initialMessages={room.chatMessages}
              initialHasMoreBefore={room.hasMoreBefore}
              initialSyncedAt={room.syncedAt}
              signalAt={signalAt}
              connectionMode={mode}
            />
          ) : null}
        </aside>,
            portalTarget,
          )
        : null}
    </>
  );
}
