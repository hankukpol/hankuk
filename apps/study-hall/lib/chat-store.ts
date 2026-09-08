"use client";

import { useSyncExternalStore } from "react";

import type { ChatConnectionMode } from "@/lib/chat-meta";

/**
 * 안읽음 개수와 연결 상태를 담는 외부 스토어.
 * Context 를 쓰지 않는 이유는 두 가지다.
 * - 메시지가 올 때마다 레이아웃 전체가 다시 그려지지 않는다.
 * - 관리자(AdminShell 경유)와 조교(직접 렌더)의 레이아웃 구조가 달라
 *   같은 prop 을 두 갈래로 내려보내지 않아도 된다.
 * lib/sonner.tsx 와 같은 패턴이다.
 */

export type ChatStoreState = {
  unreadCount: number;
  mode: ChatConnectionMode;
  latestMessageId: string | null;
  /** 새 메시지 신호. 값이 바뀌면 채팅 화면이 증분 동기화한다. */
  signalAt: number;
  /** 도크가 열려 있는지. 알림을 울릴지 판단하는 데 쓴다. */
  isOpen: boolean;
  /** 알림을 눌렀을 때 도크를 열어 달라는 요청. 값이 바뀌면 도크가 열린다. */
  openRequestAt: number;
};

const listeners = new Set<() => void>();

/**
 * 마지막으로 화면에서 읽음 처리한 시각.
 * 그 이전에 시작된 폴링 응답은 이미 낡았으므로 배지를 되살리지 않는다.
 */
let lastLocalReadAtMs = 0;

let state: ChatStoreState = {
  unreadCount: 0,
  mode: "off",
  latestMessageId: null,
  signalAt: 0,
  isOpen: false,
  openRequestAt: 0,
};

const serverSnapshot: ChatStoreState = state;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(next: Partial<ChatStoreState>) {
  const merged = { ...state, ...next };

  if (
    merged.unreadCount === state.unreadCount &&
    merged.mode === state.mode &&
    merged.latestMessageId === state.latestMessageId &&
    merged.signalAt === state.signalAt &&
    merged.isOpen === state.isOpen &&
    merged.openRequestAt === state.openRequestAt
  ) {
    return;
  }

  state = merged;
  emitChange();
}

export function subscribeChatStore(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getChatStoreSnapshot() {
  return state;
}

/**
 * 서버가 알려준 안읽음 개수를 반영한다.
 * requestStartedAtMs 를 주면 읽음 처리와 경합한 낡은 응답을 걸러낸다.
 */
export function setChatUnreadCount(unreadCount: number, requestStartedAtMs?: number) {
  if (requestStartedAtMs !== undefined && requestStartedAtMs < lastLocalReadAtMs) {
    return;
  }

  setState({ unreadCount: Math.max(0, unreadCount) });
}

export function setChatConnectionMode(mode: ChatConnectionMode) {
  setState({ mode });
}

export function setChatLatestMessageId(latestMessageId: string | null) {
  setState({ latestMessageId });
}

export function setChatDockOpen(isOpen: boolean) {
  setState({ isOpen });
}

/** 도크가 열려 있는지. 렌더 밖(감시자)에서도 읽을 수 있어야 한다. */
export function isChatDockOpen() {
  return state.isOpen;
}

/** 브라우저 알림을 눌렀을 때 도크를 연다. */
export function requestOpenChat() {
  setState({ openRequestAt: Date.now() });
}

/** 새 메시지가 감지됐음을 채팅 화면에 알린다. */
export function bumpChatSignal() {
  setState({ signalAt: Date.now() });
}

/** 채팅 화면에서 서버 응답을 기다리지 않고 배지를 즉시 지운다. */
export function markChatReadLocally() {
  lastLocalReadAtMs = Date.now();
  setState({ unreadCount: 0 });
}

export function useChatStore(): ChatStoreState {
  return useSyncExternalStore(subscribeChatStore, getChatStoreSnapshot, () => serverSnapshot);
}

export function useChatUnreadCount(): number {
  return useChatStore().unreadCount;
}
