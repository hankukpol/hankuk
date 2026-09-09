"use client";

import { useSyncExternalStore } from "react";
import type { ChatConnectionMode } from "@/lib/chat-meta";

export type ChatStoreState = {
  unreadCount: number;
  mode: ChatConnectionMode;
  latestMessageId: string | null;
  signalAt: number;
  isOpen: boolean;
  openRequestAt: number;
};

const serverSnapshot: ChatStoreState = {
  unreadCount: 0, mode: "off", latestMessageId: null,
  signalAt: 0, isOpen: false, openRequestAt: 0,
};

/** One division AND viewer. Logical revisions also distinguish events in the same millisecond. */
export function createChatStore() {
  let state = serverSnapshot;
  let revision = 0;
  let request = 0;
  let acceptedRequest = 0;
  let pendingReads = 0;
  const listeners = new Set<() => void>();
  const set = (next: Partial<ChatStoreState>) => {
    if (Object.entries(next).every(([key, value]) => state[key as keyof ChatStoreState] === value)) return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set,
    beginUnreadRequest: () => ({ revision, request: ++request }),
    acceptUnread(count: number, token: { revision: number; request: number }) {
      if (pendingReads || token.revision !== revision || token.request <= acceptedRequest) return false;
      acceptedRequest = token.request;
      set({ unreadCount: Math.max(0, count) });
      return true;
    },
    beginRead() {
      pendingReads += 1;
      const startedRevision = ++revision;
      let finished = false;
      return (count?: number) => {
        if (finished) return;
        finished = true;
        pendingReads -= 1;
        const current = revision === startedRevision;
        revision += 1;
        // Failed reads keep the badge; a subsequent poll reconciles overlapping reads.
        if (current && count !== undefined) set({ unreadCount: Math.max(0, count) });
      };
    },
    signal: () => set({ signalAt: state.signalAt + 1 }),
    requestOpen: () => set({ openRequestAt: state.openRequestAt + 1 }),
    reset() {
      revision += 1;
      // Watcher restarts must not clear dock-owned visibility or rewind event counters.
      set({ unreadCount: 0, mode: "off", latestMessageId: null });
    },
  };
}

const stores = new Map<string, ReturnType<typeof createChatStore>>();
export function chatStoreKey(divisionSlug: string, viewerId: string) {
  return JSON.stringify([divisionSlug, viewerId]);
}
export function getChatStore(key: string) {
  let store = stores.get(key);
  if (!store) { store = createChatStore(); stores.set(key, store); }
  return store;
}
export function useChatStore(key: string): ChatStoreState {
  const store = getChatStore(key);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
}
