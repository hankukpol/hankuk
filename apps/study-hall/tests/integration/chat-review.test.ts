import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL;
if (!baseUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl) || process.env.MOCK_MODE !== "true") {
  throw new Error("Chat HTTP tests require the isolated local integration runtime.");
}
async function request(path: string, cookie = "", method = "GET", body?: unknown) {
  return fetch(`${baseUrl}${path}`, { method, headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
}
async function login(email: string) {
  const response = await request("/api/auth/login", "", "POST", { email, password: "fixture-password" });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

test("staff chat HTTP: send, unread, read, deletion and division isolation", async (t) => {
  const admin = await login("admin-police@mock.local");
  const assistant = await login("assistant-police@mock.local");
  const fire = await login("admin-fire@mock.local");
  const root = "/api/police/chat";
  let messageId = "";
  let createdAt = "";

  await t.test("administrator sends normalized text, assistant sees unread", async () => {
    const result = await request(`${root}/messages`, admin, "POST", { body: "  채팅 검증 메시지  " });
    assert.equal(result.status, 201, await result.clone().text());
    const message = (await result.json()).chatMessage;
    messageId = message.id;
    createdAt = message.createdAt;
    assert.equal(message.body, "채팅 검증 메시지");
    const unread = await request(`${root}/unread`, assistant);
    assert.equal(unread.status, 200);
    assert.ok((await unread.json()).unreadCount >= 1);
  });
  await t.test("foreign branch cannot read or delete and assistant cannot delete another author", async () => {
    assert.equal((await request(`${root}/messages`, fire)).status, 403);
    assert.equal((await request(`${root}/messages/${messageId}`, fire, "DELETE")).status, 403);
    assert.equal((await request(`${root}/messages/${messageId}`, assistant, "DELETE")).status, 403);
  });
  await t.test("unknown read anchor returns 404, known anchor clears unread", async () => {
    assert.equal((await request(`${root}/read`, assistant, "POST", { lastReadMessageId: "missing-chat-anchor" })).status, 404);
    const read = await request(`${root}/read`, assistant, "POST", { lastReadMessageId: messageId });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).unreadCount, 0);
  });
  await t.test("soft delete redacts the API body and is delivered by updatedAt synchronization", async () => {
    const deleted = await request(`${root}/messages/${messageId}`, admin, "DELETE");
    assert.equal(deleted.status, 200);
    const message = (await deleted.json()).chatMessage;
    assert.equal(message.isDeleted, true);
    assert.equal(message.body, "");
    const repeated = await request(`${root}/messages/${messageId}`, admin, "DELETE");
    assert.equal((await repeated.json()).chatMessage.deletedAt, message.deletedAt);
    const sync = await request(`${root}/messages?since=${encodeURIComponent(createdAt)}`, assistant);
    assert.equal(sync.status, 200);
    const tombstone = (await sync.json()).chatMessages.find((item: { id: string }) => item.id === messageId);
    assert.equal(tombstone?.isDeleted, true);
    assert.equal(tombstone?.body, "");
  });
  await t.test("empty and oversized messages and invalid cursors are rejected", async () => {
    for (const body of ["", " ", "가".repeat(2001)]) {
      assert.equal((await request(`${root}/messages`, assistant, "POST", { body })).status, 400);
    }
    assert.equal((await request(`${root}/messages?since=not-a-date`, admin)).status, 400);
    assert.equal((await request(`${root}/messages?before=unknown-anchor`, admin)).status, 404);
  });
});
