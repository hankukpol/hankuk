import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import { advanceChatCursor, createChatSyncQueue, isNewChatArrival, mergeChatMessages } from "../lib/chat-meta";
import { chatStoreKey, createChatStore, getChatStore } from "../lib/chat-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const stamp = (second: number) => `2026-09-08T00:00:${String(second).padStart(2, "0")}.000Z`;
const message = (id: string, second: number) => ({ id, createdAt: stamp(second), updatedAt: stamp(second) });

test("read completion rejects polls started before and during read, including same-tick requests", () => {
  const store = createChatStore();
  const before = store.beginUnreadRequest();
  const finish = store.beginRead();
  const during = store.beginUnreadRequest();
  assert.equal(store.acceptUnread(7, during), false);
  finish(1); // A message beyond the explicit read anchor remains unread.
  assert.equal(store.acceptUnread(7, before), false);
  assert.equal(store.acceptUnread(7, during), false);
  assert.equal(store.getSnapshot().unreadCount, 1);
  assert.equal(store.acceptUnread(2, store.beginUnreadRequest()), true);
});

test("failed reads preserve the badge and overlapping completions cannot overwrite a newer read", () => {
  const store = createChatStore();
  store.set({ unreadCount: 4 });
  const fail = store.beginRead();
  fail();
  assert.equal(store.getSnapshot().unreadCount, 4);
  const old = store.beginRead();
  const recent = store.beginRead();
  recent(0);
  old(4);
  assert.equal(store.getSnapshot().unreadCount, 0);
  assert.equal(store.acceptUnread(1, store.beginUnreadRequest()), true);
});

test("out-of-order unread responses are rejected independently of the system clock", () => {
  const store = createChatStore();
  const old = store.beginUnreadRequest();
  const recent = store.beginUnreadRequest();
  assert.equal(store.acceptUnread(2, recent), true);
  assert.equal(store.acceptUnread(9, old), false);
  assert.equal(store.getSnapshot().unreadCount, 2);
});

test("division and viewer stores isolate counts, reads, dock requests and signals", () => {
  const a = getChatStore(chatStoreKey("police-review", "one"));
  const b = getChatStore(chatStoreKey("fire-review", "one"));
  const c = getChatStore(chatStoreKey("police-review", "two"));
  a.set({ unreadCount: 9, isOpen: true }); a.signal(); a.requestOpen();
  const finish = a.beginRead();
  assert.equal(b.acceptUnread(3, b.beginUnreadRequest()), true);
  finish(0);
  assert.equal(b.getSnapshot().unreadCount, 3);
  assert.equal(b.getSnapshot().isOpen, false);
  assert.equal(c.getSnapshot().signalAt, 0);
  assert.equal(c.getSnapshot().openRequestAt, 0);
  assert.notEqual(chatStoreKey("a:b", "c"), chatStoreKey("a", "b:c"));
});

test("watcher reset invalidates old polls but preserves dock-owned state and monotonic events", () => {
  const store = createChatStore();
  store.set({ isOpen: true }); store.signal(); store.signal(); store.requestOpen();
  const old = store.beginUnreadRequest();
  store.reset();
  assert.equal(store.getSnapshot().isOpen, true);
  assert.equal(store.getSnapshot().signalAt, 2);
  assert.equal(store.getSnapshot().openRequestAt, 1);
  assert.equal(store.acceptUnread(10, old), false);
  store.signal(); assert.equal(store.getSnapshot().signalAt, 3);
});

test("a burst while syncing runs one trailing request without overlap", async () => {
  const first = deferred<void>();
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const queue = createChatSyncQueue(async () => {
    calls += 1; active += 1; maxActive = Math.max(maxActive, active);
    if (calls === 1) await first.promise;
    active -= 1;
  });
  const done = queue.run();
  await Promise.resolve();
  void queue.run(); void queue.run(); void queue.run();
  assert.equal(calls, 1);
  first.resolve(); await done;
  assert.equal(calls, 2); assert.equal(maxActive, 1);
});

test("disposed sync queues discard pending signals", async () => {
  const first = deferred<void>();
  let calls = 0;
  const queue = createChatSyncQueue(async () => { calls += 1; await first.promise; });
  const done = queue.run(); await Promise.resolve(); void queue.run(); queue.dispose();
  first.resolve(); await done; await queue.run(); assert.equal(calls, 1);
});

test("deletion revealing an older message is not an arrival, including equal timestamps", () => {
  assert.equal(isNewChatArrival(message("z", 2), message("a", 1)), false);
  assert.equal(isNewChatArrival(message("z", 2), message("a", 2)), false);
  assert.equal(isNewChatArrival(message("a", 2), message("z", 2)), true);
  assert.equal(isNewChatArrival(message("a", 2), null), false);
  assert.equal(isNewChatArrival(null, message("a", 1)), true);
});

test("cursor is monotonic and complete oversized pages are retained", () => {
  const rows = Array.from({ length: 250 }, (_, i) => message(String(i), 2));
  assert.equal(mergeChatMessages([], rows).length, 250);
  assert.equal(advanceChatCursor(stamp(1), rows), stamp(2));
  assert.equal(advanceChatCursor(stamp(3), rows), stamp(3));
  assert.equal(advanceChatCursor(null, []), null);
  assert.equal(advanceChatCursor(stamp(1), rows, false), stamp(1));
});

const require = createRequire(import.meta.url);

test("room deferred fetch regressions", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost", pretendToBeVisual: true });
  const React = require("react") as typeof import("react");
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, React, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout,
  };
  const descriptors = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
  const { act } = React;
  const { Simulate } = require("react-dom/test-utils") as typeof import("react-dom/test-utils");
  const { StaffChatRoom } = await import("../components/chat/StaffChatRoom");
  const makeItem = (id: string, second: number, authorId = "other") => ({
    ...message(id, second), divisionId: "review", authorId, authorName: authorId,
    authorRole: "ADMIN" as const, body: id, isDeleted: false, deletedAt: null, deletedByName: null,
  });
  try {
    await t.test("empty room syncs from epoch and retains a signal arriving during response parsing", async (t) => {
      const requests: Array<{ url: string; result: ReturnType<typeof deferred<Response>> }> = [];
      t.mock.method(globalThis, "fetch", async (url: string) => {
        const result = deferred<Response>(); requests.push({ url: String(url), result }); return result.promise;
      });
      const root = createRoot(document.getElementById("root")!);
      const props = { divisionSlug: "review", viewerId: "me", viewerRole: "ADMIN" as const,
        initialMessages: [], initialHasMoreBefore: false, initialSyncedAt: null };
      try {
        await act(async () => { root.render(React.createElement(StaffChatRoom, props)); });
        assert.equal(new URL(requests[0].url, "http://localhost").searchParams.get("since"), "1970-01-01T00:00:00.000Z");
        await act(async () => { root.render(React.createElement(StaffChatRoom, { ...props, signalAt: 1 })); });
        assert.equal(requests.length, 1);
        await act(async () => { requests[0].result.resolve(Response.json({ chatMessages: [], syncedAt: null })); });
        assert.equal(requests.length, 2);
        await act(async () => { requests[1].result.resolve(Response.json({ chatMessages: [makeItem("first arrival", 1)], syncedAt: stamp(1) })); });
        assert.match(document.body.textContent!, /first arrival/);
        assert.equal(new URL(requests[2].url, "http://localhost").searchParams.get("since"), stamp(1));
        await act(async () => { requests[2].result.resolve(Response.json({ chatMessages: [], syncedAt: null })); });
      } finally { await act(async () => { root.unmount(); }); }
    });

    await t.test("slow/failed sync after send cannot skip or acknowledge an unseen foreign message", async (t) => {
      const readAnchors: string[] = [];
      const requests: Array<{ url: string; result: ReturnType<typeof deferred<Response>> }> = [];
      t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
        if (String(url).endsWith("/read")) {
          readAnchors.push(JSON.parse(String(options?.body)).lastReadMessageId);
          return Response.json({ unreadCount: 1 });
        }
        if (options?.method === "POST") return Response.json({ chatMessage: makeItem("own send", 3, "me") });
        const result = deferred<Response>(); requests.push({ url: String(url), result }); return result.promise;
      });
      const root = createRoot(document.getElementById("root")!);
      try {
        await act(async () => { root.render(React.createElement(StaffChatRoom, {
          divisionSlug: "review", viewerId: "me", viewerRole: "ADMIN",
          initialMessages: [makeItem("baseline", 1)], initialHasMoreBefore: false, initialSyncedAt: stamp(1),
        })); });
        const input = document.querySelector("textarea")!;
        await act(async () => { input.value = "own send"; Simulate.change(input); });
        await act(async () => { Simulate.click(Array.from(document.querySelectorAll("button")).find((node) => node.textContent === "보내기")!); });
        assert.match(document.body.textContent!, /own send/);
        assert.equal(requests.length, 1, "send only queues a follow-up while delta is pending");
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
        assert.deepEqual(readAnchors, ["baseline"], "slow sync must not acknowledge own send beyond unseen arrivals");
        await act(async () => { requests[0].result.resolve(new Response(null, { status: 500 })); });
        assert.equal(new URL(requests[1].url, "http://localhost").searchParams.get("since"), stamp(1), "send must not advance to t3");
        await act(async () => { requests[1].result.resolve(Response.json({ chatMessages: [makeItem("foreign arrival", 2), makeItem("own send", 3, "me")], syncedAt: stamp(3) })); });
        assert.match(document.body.textContent!, /foreign arrival/);
        assert.equal(document.querySelectorAll(".admin-chat-message").length, 3, "optimistic send reconciles without duplicates");
        await act(async () => { requests[2].result.resolve(Response.json({ chatMessages: [], syncedAt: null })); });
      } finally { await act(async () => { root.unmount(); }); }
    });
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Array.from(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
