import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_MESSAGE_MAX_LIMIT,
  chatMessageQuerySchema,
  chatMessageSchema,
  chatReadSchema,
} from "../../lib/chat-schemas";
import { rejectsAt } from "./schema-assertions";

test("chat messages are trimmed, stripped of control characters and length bound", () => {
  assert.deepEqual(chatMessageSchema.parse({ body: "  안녕하세요  " }), { body: "안녕하세요" });

  // 줄바꿈과 탭은 본문에서 의미가 있으므로 남는다.
  const withWhitespace = chatMessageSchema.parse({ body: "첫 줄\n\t둘째 줄" });
  assert.equal(withWhitespace.body, "첫 줄\n\t둘째 줄");

  // 그 외 제어 문자는 화면을 깨뜨리므로 제거한다.
  const nul = String.fromCharCode(0);
  const del = String.fromCharCode(127);
  assert.equal(chatMessageSchema.parse({ body: `가${nul}나${del}다` }).body, "가나다");

  for (const body of ["", "   ", null, 123, undefined, nul]) {
    rejectsAt(chatMessageSchema, { body }, "body");
  }

  assert.equal(chatMessageSchema.safeParse({ body: "가".repeat(CHAT_MESSAGE_MAX_LENGTH) }).success, true);
  rejectsAt(chatMessageSchema, { body: "가".repeat(CHAT_MESSAGE_MAX_LENGTH + 1) }, "body");
});

test("chat read accepts an empty body but rejects a null envelope", () => {
  assert.deepEqual(chatReadSchema.parse({}), {});
  assert.deepEqual(chatReadSchema.parse({ lastReadMessageId: null }), { lastReadMessageId: null });
  assert.deepEqual(chatReadSchema.parse({ lastReadMessageId: " abc " }), { lastReadMessageId: "abc" });

  // 라우트가 400 을 돌려주려면 null 본문 자체가 거부되어야 한다.
  assert.equal(chatReadSchema.safeParse(null).success, false);
  assert.equal(chatReadSchema.safeParse("{").success, false);
  rejectsAt(chatReadSchema, { lastReadMessageId: "" }, "lastReadMessageId");
});

test("chat message query narrows limit and since before they reach the service", () => {
  // optional 키는 값이 없으면 결과 객체에서 생략된다.
  assert.deepEqual(chatMessageQuerySchema.parse({}), {});

  assert.equal(chatMessageQuerySchema.parse({ limit: "25" }).limit, 25);
  assert.equal(chatMessageQuerySchema.parse({ limit: "" }).limit, undefined);
  assert.equal(chatMessageQuerySchema.parse({ limit: String(CHAT_MESSAGE_MAX_LIMIT) }).limit, CHAT_MESSAGE_MAX_LIMIT);

  for (const limit of ["0", "abc", "1.5", String(CHAT_MESSAGE_MAX_LIMIT + 1), "-3"]) {
    rejectsAt(chatMessageQuerySchema, { limit }, "limit");
  }

  assert.equal(
    chatMessageQuerySchema.parse({ since: "2026-09-09T00:00:00.000Z" }).since,
    "2026-09-09T00:00:00.000Z",
  );

  for (const since of ["", "  ", "어제", "not-a-date"]) {
    rejectsAt(chatMessageQuerySchema, { since }, "since");
  }
});
