import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as chatMeta from "../lib/chat-meta";
import * as chatSchemas from "../lib/chat-schemas";
import * as errors from "../lib/errors";

type Service = typeof import("../lib/services/chat.service");
const actor = { id: "admin", name: "관리자", role: "ADMIN" as const };
const time = (n: number) => new Date(Date.UTC(2026, 8, 8, 0, 0, n));
function message(id: string, created = 1, updated = created, divisionId = "police") {
  return { id, divisionId, authorId: "writer" as string | null, authorName: "작성자", body: "본문",
    createdAt: time(created), updatedAt: time(updated), deletedAt: null as Date | null,
    deletedById: null as string | null, author: { name: "작성자", role: "ASSISTANT" } as { name: string; role: string } | null,
    deletedBy: null as { name: string } | null };
}
type Row = ReturnType<typeof message>;
type Where = Record<string, any>;
function matches(row: Record<string, any>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part: Where) => matches(row, part));
    if (key === "AND") return value.every((part: Where) => matches(row, part));
    const actual = row[key as keyof Row] as any;
    if (value instanceof Date) return +actual === +value;
    if (value !== null && typeof value === "object") {
      return Object.entries(value).every(([op, bound]: [string, any]) => {
        // SQL comparisons with NULL do not match a WHERE clause.
        if (actual === null) return false;
        if (op === "not") return actual !== bound;
        if (op === "lt") return actual < bound;
        if (op === "gt") return actual > bound;
        if (op === "equals") return +actual === +bound;
        throw new Error(`Unsupported operator ${op}`);
      });
    }
    return actual === value;
  });
}
function fixture(rows: Row[], mock = false) {
  const state = { admins: [{ id: "writer", name: "작성자", role: "ASSISTANT" }, actor],
    chatMessagesByDivision: Object.fromEntries(["police", "fire"].map(slug => [slug,
      rows.filter(row => row.divisionId === slug).map(row => ({ ...row,
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null }))])),
    chatReadStatesByDivision: {} as Record<string, unknown[]> };
  const queries: Where[] = [];
  const readStates: Array<{ divisionId: string; adminId: string; lastReadAt: Date }> = [];
  const readWrites: Where[] = [];
  const findMany = async (args: Where) => {
    queries.push(args);
    assert.equal(args.where.divisionId, "police", "every message query is division scoped");
    const found = rows.filter(row => matches(row, args.where));
    found.sort((a, b) => {
      for (const order of args.orderBy ?? []) {
        const [key, direction] = Object.entries(order)[0];
        const left = a[key as keyof Row] as any, right = b[key as keyof Row] as any;
        if (left < right) return direction === "asc" ? -1 : 1;
        if (left > right) return direction === "asc" ? 1 : -1;
      }
      return 0;
    });
    return found.slice(0, args.take ?? found.length).map(row => ({ ...row }));
  };
  const prisma = { chatMessage: {
    findMany,
    create: async (args: Where) => {
      assert.equal(args.data.divisionId, "police");
      const created = { ...message("created", 10), ...args.data,
        author: { name: actor.name, role: actor.role } };
      rows.push(created);
      return { ...created };
    },
    count: async (args: Where) => {
      // Do not let JavaScript's null !== actor.id mask a SQL NOT(NULL = id) regression.
      assert.deepEqual(args.where.OR, [{ authorId: null }, { authorId: { not: actor.id } }]);
      assert.equal(args.where.NOT, undefined);
      return (await findMany(args)).length;
    },
    findFirst: async (args: Where) => (await findMany({ ...args, take: 1 }))[0] ?? null,
    update: async (args: Where) => {
      const row = rows.find(row => matches(row, args.where))!;
      Object.assign(row, args.data, { deletedBy: { name: args.data.deletedById } });
      return { ...row };
    },
    updateMany: async (args: Where) => {
      assert.equal(args.where.divisionId, "police");
      const targets = rows.filter(row => matches(row, args.where));
      targets.forEach(row => Object.assign(row, args.data, { deletedBy: { name: args.data.deletedById } }));
      return { count: targets.length };
    },
  }, chatReadState: {
    findUnique: async (args: Where) => {
      const row = readStates.find(row => matches(row, args.where.divisionId_adminId));
      return row ? { ...row } : null;
    },
    upsert: async (args: Where) => {
      readWrites.push(args);
      assert.deepEqual(args.where.divisionId_adminId, { divisionId: "police", adminId: actor.id });
      let row = readStates.find(row => matches(row, args.where.divisionId_adminId));
      if (row) Object.assign(row, args.update);
      else { row = { ...args.create }; readStates.push(row!); }
      return { ...row };
    },
    updateMany: async (args: Where) => {
      readWrites.push(args);
      assert.equal(args.where.divisionId, "police");
      assert.equal(args.where.adminId, actor.id);
      const targets = readStates.filter(row => matches(row, args.where));
      targets.forEach(row => Object.assign(row, args.data));
      return { count: targets.length };
    },
  } };
  const dependencies: Record<string, unknown> = {
    "@/lib/chat-meta": chatMeta, "@/lib/chat-schemas": chatSchemas, "@/lib/errors": errors,
    "@/lib/mock-data": { isMockMode: () => mock, getMockDivisionBySlug: (slug: string) => ({ id: slug }) },
    "@/lib/service-helpers": { getDivisionBySlugOrThrow: async (slug: string) => ({ id: slug }), getPrismaClient: async () => prisma },
    "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (state: any) => unknown) => fn(state) },
  };
  const source = readFileSync(new URL("../lib/services/chat.service.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { service: module.exports as Service, state, prisma, queries, readStates, readWrites };
}

test("DB previous pages include all createdAt ties, match mock, and exclude foreign divisions", async () => {
  const rows = [message("a"), message("b"), message("c"), message("d"), message("foreign", 1, 1, "fire")];
  const db = fixture(rows).service, mock = fixture(rows, true).service;
  let before: string | undefined;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) {
    const page = await db.listChatMessages("police", actor, { before, limit: 1 });
    assert.deepEqual(page, await mock.listChatMessages("police", actor, { before, limit: 1 }));
    ids.push(...page.chatMessages.map(row => row.id));
    before = page.chatMessages[0]?.id;
  }
  assert.deepEqual(ids, ["d", "c", "b", "a"]);
});

for (const mock of [false, true]) {
  test(`${mock ? "mock" : "DB"} since pagination does not skip older updates or split boundary ties`, async () => {
    const rows = [message("old-deleted", 1, 999),
      ...Array.from({ length: chatSchemas.CHAT_SYNC_MAX_LIMIT + 5 }, (_, i) => message(`m${String(i).padStart(4, "0")}`, i + 2, i < 198 ? i + 2 : 300)),
      message("foreign", 1, 200, "fire")];
    rows[0].deletedAt = time(999);
    const { service } = fixture(rows, mock);
    const received = new Map<string, unknown>();
    let since = time(0).toISOString();
    for (let i = 0; i < 5; i++) {
      const page = await service.listChatMessages("police", actor, { since });
      if (!page.chatMessages.length) break;
      assert.ok(page.syncedAt! > since);
      page.chatMessages.forEach(row => received.set(row.id, row));
      since = page.syncedAt!;
    }
    assert.equal(received.size, rows.length - 1);
    assert.equal((received.get("old-deleted") as any).body, "");
    assert.equal(received.has("foreign"), false);
  });
  test(`${mock ? "mock" : "DB"} invalid and foreign read anchors reject without modifying read state`, async () => {
    const { service, state, readWrites } = fixture([message("foreign", 1, 1, "fire")], mock);
    for (const id of ["missing", "foreign"]) {
      await assert.rejects(service.markChatRead("police", actor, { lastReadMessageId: id }), /기준 메시지를 찾을 수 없습니다/);
    }
    assert.deepEqual(state.chatReadStatesByDivision, {});
    assert.deepEqual(readWrites, []);
  });
}

test("DB concurrent deletions preserve the first deleter and deletion timestamp", async () => {
  const rows = [message("target")];
  const { service, prisma } = fixture(rows);
  const original = prisma.chatMessage.findFirst;
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  prisma.chatMessage.findFirst = async args => {
    const snapshot = await original(args);
    if (++reads <= 2) {
      if (reads === 2) release();
      await gate;
    }
    return snapshot;
  };
  const [first, second] = await Promise.all([
    service.deleteChatMessage("police", actor, "target"),
    service.deleteChatMessage("police", { ...actor, id: "second" }, "target"),
  ]);
  assert.equal(rows[0].deletedById, actor.id);
  assert.equal(first.deletedByName, actor.id);
  assert.equal(second.deletedByName, actor.id);
  assert.equal(second.deletedAt, first.deletedAt);
  assert.equal(second.body, "");
});

test("DB and mock return the complete oversized timestamp group with identical display ordering", async () => {
  const rows = Array.from({ length: chatSchemas.CHAT_SYNC_MAX_LIMIT + 3 }, (_, i) =>
    message(`t${String(i).padStart(4, "0")}`, 500 - i, 600));
  const db = fixture(rows).service, mock = fixture(rows, true).service;
  const options = { since: time(0).toISOString() };
  const page = await db.listChatMessages("police", actor, options);
  assert.deepEqual(page, await mock.listChatMessages("police", actor, options));
  assert.equal(page.chatMessages.length, rows.length);
  assert.equal(page.chatMessages[0].id, rows[rows.length - 1].id);
  assert.equal(page.syncedAt, time(600).toISOString());
  assert.deepEqual(await db.listChatMessages("police", actor, { since: page.syncedAt! }),
    { chatMessages: [], hasMoreBefore: false, syncedAt: null });
});

test("DB delete rejects foreign targets and unauthorized assistants without writes", async () => {
  const rows = [message("owned"), message("foreign", 1, 1, "fire")];
  const { service } = fixture(rows);
  await assert.rejects(service.deleteChatMessage("police", actor, "foreign"), /메시지를 찾을 수 없습니다/);
  await assert.rejects(service.deleteChatMessage("police", { ...actor, role: "ASSISTANT" }, "owned"), /본인이 보낸 메시지만/);
  assert.ok(rows.every(row => row.deletedAt === null && row.deletedById === null));
});

test("DB unread explicitly includes NULL authors while excluding own, read, deleted and foreign rows", async () => {
  const orphan = { ...message("orphan", 3), authorId: null, author: null };
  const rows = [message("read", 1), message("other", 2), orphan,
    { ...message("own", 4), authorId: actor.id },
    { ...message("deleted", 5), deletedAt: time(6) },
    { ...message("foreign", 7, 7, "fire"), authorId: null, author: null }];
  const { service, readStates } = fixture(rows);
  readStates.push({ divisionId: "police", adminId: actor.id, lastReadAt: time(1) });
  const summary = await service.getChatUnreadSummary("police", actor);
  assert.equal(summary.unreadCount, 2);
  assert.equal(summary.latestMessage?.id, "own");
  assert.equal(summary.readAt, time(1).toISOString());
});

for (const delayedStage of ["upsert", "updateMany"] as const) {
  test(`DB read advance remains monotonic when old ${delayedStage} completes after newer request`, { timeout: 2000 }, async () => {
    const { service, prisma, readStates } = fixture([message("old", 2), message("new", 4), message("unread", 5)]);
    readStates.push(
      { divisionId: "police", adminId: actor.id, lastReadAt: time(1) },
      { divisionId: "fire", adminId: actor.id, lastReadAt: time(1) },
      { divisionId: "police", adminId: "another-admin", lastReadAt: time(1) },
    );
    let signalReached!: () => void, releaseOld!: () => void;
    const reached = new Promise<void>(resolve => { signalReached = resolve; });
    const gate = new Promise<void>(resolve => { releaseOld = resolve; });
    const original = prisma.chatReadState[delayedStage];
    const delayed = async (args: Where) => {
      const requested = args.create?.lastReadAt ?? args.data?.lastReadAt;
      if (+requested === +time(2)) { signalReached(); await gate; }
      return original(args);
    };
    // Both delegates receive Prisma argument objects; their results are unused by the service.
    Object.assign(prisma.chatReadState, { [delayedStage]: delayed });
    const oldRequest = service.markChatRead("police", actor, { lastReadMessageId: "old" });
    await reached;
    let latest;
    try {
      latest = await service.markChatRead("police", actor, { lastReadMessageId: "new" });
    } finally { releaseOld(); }
    const stale = await oldRequest;
    assert.equal(latest.readAt, time(4).toISOString());
    assert.equal(stale.readAt, latest.readAt);
    assert.equal(stale.unreadCount, 1);
    assert.deepEqual(readStates.map(row => row.lastReadAt), [time(4), time(1), time(1)]);
  });
}

for (const mock of [false, true]) {
  test(`${mock ? "mock" : "DB"} sending preserves unseen other-author unread messages without read-state writes`, async () => {
    const { service, state, prisma, readStates, readWrites } = fixture([message("unseen", 2)], mock);
    const initialRead = { divisionId: "police", adminId: actor.id, lastReadAt: time(1) };
    readStates.push(initialRead);
    state.chatReadStatesByDivision.police = [{ ...initialRead,
      id: "read-state", lastReadAt: time(1).toISOString(), updatedAt: time(1).toISOString() }];
    // A send must succeed even if the separate read-state persistence is unavailable.
    prisma.chatReadState.upsert = async () => { throw new Error("read-state unavailable"); };
    const before = await service.getChatUnreadSummary("police", actor);
    const sent = await service.createChatMessage("police", actor, { body: "답장" });
    const after = await service.getChatUnreadSummary("police", actor);
    assert.equal(sent.body, "답장");
    assert.equal(sent.authorId, actor.id);
    assert.equal(before.unreadCount, 1);
    assert.equal(after.unreadCount, 1);
    assert.equal(after.readAt, before.readAt);
    assert.deepEqual(readWrites, []);
  });
}
