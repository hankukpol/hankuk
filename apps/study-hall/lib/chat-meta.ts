/**
 * 직원 채팅의 순수 헬퍼.
 * 병합·알림 판단·폴링 간격을 React 밖에 두어 단위 테스트로 검증한다.
 */

export type ChatMessageLike = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatConnectionMode = "realtime" | "polling" | "off";

export type ChatVisibility = "visible" | "hidden";

export const CHAT_UNREAD_BADGE_MAX = 99;

/**
 * 서버 응답과 기존 목록을 합친다.
 * 같은 id 는 updatedAt 이 더 최신인 쪽이 이긴다. 소프트 삭제가 updatedAt 만 올리므로
 * 이 규칙이 곧 "자리표시가 원본을 덮는다"가 된다.
 */
export function mergeChatMessages<T extends ChatMessageLike>(existing: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();

  for (const message of existing) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    const current = byId.get(message.id);

    if (!current || message.updatedAt >= current.updatedAt) {
      byId.set(message.id, message);
    }
  }

  return Array.from(byId.values()).sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }

    // createdAt 이 같을 때도 순서가 흔들리지 않도록 id 로 안정 정렬한다.
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export type NotifyDecisionInput = {
  authorId: string | null;
  messageId: string;
  viewerId: string;
  isDeleted: boolean;
  isHidden: boolean;
  isOnChatPage: boolean;
  alreadyNotified: boolean;
};

/**
 * 알림을 띄울지 판단한다.
 * 내가 쓴 글, 이미 알린 글, 삭제된 글은 제외하고,
 * 탭이 가려져 있거나 채팅 화면이 아닐 때만 알린다.
 */
export function shouldNotifyForMessage(input: NotifyDecisionInput) {
  if (input.isDeleted || input.alreadyNotified) {
    return false;
  }

  if (input.authorId !== null && input.authorId === input.viewerId) {
    return false;
  }

  return input.isHidden || !input.isOnChatPage;
}

export function formatUnreadBadge(count: number) {
  if (count <= 0) {
    return "";
  }

  return count > CHAT_UNREAD_BADGE_MAX ? `${CHAT_UNREAD_BADGE_MAX}+` : String(count);
}

const REALTIME_SAFETY_NET_MS = 300_000;
/** 채팅창을 열고 대화하는 동안. 실시간이 없어도 주고받는 느낌이 나야 한다. */
const POLLING_ACTIVE_MS = 4_000;
const POLLING_VISIBLE_MS = 15_000;
const POLLING_HIDDEN_MS = 60_000;
const POLLING_BACKOFF_MS = 60_000;
const POLLING_FAILURE_THRESHOLD = 3;

/**
 * 다음 폴링까지의 간격.
 * 실시간이 붙어 있으면 놓친 메시지를 줍기 위한 안전망만 돌린다.
 * 붙지 않았을 때는 지금 무엇을 하고 있는지에 따라 세 단계로 나눈다.
 */
export function nextPollIntervalMs(
  mode: ChatConnectionMode,
  visibility: ChatVisibility,
  consecutiveFailures = 0,
  isChatOpen = false,
): number | null {
  if (mode === "off") {
    return null;
  }

  if (mode === "realtime") {
    return REALTIME_SAFETY_NET_MS;
  }

  if (consecutiveFailures >= POLLING_FAILURE_THRESHOLD) {
    return POLLING_BACKOFF_MS;
  }

  if (visibility === "hidden") {
    return POLLING_HIDDEN_MS;
  }

  return isChatOpen ? POLLING_ACTIVE_MS : POLLING_VISIBLE_MS;
}

/** 알림 본문에 넣을 미리보기. */
export function buildMessagePreview(body: string, maxLength = 80) {
  const collapsed = body.replace(/\s+/g, " ").trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength - 1)}…`;
}

export type ChatDeleteActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

/**
 * 삭제 권한. 본인이 쓴 메시지는 누구나, 남의 메시지는 관리자만 지울 수 있다.
 * 작성자 계정이 영구 삭제되어 authorId 가 null 이면 관리자만 지울 수 있다.
 */
export function canDeleteChatMessage(actor: ChatDeleteActor, message: { authorId: string | null }) {
  if (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") {
    return true;
  }

  return message.authorId !== null && message.authorId === actor.id;
}

/** Coalesce concurrent signals, retaining a trailing pass while I/O is in flight. */
export function createChatSyncQueue(sync: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let pending = false;
  let disposed = false;
  return {
    run(): Promise<void> {
      if (disposed) return Promise.resolve();
      pending = true;
      if (!running) {
        running = Promise.resolve().then(async () => {
          while (pending && !disposed) {
            pending = false;
            await sync();
          }
        }).finally(() => { running = null; });
      }
      return running;
    },
    dispose() { disposed = true; pending = false; },
  };
}

/** Only complete delta pages advance the cursor, never send/delete responses. */
export function advanceChatCursor(current: string | null, messages: ChatMessageLike[], complete = true) {
  if (!complete) return current;
  return messages.reduce<string | null>(
    (cursor, message) => cursor === null || message.updatedAt > cursor ? message.updatedAt : cursor,
    current,
  );
}

export function isNewChatArrival(
  previous: Pick<ChatMessageLike, "id" | "createdAt"> | null,
  next: Pick<ChatMessageLike, "id" | "createdAt"> | null,
) {
  return next !== null && (previous === null || next.createdAt > previous.createdAt ||
    (next.createdAt === previous.createdAt && next.id > previous.id));
}
