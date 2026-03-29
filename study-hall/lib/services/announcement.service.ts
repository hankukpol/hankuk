import {
  getMockAdminSession,
  getMockDivisionBySlug,
  isMockMode,
  MOCK_DIVISIONS,
} from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockAnnouncementRecord,
} from "@/lib/mock-store";
import type { AnnouncementSchemaInput } from "@/lib/announcement-schemas";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
} from "@/lib/service-helpers";

type AnnouncementActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  name?: string;
};

export type AnnouncementScope = "DIVISION" | "GLOBAL";

export type AnnouncementItem = {
  id: string;
  divisionId: string | null;
  divisionName: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  scope: AnnouncementScope;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  isPublished: boolean;
};

export type PinnedAnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  divisionName: string | null;
  publishedAt: string | null;
};

function normalizeText(value: string) {
  return value.trim();
}

function normalizeContent(value: string) {
  return value.trim();
}

function getNow() {
  return new Date();
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function parsePublishedAt(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const offsetDate = new Date(trimmed);

  if (!Number.isNaN(offsetDate.getTime()) && /[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return offsetDate.toISOString();
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) {
    throw badRequest("발행 일시는 YYYY-MM-DDTHH:mm 또는 YYYY-MM-DDTHH:mm:ss 형식이어야 합니다.");
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const utcDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 9,
      Number(minute),
      Number(second),
    ),
  );

  if (Number.isNaN(utcDate.getTime())) {
    throw badRequest("발행 일시는 YYYY-MM-DDTHH:mm 또는 YYYY-MM-DDTHH:mm:ss 형식이어야 합니다.");
  }

  return utcDate.toISOString();
}

function isPublishedAnnouncement(value: string | Date | null | undefined) {
  if (!value) {
    return true;
  }

  return new Date(value).getTime() <= getNow().getTime();
}

function sortAnnouncements<
  T extends {
    isPinned: boolean;
    publishedAt?: string | Date | null;
    updatedAt: string | Date;
    createdAt: string | Date;
  },
>(announcements: T[]) {
  return [...announcements].sort((left, right) => {
    const leftPrimary = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightPrimary = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    const leftUpdated = new Date(left.updatedAt).getTime();
    const rightUpdated = new Date(right.updatedAt).getTime();
    const leftCreated = new Date(left.createdAt).getTime();
    const rightCreated = new Date(right.createdAt).getTime();

    return (
      Number(right.isPinned) - Number(left.isPinned) ||
      rightPrimary - leftPrimary ||
      rightUpdated - leftUpdated ||
      rightCreated - leftCreated
    );
  });
}

function serializeAnnouncement(
  record: {
    id: string;
    divisionId: string | null;
    title: string;
    content: string;
    isPinned: boolean;
    createdById: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    publishedAt?: string | Date | null;
  },
  divisionName: string | null,
  createdByName: string,
) {
  const publishedAt = toIsoString(record.publishedAt);

  return {
    id: record.id,
    divisionId: record.divisionId,
    divisionName,
    title: record.title,
    content: record.content,
    isPinned: record.isPinned,
    scope: record.divisionId ? "DIVISION" : "GLOBAL",
    createdById: record.createdById,
    createdByName,
    createdAt:
      typeof record.createdAt === "string" ? record.createdAt : record.createdAt.toISOString(),
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : record.updatedAt.toISOString(),
    publishedAt,
    isPublished: isPublishedAnnouncement(record.publishedAt),
  } satisfies AnnouncementItem;
}

async function getDivisionOrThrow(divisionSlug: string) {
  const { prisma } = await import("@/lib/prisma");

  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
}

function assertGlobalPermission(actor: AnnouncementActor) {
  if (actor.role !== "SUPER_ADMIN") {
    throw forbidden("전체 공지사항은 최고 관리자만 관리할 수 있습니다.");
  }
}

function getMockAnnouncementBuckets(
  divisionSlug: string,
  state: Awaited<ReturnType<typeof readMockState>>,
) {
  return {
    divisionAnnouncements: state.announcementsByDivision[divisionSlug] ?? [],
    globalAnnouncements: state.globalAnnouncements ?? [],
  };
}

export async function listAnnouncements(
  divisionSlug: string,
  options?: {
    includeScheduled?: boolean;
  },
): Promise<AnnouncementItem[]> {
  const includeScheduled = options?.includeScheduled ?? false;

  if (isMockMode()) {
    const state = await readMockState();
    const { divisionAnnouncements, globalAnnouncements } = getMockAnnouncementBuckets(divisionSlug, state);
    const divisionMap = new Map(MOCK_DIVISIONS.map((division) => [division.id, division]));

    return sortAnnouncements([...divisionAnnouncements, ...globalAnnouncements])
      .filter((record) => includeScheduled || isPublishedAnnouncement(record.publishedAt))
      .map((record) =>
        serializeAnnouncement(
          record,
          record.divisionId
            ? (divisionMap.get(record.divisionId)?.fullName ?? divisionMap.get(record.divisionId)?.name ?? null)
            : null,
          record.divisionId === null ? "최고관리자" : getMockAdminSession(divisionSlug).name,
        ),
      );
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  let announcements: Array<{
    id: string;
    divisionId: string | null;
    title: string;
    content: string;
    isPinned: boolean;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    division: {
      name: string;
      fullName: string;
    } | null;
    createdBy: {
      name: string;
    };
  }>;

  try {
    announcements = await prisma.announcement.findMany({
      where: {
        OR: [{ divisionId: division.id }, { divisionId: null }],
      },
      select: {
        id: true,
        divisionId: true,
        title: true,
        content: true,
        isPinned: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        division: {
          select: {
            name: true,
            fullName: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
    });
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["announcements", "published_at"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("announcements:list", error);
    const legacyAnnouncements = await prisma.announcement.findMany({
      where: {
        OR: [{ divisionId: division.id }, { divisionId: null }],
      },
      select: {
        id: true,
        divisionId: true,
        title: true,
        content: true,
        isPinned: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        division: {
          select: {
            name: true,
            fullName: true,
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
      },
    });

    announcements = legacyAnnouncements.map((record) => ({
      ...record,
      publishedAt: null,
    }));
  }

  return sortAnnouncements(announcements)
    .filter((record) => includeScheduled || isPublishedAnnouncement(record.publishedAt))
    .map((record) =>
      serializeAnnouncement(
        record,
        record.divisionId ? (record.division?.fullName ?? record.division?.name ?? null) : null,
        record.createdBy.name,
      ),
    );
}

export async function listPinnedAnnouncements(divisionSlug: string): Promise<AnnouncementItem[]> {
  const announcements = await listAnnouncements(divisionSlug);
  return announcements.filter((item) => item.isPinned && item.isPublished);
}

export async function createAnnouncement(
  divisionSlug: string,
  actor: AnnouncementActor,
  input: AnnouncementSchemaInput,
) {
  if (input.scope === "GLOBAL") {
    assertGlobalPermission(actor);
  }

  const title = normalizeText(input.title);
  const content = normalizeContent(input.content);
  const publishedAt = parsePublishedAt(input.publishedAt);

  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const now = new Date().toISOString();
      const nextRecord: MockAnnouncementRecord = {
        id: `mock-announcement-${divisionSlug}-${Date.now()}`,
        divisionId: input.scope === "GLOBAL" ? null : division.id,
        title,
        content,
        isPinned: input.isPinned ?? false,
        publishedAt,
        createdById: actor.id,
        createdAt: now,
        updatedAt: now,
      };

      if (nextRecord.divisionId) {
        state.announcementsByDivision[divisionSlug] = [
          nextRecord,
          ...(state.announcementsByDivision[divisionSlug] ?? []),
        ];
      } else {
        state.globalAnnouncements = [nextRecord, ...(state.globalAnnouncements ?? [])];
      }

      return nextRecord;
    });

    return (
      await listAnnouncements(divisionSlug, { includeScheduled: true })
    ).find((item) => item.id === record.id) ?? null;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const announcement = await prisma.announcement.create({
    data: {
      divisionId: input.scope === "GLOBAL" ? null : division.id,
      title,
      content,
      isPinned: input.isPinned ?? false,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      createdById: actor.id,
    },
    include: {
      division: { select: { name: true, fullName: true } },
      createdBy: { select: { name: true } },
    },
  });

  return serializeAnnouncement(
    announcement,
    announcement.divisionId ? (announcement.division?.fullName ?? announcement.division?.name ?? null) : null,
    announcement.createdBy.name,
  );
}
export async function updateAnnouncement(
  divisionSlug: string,
  actor: AnnouncementActor,
  announcementId: string,
  input: AnnouncementSchemaInput,
) {
  if (input.scope === "GLOBAL") {
    assertGlobalPermission(actor);
  }

  const title = normalizeText(input.title);
  const content = normalizeContent(input.content);
  const publishedAt = parsePublishedAt(input.publishedAt);

  if (isMockMode()) {
    await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const { divisionAnnouncements, globalAnnouncements } = getMockAnnouncementBuckets(
        divisionSlug,
        state,
      );
      const current =
        divisionAnnouncements.find((item) => item.id === announcementId) ??
        globalAnnouncements.find((item) => item.id === announcementId) ??
        null;

      if (!current) {
        throw notFound("공지사항을 찾을 수 없습니다.");
      }

      if (current.divisionId === null) {
        assertGlobalPermission(actor);
      }

      state.announcementsByDivision[divisionSlug] = divisionAnnouncements.filter(
        (item) => item.id !== announcementId,
      );
      state.globalAnnouncements = globalAnnouncements.filter((item) => item.id !== announcementId);

      const nextRecord: MockAnnouncementRecord = {
        ...current,
        divisionId: input.scope === "GLOBAL" ? null : division.id,
        title,
        content,
        isPinned: input.isPinned ?? false,
        publishedAt,
        updatedAt: new Date().toISOString(),
      };

      if (nextRecord.divisionId) {
        state.announcementsByDivision[divisionSlug] = [
          nextRecord,
          ...(state.announcementsByDivision[divisionSlug] ?? []),
        ];
      } else {
        state.globalAnnouncements = [nextRecord, ...(state.globalAnnouncements ?? [])];
      }
    });

    return (
      await listAnnouncements(divisionSlug, { includeScheduled: true })
    ).find((item) => item.id === announcementId) ?? null;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const current = await prisma.announcement.findFirst({
    where: {
      id: announcementId,
      OR: [{ divisionId: division.id }, { divisionId: null }],
    },
    select: {
      id: true,
      divisionId: true,
    },
  });

  if (!current) {
    throw notFound("공지사항을 찾을 수 없습니다.");
  }

  if (current.divisionId === null) {
    assertGlobalPermission(actor);
  }

  const updated = await prisma.announcement.update({
    where: {
      id: announcementId,
    },
    data: {
      divisionId: input.scope === "GLOBAL" ? null : division.id,
      title,
      content,
      isPinned: input.isPinned ?? false,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    },
    include: {
      division: { select: { name: true, fullName: true } },
      createdBy: { select: { name: true } },
    },
  });

  return serializeAnnouncement(
    updated,
    updated.divisionId ? (updated.division?.fullName ?? updated.division?.name ?? null) : null,
    updated.createdBy.name,
  );
}

export async function deleteAnnouncement(
  divisionSlug: string,
  actor: AnnouncementActor,
  announcementId: string,
) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const divisionAnnouncements = state.announcementsByDivision[divisionSlug] ?? [];
      const globalAnnouncements = state.globalAnnouncements ?? [];
      const current =
        divisionAnnouncements.find((item) => item.id === announcementId) ??
        globalAnnouncements.find((item) => item.id === announcementId) ??
        null;

      if (!current) {
        throw notFound("공지사항을 찾을 수 없습니다.");
      }

      if (current.divisionId === null) {
        assertGlobalPermission(actor);
      }

      state.announcementsByDivision[divisionSlug] = divisionAnnouncements.filter(
        (item) => item.id !== announcementId,
      );
      state.globalAnnouncements = globalAnnouncements.filter((item) => item.id !== announcementId);
    });
    return;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const current = await prisma.announcement.findFirst({
    where: {
      id: announcementId,
      OR: [{ divisionId: division.id }, { divisionId: null }],
    },
    select: {
      id: true,
      divisionId: true,
    },
  });

  if (!current) {
    throw notFound("공지사항을 찾을 수 없습니다.");
  }

  if (current.divisionId === null) {
    assertGlobalPermission(actor);
  }

  await prisma.announcement.delete({
    where: {
      id: announcementId,
    },
  });
}
