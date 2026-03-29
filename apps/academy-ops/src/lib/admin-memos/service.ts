import {
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AdminRole,
  Prisma,
} from "@prisma/client";
import { roleAtLeast } from "@/lib/auth";
import { toAuditJson } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";

const memoInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.AdminMemoInclude;

export type AdminMemoRecord = Prisma.AdminMemoGetPayload<{
  include: typeof memoInclude;
}>;

export type ActiveAdminRecord = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

type MemoMutationActor = {
  adminId: string;
  adminRole: AdminRole;
  ipAddress?: string | null;
};

export type AdminMemoCreateInput = {
  title: string;
  content?: string | null;
  color?: AdminMemoColor;
  scope?: AdminMemoScope;
  status?: AdminMemoStatus;
  isPinned?: boolean;
  dueAt?: string | Date | null;
  assigneeId?: string | null;
  relatedStudentExamNumber?: string | null;
};

export type AdminMemoUpdateInput = Partial<AdminMemoCreateInput>;

function getVisibleMemoWhere(viewerId: string): Prisma.AdminMemoWhereInput {
  return {
    OR: [
      { scope: AdminMemoScope.TEAM },
      { ownerId: viewerId },
      { assigneeId: viewerId },
    ],
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function parseDueAt(value: string | Date | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("마감일 형식이 올바르지 않습니다.");
    }

    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999`);
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("마감일 형식이 올바르지 않습니다.");
  }

  return parsed;
}

function normalizeCreateInput(input: AdminMemoCreateInput) {
  const title = String(input.title ?? "").trim();

  if (!title) {
    throw new Error("메모 제목을 입력해 주세요.");
  }

  return {
    title,
    content: normalizeOptionalText(input.content),
    color: input.color ?? AdminMemoColor.SAND,
    scope: input.scope ?? AdminMemoScope.PRIVATE,
    status: input.status ?? AdminMemoStatus.OPEN,
    isPinned: Boolean(input.isPinned),
    dueAt: parseDueAt(input.dueAt) ?? null,
    assigneeId: normalizeOptionalText(input.assigneeId),
    relatedStudentExamNumber: normalizeOptionalText(input.relatedStudentExamNumber),
  };
}

function normalizeUpdateInput(input: AdminMemoUpdateInput) {
  const data: Prisma.AdminMemoUpdateInput = {};
  let normalizedAssigneeId: string | null | undefined;

  if ("title" in input) {
    const title = String(input.title ?? "").trim();

    if (!title) {
      throw new Error("메모 제목을 입력해 주세요.");
    }

    data.title = title;
  }

  if ("content" in input) {
    data.content = normalizeOptionalText(input.content);
  }

  if ("color" in input && input.color) {
    data.color = input.color;
  }

  if ("scope" in input && input.scope) {
    data.scope = input.scope;
  }

  if ("status" in input && input.status) {
    data.status = input.status;
  }

  if ("isPinned" in input && input.isPinned !== undefined) {
    data.isPinned = Boolean(input.isPinned);
  }

  if ("dueAt" in input) {
    data.dueAt = parseDueAt(input.dueAt);
  }

  if ("assigneeId" in input) {
    normalizedAssigneeId = normalizeOptionalText(input.assigneeId);
    data.assignee =
      normalizedAssigneeId === null
        ? { disconnect: true }
        : normalizedAssigneeId
          ? { connect: { id: normalizedAssigneeId } }
          : undefined;
  }

  if ("relatedStudentExamNumber" in input) {
    data.relatedStudentExamNumber = normalizeOptionalText(input.relatedStudentExamNumber);
  }

  if (Object.keys(data).length === 0) {
    throw new Error("변경할 메모 항목이 없습니다.");
  }

  return { data, normalizedAssigneeId };
}

function memoStatusRank(status: AdminMemoStatus) {
  switch (status) {
    case AdminMemoStatus.OPEN:
      return 0;
    case AdminMemoStatus.IN_PROGRESS:
      return 1;
    case AdminMemoStatus.DONE:
      return 2;
    default:
      return 3;
  }
}

function sortMemos(records: AdminMemoRecord[]) {
  return [...records].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return Number(right.isPinned) - Number(left.isPinned);
    }

    const statusDiff = memoStatusRank(left.status) - memoStatusRank(right.status);

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const leftDue = left.dueAt ? left.dueAt.getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? right.dueAt.getTime() : Number.POSITIVE_INFINITY;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

async function assertValidAssignee(
  tx: Prisma.TransactionClient,
  assigneeId: string | null | undefined,
) {
  if (!assigneeId) {
    return;
  }

  const admin = await tx.adminUser.findUnique({
    where: {
      id: assigneeId,
    },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!admin || !admin.isActive) {
    throw new Error("담당자 계정을 찾을 수 없습니다.");
  }
}

function canEditMemo(memo: { ownerId: string; assigneeId: string | null; scope: AdminMemoScope }, actor: MemoMutationActor) {
  if (roleAtLeast(actor.adminRole, AdminRole.SUPER_ADMIN)) {
    return true;
  }

  if (memo.scope === AdminMemoScope.TEAM) {
    return true;
  }

  return memo.ownerId === actor.adminId || memo.assigneeId === actor.adminId;
}

function canDeleteMemo(memo: { ownerId: string }, actor: MemoMutationActor) {
  return roleAtLeast(actor.adminRole, AdminRole.SUPER_ADMIN) || memo.ownerId === actor.adminId;
}

export async function listActiveAdmins() {
  return getPrisma().adminUser.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: [{ role: "desc" }, { name: "asc" }],
  }) as Promise<ActiveAdminRecord[]>;
}

export async function listAdminMemos(viewerId: string) {
  const memos = await getPrisma().adminMemo.findMany({
    where: getVisibleMemoWhere(viewerId),
    include: memoInclude,
  });

  return sortMemos(memos);
}

export async function createAdminMemo(
  actor: MemoMutationActor,
  input: AdminMemoCreateInput,
) {
  const payload = normalizeCreateInput(input);

  return getPrisma().$transaction(async (tx) => {
    await assertValidAssignee(tx, payload.assigneeId);

    const memo = await tx.adminMemo.create({
      data: {
        ...payload,
        ownerId: actor.adminId,
      },
      include: memoInclude,
    });

    await tx.auditLog.create({
      data: {
        adminId: actor.adminId,
        action: "ADMIN_MEMO_CREATE",
        targetType: "AdminMemo",
        targetId: String(memo.id),
        before: toAuditJson(null),
        after: toAuditJson(memo),
        ipAddress: actor.ipAddress ?? null,
      },
    });

    return memo;
  });
}

export async function updateAdminMemo(
  actor: MemoMutationActor,
  memoId: number,
  input: AdminMemoUpdateInput,
) {
  const { data: payload, normalizedAssigneeId } = normalizeUpdateInput(input);

  return getPrisma().$transaction(async (tx) => {
    const before = await tx.adminMemo.findUniqueOrThrow({
      where: {
        id: memoId,
      },
      include: memoInclude,
    });

    if (!canEditMemo(before, actor)) {
      throw new Error("이 메모를 수정할 권한이 없습니다.");
    }

    await assertValidAssignee(tx, normalizedAssigneeId ?? null);

    const memo = await tx.adminMemo.update({
      where: {
        id: memoId,
      },
      data: payload,
      include: memoInclude,
    });

    await tx.auditLog.create({
      data: {
        adminId: actor.adminId,
        action: "ADMIN_MEMO_UPDATE",
        targetType: "AdminMemo",
        targetId: String(memo.id),
        before: toAuditJson(before),
        after: toAuditJson(memo),
        ipAddress: actor.ipAddress ?? null,
      },
    });

    return memo;
  });
}

export async function deleteAdminMemo(actor: MemoMutationActor, memoId: number) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.adminMemo.findUniqueOrThrow({
      where: {
        id: memoId,
      },
      include: memoInclude,
    });

    if (!canDeleteMemo(before, actor)) {
      throw new Error("이 메모를 삭제할 권한이 없습니다.");
    }

    await tx.adminMemo.delete({
      where: {
        id: memoId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: actor.adminId,
        action: "ADMIN_MEMO_DELETE",
        targetType: "AdminMemo",
        targetId: String(memoId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: actor.ipAddress ?? null,
      },
    });

    return {
      success: true,
    };
  });
}

export async function getAdminMemoDashboardData(viewerId: string) {
  const visibleWhere = getVisibleMemoWhere(viewerId);
  const now = new Date();
  const openStatusFilter = {
    not: AdminMemoStatus.DONE,
  } satisfies Prisma.EnumAdminMemoStatusFilter;

  const [myOpenCount, sharedOpenCount, overdueCount, pinnedOpenCount, focusMemos] =
    await Promise.all([
      getPrisma().adminMemo.count({
        where: {
          AND: [
            visibleWhere,
            {
              status: openStatusFilter,
              OR: [{ ownerId: viewerId }, { assigneeId: viewerId }],
            },
          ],
        },
      }),
      getPrisma().adminMemo.count({
        where: {
          scope: AdminMemoScope.TEAM,
          status: openStatusFilter,
        },
      }),
      getPrisma().adminMemo.count({
        where: {
          AND: [
            visibleWhere,
            {
              status: openStatusFilter,
              dueAt: {
                lt: now,
              },
            },
          ],
        },
      }),
      getPrisma().adminMemo.count({
        where: {
          AND: [
            visibleWhere,
            {
              status: openStatusFilter,
              isPinned: true,
            },
          ],
        },
      }),
      getPrisma().adminMemo.findMany({
        where: {
          AND: [
            visibleWhere,
            {
              status: openStatusFilter,
            },
          ],
        },
        include: memoInclude,
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
    ]);

  return {
    myOpenCount,
    sharedOpenCount,
    overdueCount,
    pinnedOpenCount,
    focusMemos: sortMemos(focusMemos).slice(0, 4),
  };
}

