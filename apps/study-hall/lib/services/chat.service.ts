import type { AdminSession } from "@/lib/auth";
import {
  CHAT_MESSAGE_DEFAULT_LIMIT,
  CHAT_MESSAGE_MAX_LIMIT,
  CHAT_SYNC_MAX_LIMIT,
  type ChatMessageInput,
  type ChatReadInput,
} from "@/lib/chat-schemas";
import { canDeleteChatMessage } from "@/lib/chat-meta";
import { forbidden, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import { getDivisionBySlugOrThrow, getPrismaClient } from "@/lib/service-helpers";

export type ChatAuthorRole = "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";

export type ChatMessageItem = {
  id: string;
  divisionId: string;
  authorId: string | null;
  authorName: string;
  authorRole: ChatAuthorRole | null;
  /** 삭제된 메시지는 본문을 내려보내지 않는다. */
  body: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessagePage = {
  chatMessages: ChatMessageItem[];
  hasMoreBefore: boolean;
  /** 응답 내 최대 updatedAt. 비어 있으면 null 이고 클라이언트는 기존 커서를 유지한다. */
  syncedAt: string | null;
};

export type ChatUnreadSummary = {
  unreadCount: number;
  latestMessage: ChatMessageItem | null;
  readAt: string | null;
};

export type ChatActor = Pick<AdminSession, "id" | "role" | "name">;

export type ChatListOptions = {
  before?: string;
  since?: string;
  limit?: number;
};

type ChatMessageSource = {
  id: string;
  divisionId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
  deletedById: string | null;
};

type ChatAuthorInfo = {
  name: string;
  role: ChatAuthorRole;
} | null;

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null) {
  return value === null ? null : toIso(value);
}

function resolveLimit(limit?: number) {
  if (!limit || !Number.isInteger(limit) || limit < 1) {
    return CHAT_MESSAGE_DEFAULT_LIMIT;
  }

  return Math.min(limit, CHAT_MESSAGE_MAX_LIMIT);
}

/**
 * mock 경로와 DB 경로가 이 함수 하나를 공유한다.
 * 이름은 살아 있는 계정에서 읽고, 계정이 지워졌으면 작성 시점 스냅샷으로 되돌아간다.
 */
function serializeChatMessage(
  record: ChatMessageSource,
  author: ChatAuthorInfo,
  deletedByName: string | null,
): ChatMessageItem {
  const deletedAt = toIsoOrNull(record.deletedAt);
  const isDeleted = deletedAt !== null;

  return {
    id: record.id,
    divisionId: record.divisionId,
    authorId: record.authorId,
    authorName: author?.name ?? record.authorName,
    authorRole: author?.role ?? null,
    body: isDeleted ? "" : record.body,
    isDeleted,
    deletedAt,
    deletedByName: isDeleted ? deletedByName : null,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

function buildPage(chatMessages: ChatMessageItem[], hasMoreBefore: boolean): ChatMessagePage {
  const syncedAt = chatMessages.reduce<string | null>(
    (latest, message) => (latest === null || message.updatedAt > latest ? message.updatedAt : latest),
    null,
  );

  return { chatMessages, hasMoreBefore, syncedAt };
}

function countUnread(messages: ChatMessageItem[], actor: ChatActor, lastReadAt: string | null) {
  const threshold = lastReadAt ?? "";

  return messages.filter(
    (message) =>
      !message.isDeleted &&
      message.createdAt > threshold &&
      !(message.authorId !== null && message.authorId === actor.id),
  ).length;
}

// ---------------------------------------------------------------------------
// mock 경로
// ---------------------------------------------------------------------------

type MockStoreModule = typeof import("@/lib/mock-store");

async function getMockStore(): Promise<MockStoreModule> {
  return import("@/lib/mock-store");
}

type MockAdminLookup = Map<string, { name: string; role: ChatAuthorRole }>;

function buildMockAdminLookup(admins: Array<{ id: string; name: string; role: string }>): MockAdminLookup {
  const lookup: MockAdminLookup = new Map();

  for (const admin of admins) {
    if (admin.role === "SUPER_ADMIN" || admin.role === "ADMIN" || admin.role === "ASSISTANT") {
      lookup.set(admin.id, { name: admin.name, role: admin.role });
    }
  }

  return lookup;
}

function serializeMockMessages(
  records: ChatMessageSource[],
  admins: Array<{ id: string; name: string; role: string }>,
) {
  const lookup = buildMockAdminLookup(admins);

  return records.map((record) =>
    serializeChatMessage(
      record,
      record.authorId ? (lookup.get(record.authorId) ?? null) : null,
      record.deletedById ? (lookup.get(record.deletedById)?.name ?? null) : null,
    ),
  );
}

function sortByCreatedAt(messages: ChatMessageItem[]) {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

export async function listChatMessages(
  divisionSlug: string,
  actor: ChatActor,
  options: ChatListOptions = {},
): Promise<ChatMessagePage> {
  const limit = resolveLimit(options.limit);

  if (isMockMode()) {
    const { readMockState } = await getMockStore();
    const state = await readMockState();
    const records = state.chatMessagesByDivision?.[divisionSlug] ?? [];
    const all = sortByCreatedAt(serializeMockMessages(records, state.admins));

    if (options.since) {
      const since = new Date(options.since).toISOString();
      const changed = all.filter((message) => message.updatedAt > since).slice(0, CHAT_SYNC_MAX_LIMIT);
      return buildPage(changed, false);
    }

    if (options.before && !all.some((message) => message.id === options.before)) {
      // DB 경로와 같이 404 로 알린다. 조용히 마지막 페이지를 돌려주면 목록이 어긋난다.
      throw notFound("기준 메시지를 찾을 수 없습니다.");
    }

    const upper = options.before
      ? all.findIndex((message) => message.id === options.before)
      : all.length;
    const start = Math.max(0, upper - limit);

    return buildPage(all.slice(start, upper), start > 0);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const include = {
    author: { select: { name: true, role: true } },
    deletedBy: { select: { name: true } },
  } as const;

  if (options.since) {
    const records = await prisma.chatMessage.findMany({
      where: { divisionId: division.id, updatedAt: { gt: new Date(options.since) } },
      include,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: CHAT_SYNC_MAX_LIMIT,
    });

    return buildPage(
      records.map((record) =>
        serializeChatMessage(record, record.author, record.deletedBy?.name ?? null),
      ),
      false,
    );
  }

  let createdBefore: Date | undefined;

  if (options.before) {
    const anchor = await prisma.chatMessage.findFirst({
      where: { id: options.before, divisionId: division.id },
      select: { createdAt: true },
    });

    if (!anchor) {
      throw notFound("기준 메시지를 찾을 수 없습니다.");
    }

    createdBefore = anchor.createdAt;
  }

  // 한 건 더 가져와 이전 페이지가 남았는지 판단한다.
  const records = await prisma.chatMessage.findMany({
    where: {
      divisionId: division.id,
      ...(createdBefore ? { createdAt: { lt: createdBefore } } : {}),
    },
    include,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMoreBefore = records.length > limit;
  const page = hasMoreBefore ? records.slice(0, limit) : records;

  return buildPage(
    page
      .reverse()
      .map((record) => serializeChatMessage(record, record.author, record.deletedBy?.name ?? null)),
    hasMoreBefore,
  );
}

export async function createChatMessage(
  divisionSlug: string,
  actor: ChatActor,
  input: ChatMessageInput,
): Promise<ChatMessageItem> {
  if (isMockMode()) {
    const { readMockState, updateMockState } = await getMockStore();
    const { getMockDivisionBySlug } = await import("@/lib/mock-data");

    const record = await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const now = new Date().toISOString();
      const authorName = state.admins.find((admin) => admin.id === actor.id)?.name ?? actor.name;
      const next = {
        id: `mock-chat-${divisionSlug}-${Date.now()}`,
        divisionId: division.id,
        authorId: actor.id,
        authorName,
        body: input.body,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedById: null,
      };

      state.chatMessagesByDivision[divisionSlug] = [
        ...(state.chatMessagesByDivision[divisionSlug] ?? []),
        next,
      ];

      // 본인이 쓴 글이 안읽음으로 잡히지 않도록 읽은 시각을 함께 전진시킨다.
      applyMockReadState(state, divisionSlug, division.id, actor.id, now);

      return next;
    });

    const state = await readMockState();
    return serializeMockMessages([record], state.admins)[0];
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const record = await prisma.chatMessage.create({
    data: {
      divisionId: division.id,
      authorId: actor.id,
      authorName: actor.name,
      body: input.body,
    },
    include: {
      author: { select: { name: true, role: true } },
      deletedBy: { select: { name: true } },
    },
  });

  await advanceReadState(prisma, division.id, actor.id, record.createdAt);

  return serializeChatMessage(record, record.author, null);
}

export async function deleteChatMessage(
  divisionSlug: string,
  actor: ChatActor,
  messageId: string,
): Promise<ChatMessageItem> {
  if (isMockMode()) {
    const { readMockState, updateMockState } = await getMockStore();

    await updateMockState((state) => {
      const records = state.chatMessagesByDivision[divisionSlug] ?? [];
      const target = records.find((record) => record.id === messageId);

      if (!target) {
        throw notFound("메시지를 찾을 수 없습니다.");
      }

      if (!canDeleteChatMessage(actor, target)) {
        throw forbidden("본인이 보낸 메시지만 삭제할 수 있습니다.");
      }

      // 이미 삭제된 메시지는 최초 삭제자를 덮어쓰지 않는다.
      if (target.deletedAt === null) {
        const now = new Date().toISOString();
        target.deletedAt = now;
        target.deletedById = actor.id;
        target.updatedAt = now;
      }
    });

    const state = await readMockState();
    const records = state.chatMessagesByDivision?.[divisionSlug] ?? [];
    const updated = records.find((record) => record.id === messageId);

    if (!updated) {
      throw notFound("메시지를 찾을 수 없습니다.");
    }

    return serializeMockMessages([updated], state.admins)[0];
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const include = {
    author: { select: { name: true, role: true } },
    deletedBy: { select: { name: true } },
  } as const;

  const target = await prisma.chatMessage.findFirst({
    where: { id: messageId, divisionId: division.id },
    include,
  });

  if (!target) {
    throw notFound("메시지를 찾을 수 없습니다.");
  }

  if (!canDeleteChatMessage(actor, target)) {
    throw forbidden("본인이 보낸 메시지만 삭제할 수 있습니다.");
  }

  if (target.deletedAt !== null) {
    return serializeChatMessage(target, target.author, target.deletedBy?.name ?? null);
  }

  const record = await prisma.chatMessage.update({
    where: { id: target.id },
    data: { deletedAt: new Date(), deletedById: actor.id },
    include,
  });

  return serializeChatMessage(record, record.author, record.deletedBy?.name ?? null);
}

export async function getChatUnreadSummary(
  divisionSlug: string,
  actor: ChatActor,
): Promise<ChatUnreadSummary> {
  if (isMockMode()) {
    const { readMockState } = await getMockStore();
    const state = await readMockState();
    const records = state.chatMessagesByDivision?.[divisionSlug] ?? [];
    const messages = sortByCreatedAt(serializeMockMessages(records, state.admins));
    const readAt =
      (state.chatReadStatesByDivision?.[divisionSlug] ?? []).find((entry) => entry.adminId === actor.id)
        ?.lastReadAt ?? null;
    const visible = messages.filter((message) => !message.isDeleted);

    return {
      unreadCount: countUnread(messages, actor, readAt),
      latestMessage: visible.length > 0 ? visible[visible.length - 1] : null,
      readAt,
    };
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const readState = await prisma.chatReadState.findUnique({
    where: { divisionId_adminId: { divisionId: division.id, adminId: actor.id } },
    select: { lastReadAt: true },
  });

  const lastReadAt = readState?.lastReadAt ?? new Date(0);

  const [unreadCount, latest] = await Promise.all([
    prisma.chatMessage.count({
      where: {
        divisionId: division.id,
        deletedAt: null,
        createdAt: { gt: lastReadAt },
        // NOT: { authorId } 로 쓰면 author_id 가 NULL 인 행에서 NOT (NULL = x) 가 NULL 이 되어
        // 통째로 빠진다. 계정이 삭제된 사람의 메시지도 안읽음으로 세어야 한다.
        OR: [{ authorId: null }, { authorId: { not: actor.id } }],
      },
    }),
    prisma.chatMessage.findFirst({
      where: { divisionId: division.id, deletedAt: null },
      include: {
        author: { select: { name: true, role: true } },
        deletedBy: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    unreadCount,
    latestMessage: latest ? serializeChatMessage(latest, latest.author, null) : null,
    readAt: readState ? readState.lastReadAt.toISOString() : null,
  };
}

export async function markChatRead(
  divisionSlug: string,
  actor: ChatActor,
  input: ChatReadInput = {},
): Promise<ChatUnreadSummary> {
  if (isMockMode()) {
    const { updateMockState } = await getMockStore();
    const { getMockDivisionBySlug } = await import("@/lib/mock-data");

    await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const records = state.chatMessagesByDivision[divisionSlug] ?? [];
      const anchor = input.lastReadMessageId
        ? records.find((record) => record.id === input.lastReadMessageId)
        : null;

      applyMockReadState(
        state,
        divisionSlug,
        division.id,
        actor.id,
        anchor ? anchor.createdAt : new Date().toISOString(),
      );
    });

    return getChatUnreadSummary(divisionSlug, actor);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  let lastReadAt = new Date();

  if (input.lastReadMessageId) {
    const anchor = await prisma.chatMessage.findFirst({
      where: { id: input.lastReadMessageId, divisionId: division.id },
      select: { createdAt: true },
    });

    if (!anchor) {
      throw notFound("기준 메시지를 찾을 수 없습니다.");
    }

    lastReadAt = anchor.createdAt;
  }

  await advanceReadState(prisma, division.id, actor.id, lastReadAt);

  return getChatUnreadSummary(divisionSlug, actor);
}

/**
 * 읽은 시각을 앞으로만 전진시킨다.
 * upsert 의 update 로 바로 쓰면 오래된 메시지 id 를 보냈을 때 값이 뒤로 가고,
 * 이미 읽은 메시지가 다시 안읽음으로 살아난다.
 */
async function advanceReadState(
  prisma: Awaited<ReturnType<typeof getPrismaClient>>,
  divisionId: string,
  adminId: string,
  lastReadAt: Date,
) {
  await prisma.chatReadState.upsert({
    where: { divisionId_adminId: { divisionId, adminId } },
    create: { divisionId, adminId, lastReadAt },
    update: {},
  });

  await prisma.chatReadState.updateMany({
    where: { divisionId, adminId, lastReadAt: { lt: lastReadAt } },
    data: { lastReadAt },
  });
}

/** mock 상태의 읽음 기록을 만들거나 앞으로만 전진시킨다. */
function applyMockReadState(
  state: {
    chatReadStatesByDivision: Record<
      string,
      Array<{ id: string; divisionId: string; adminId: string; lastReadAt: string; updatedAt: string }>
    >;
  },
  divisionSlug: string,
  divisionId: string,
  adminId: string,
  lastReadAt: string,
) {
  const entries = state.chatReadStatesByDivision[divisionSlug] ?? [];
  const existing = entries.find((entry) => entry.adminId === adminId);

  if (existing) {
    if (lastReadAt > existing.lastReadAt) {
      existing.lastReadAt = lastReadAt;
      existing.updatedAt = new Date().toISOString();
    }

    return;
  }

  state.chatReadStatesByDivision[divisionSlug] = [
    ...entries,
    {
      id: `mock-chat-read-${divisionSlug}-${adminId}`,
      divisionId,
      adminId,
      lastReadAt,
      updatedAt: new Date().toISOString(),
    },
  ];
}
