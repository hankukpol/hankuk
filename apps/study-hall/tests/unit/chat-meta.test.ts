import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMessagePreview,
  canDeleteChatMessage,
  formatUnreadBadge,
  mergeChatMessages,
  nextPollIntervalMs,
  shouldNotifyForMessage,
} from "../../lib/chat-meta";

function message(id: string, createdAt: string, updatedAt = createdAt) {
  return { id, createdAt, updatedAt };
}

test("merging chat messages dedupes by id and lets the newer revision win", () => {
  const existing = [
    message("a", "2026-09-09T00:00:01.000Z"),
    message("b", "2026-09-09T00:00:02.000Z"),
  ];

  // 소프트 삭제는 updatedAt 만 올린다. 자리표시가 원본을 덮어야 한다.
  const tombstone = message("b", "2026-09-09T00:00:02.000Z", "2026-09-09T00:05:00.000Z");
  const merged = mergeChatMessages(existing, [tombstone, message("c", "2026-09-09T00:00:03.000Z")]);

  assert.deepEqual(
    merged.map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.equal(merged[1].updatedAt, "2026-09-09T00:05:00.000Z");

  // 오래된 판본은 최신을 덮지 않는다.
  const stale = mergeChatMessages(merged, [message("b", "2026-09-09T00:00:02.000Z")]);
  assert.equal(stale[1].updatedAt, "2026-09-09T00:05:00.000Z");
});

test("merging is stable when two messages share a timestamp", () => {
  const same = "2026-09-09T00:00:00.000Z";
  const merged = mergeChatMessages([], [message("z", same), message("a", same), message("m", same)]);

  assert.deepEqual(
    merged.map((item) => item.id),
    ["a", "m", "z"],
  );
});

test("notifications skip own messages, tombstones, repeats and the open chat page", () => {
  const base = {
    authorId: "admin-2",
    messageId: "m1",
    viewerId: "admin-1",
    isDeleted: false,
    isHidden: false,
    isOnChatPage: false,
    alreadyNotified: false,
  };

  assert.equal(shouldNotifyForMessage(base), true);
  assert.equal(shouldNotifyForMessage({ ...base, authorId: "admin-1" }), false, "본인 메시지");
  assert.equal(shouldNotifyForMessage({ ...base, isDeleted: true }), false, "삭제된 메시지");
  assert.equal(shouldNotifyForMessage({ ...base, alreadyNotified: true }), false, "이미 알림");
  assert.equal(shouldNotifyForMessage({ ...base, isOnChatPage: true }), false, "채팅 화면을 보는 중");

  // 도크를 열어놓고 보는 중이어도 탭이 가려져 있으면 알린다.
  assert.equal(shouldNotifyForMessage({ ...base, isOnChatPage: true, isHidden: true }), true);

  // 채팅은 별도 페이지가 아니라 도크다. isOnChatPage 는 "도크가 열려 있는가"를 뜻한다.
  // 도크를 닫아둔 채 다른 메뉴를 보고 있으면 반드시 알려야 한다.
  assert.equal(shouldNotifyForMessage({ ...base, isOnChatPage: false, isHidden: false }), true);

  // 작성자 계정이 삭제되어 authorId 가 null 이어도 알림은 살아 있어야 한다.
  assert.equal(shouldNotifyForMessage({ ...base, authorId: null }), true);
});

test("unread badge collapses past ninety nine and disappears at zero", () => {
  assert.equal(formatUnreadBadge(0), "");
  assert.equal(formatUnreadBadge(-1), "");
  assert.equal(formatUnreadBadge(1), "1");
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
});

test("poll interval backs off when hidden, failing, or already realtime", () => {
  assert.equal(nextPollIntervalMs("off", "visible"), null);
  assert.equal(nextPollIntervalMs("polling", "visible"), 15_000);
  assert.equal(nextPollIntervalMs("polling", "hidden"), 60_000);

  // 실시간이 붙어 있으면 놓친 메시지를 줍는 안전망만 돌린다.
  assert.equal(nextPollIntervalMs("realtime", "visible"), 300_000);
  assert.equal(nextPollIntervalMs("realtime", "hidden"), 300_000);

  assert.equal(nextPollIntervalMs("polling", "visible", 2), 15_000);
  assert.equal(nextPollIntervalMs("polling", "visible", 3), 60_000);
});

test("notification preview collapses whitespace and truncates", () => {
  assert.equal(buildMessagePreview("  여러   공백\n줄바꿈  "), "여러 공백 줄바꿈");
  assert.equal(buildMessagePreview("가".repeat(10), 5), "가가가가…");
  assert.equal(buildMessagePreview("가".repeat(5), 5), "가가가가가");
});

test("only the author or an admin may delete a chat message", () => {
  const mine = { authorId: "admin-1" };
  const theirs = { authorId: "admin-2" };
  const orphaned = { authorId: null };

  const assistant = { id: "admin-1", role: "ASSISTANT" as const };
  assert.equal(canDeleteChatMessage(assistant, mine), true, "조교는 본인 메시지를 지운다");
  assert.equal(canDeleteChatMessage(assistant, theirs), false, "조교는 남의 메시지를 못 지운다");
  assert.equal(canDeleteChatMessage(assistant, orphaned), false, "작성자 없는 메시지도 못 지운다");

  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    const admin = { id: "admin-9", role };
    assert.equal(canDeleteChatMessage(admin, mine), true, role);
    assert.equal(canDeleteChatMessage(admin, theirs), true, role);
    assert.equal(canDeleteChatMessage(admin, orphaned), true, role);
  }
});
