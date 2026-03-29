import { isMockMode } from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockAdminRecord,
  type MockDivisionRecord,
} from "@/lib/mock-store";
import type {
  AdminAccountCreateInput,
  AdminAccountUpdateInput,
  DivisionCreateInput,
  DivisionUpdateInput,
} from "@/lib/super-admin-schemas";
import {
  createSupabaseManagedUser,
  deleteSupabaseManagedUser,
  listSupabaseUsersByIds,
  updateSupabaseManagedUserPassword,
} from "@/lib/supabase/admin";

export type ManagedDivision = {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
};

export type ManagedDivisionDeleteResult = {
  slug: string;
  name: string;
};

export type ManagedAdminAccount = {
  id: string;
  userId: string;
  email: string | null;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  divisionId: string | null;
  divisionSlug: string | null;
  divisionName: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ManagedAdminAssignment = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
  divisionId: string | null;
  divisionSlug: string | null;
  divisionName: string | null;
  isActive: boolean;
};

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function serializeDivision(division: {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  color: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
}) {
  return {
    id: division.id,
    slug: division.slug,
    name: division.name,
    fullName: division.fullName,
    color: division.color,
    isActive: division.isActive,
    displayOrder: division.displayOrder,
    createdAt:
      typeof division.createdAt === "string" ? division.createdAt : division.createdAt.toISOString(),
  } satisfies ManagedDivision;
}

function serializeMockAdmin(admin: MockAdminRecord, divisionNameBySlug: Map<string, string>) {
  return {
    id: admin.id,
    userId: admin.userId,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.divisionSlug,
    divisionName: admin.divisionSlug ? divisionNameBySlug.get(admin.divisionSlug) ?? null : null,
    isActive: admin.isActive,
    createdAt: admin.createdAt,
  } satisfies ManagedAdminAccount;
}

async function getDivisionOrThrow(slug: string) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug,
    },
  });

  if (!division) {
    throw new Error("지점 정보를 찾을 수 없습니다.");
  }

  return division;
}

async function resolveDivisionForAdmin(
  divisionSlug: string | null | undefined,
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT",
) {
  if (role === "SUPER_ADMIN") {
    return {
      divisionId: null,
      divisionSlug: null,
    };
  }

  if (!divisionSlug) {
    throw new Error("지점 선택이 필요합니다.");
  }

  if (isMockMode()) {
    const state = await readMockState();
    const division = state.divisions.find((item) => item.slug === divisionSlug);

    if (!division) {
      throw new Error("지점 정보를 찾을 수 없습니다.");
    }

    return {
      divisionId: division.id,
      divisionSlug: division.slug,
    };
  }

  const division = await getDivisionOrThrow(divisionSlug);
  return {
    divisionId: division.id,
    divisionSlug: division.slug,
  };
}

export async function listManagedDivisions() {
  if (isMockMode()) {
    const state = await readMockState();
    return [...state.divisions]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((division) => serializeDivision(division));
  }

  const prisma = await getPrismaClient();
  const divisions = await prisma.division.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  return divisions.map((division) => serializeDivision(division));
}

export async function createManagedDivision(input: DivisionCreateInput) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      if (state.divisions.some((division) => division.slug === input.slug)) {
        throw new Error("이미 사용 중인 지점 slug입니다.");
      }
      const division: MockDivisionRecord = {
        id: "mock-division-" + input.slug,
        slug: input.slug,
        name: input.name,
        fullName: input.fullName,
        color: input.color,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder,
        createdAt: new Date().toISOString(),
      };
      state.divisions = [...state.divisions, division];
      state.deletedDivisionSlugs = (state.deletedDivisionSlugs ?? []).filter(
        (slug) => slug !== input.slug,
      );
      return serializeDivision(division);
    });
  }

  const prisma = await getPrismaClient();
  const division = await prisma.$transaction(async (tx) => {
    const createdDivision = await tx.division.create({
      data: {
        name: input.name,
        slug: input.slug,
        fullName: input.fullName,
        color: input.color,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder,
      },
    });

    await tx.divisionSettings.create({
      data: {
        divisionId: createdDivision.id,
      },
    });

    return createdDivision;
  });

  return serializeDivision(division);
}

export async function updateManagedDivision(slug: string, input: DivisionUpdateInput) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division = state.divisions.find((item) => item.slug === slug);
      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }
      state.divisions = state.divisions.map((item) =>
        item.slug === slug
          ? {
              ...item,
              name: input.name,
              fullName: input.fullName,
              color: input.color,
              isActive: input.isActive,
              displayOrder: input.displayOrder,
            }
          : item,
      );
      return serializeDivision(
        state.divisions.find((item) => item.slug === slug) ?? division,
      );
    });
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.update({
    where: {
      slug,
    },
    data: {
      name: input.name,
      fullName: input.fullName,
      color: input.color,
      isActive: input.isActive,
      displayOrder: input.displayOrder,
    },
  });

  return serializeDivision(division);
}

function removeDivisionScopedCollections<T>(
  source: Record<string, T>,
  divisionSlug: string,
) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== divisionSlug),
  ) as Record<string, T>;
}

export async function deleteManagedDivision(slug: string): Promise<ManagedDivisionDeleteResult> {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division = state.divisions.find((item) => item.slug === slug);
      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }
      const now = new Date().toISOString();
      state.divisions = state.divisions.filter((item) => item.slug !== slug);
      state.deletedDivisionSlugs = Array.from(
        new Set([...(state.deletedDivisionSlugs ?? []), slug]),
      );
      state.admins = state.admins.map((admin) =>
        admin.divisionSlug === slug
          ? {
              ...admin,
              divisionId: null,
              divisionSlug: null,
              isActive: false,
              updatedAt: now,
            }
          : admin,
      );
      state.divisionSettingsByDivision = removeDivisionScopedCollections(
        state.divisionSettingsByDivision,
        slug,
      );
      state.periodsByDivision = removeDivisionScopedCollections(state.periodsByDivision, slug);
      state.attendanceByDivision = removeDivisionScopedCollections(state.attendanceByDivision, slug);
      state.studentsByDivision = removeDivisionScopedCollections(state.studentsByDivision, slug);
      state.studyRoomsByDivision = removeDivisionScopedCollections(state.studyRoomsByDivision, slug);
      state.seatsByDivision = removeDivisionScopedCollections(state.seatsByDivision, slug);
      state.pointRulesByDivision = removeDivisionScopedCollections(state.pointRulesByDivision, slug);
      state.pointRecordsByDivision = removeDivisionScopedCollections(state.pointRecordsByDivision, slug);
      state.paymentCategoriesByDivision = removeDivisionScopedCollections(
        state.paymentCategoriesByDivision,
        slug,
      );
      state.paymentRecordsByDivision = removeDivisionScopedCollections(
        state.paymentRecordsByDivision,
        slug,
      );
      state.tuitionPlansByDivision = removeDivisionScopedCollections(
        state.tuitionPlansByDivision,
        slug,
      );
      state.leavePermissionsByDivision = removeDivisionScopedCollections(
        state.leavePermissionsByDivision,
        slug,
      );
      state.interviewsByDivision = removeDivisionScopedCollections(state.interviewsByDivision, slug);
      state.announcementsByDivision = removeDivisionScopedCollections(
        state.announcementsByDivision,
        slug,
      );
      state.examTypesByDivision = removeDivisionScopedCollections(state.examTypesByDivision, slug);
      state.examScoresByDivision = removeDivisionScopedCollections(state.examScoresByDivision, slug);
      state.scoreTargetsByDivision = removeDivisionScopedCollections(state.scoreTargetsByDivision, slug);
      return {
        slug: division.slug,
        name: division.name,
      };
    });
  }

  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!division) {
    throw new Error("지점 정보를 찾을 수 없습니다.");
  }

  // 학생 데이터가 존재하면 삭제 차단 (CASCADE로 모든 성적·출결·상벌점 유실 방지)
  const studentCount = await prisma.student.count({
    where: { divisionId: division.id },
  });

  if (studentCount > 0) {
    throw new Error(
      `이 지점에 학생 ${studentCount}명의 데이터가 존재합니다. 지점을 삭제하면 모든 학생·출결·성적·상벌점 데이터가 영구 삭제됩니다. 먼저 모든 학생을 퇴실 처리하거나 다른 지점으로 이동해주세요.`,
    );
  }

  await prisma.$transaction([
    prisma.admin.updateMany({
      where: {
        divisionId: division.id,
      },
      data: {
        divisionId: null,
        isActive: false,
      },
    }),
    prisma.division.delete({
      where: {
        id: division.id,
      },
    }),
  ]);

  return {
    slug: division.slug,
    name: division.name,
  };
}

export async function listManagedAdminAccounts() {
  if (isMockMode()) {
    const state = await readMockState();
    const divisionNameBySlug = new Map(
      state.divisions.map((division) => [division.slug, division.name]),
    );

    return [...state.admins]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((admin) => serializeMockAdmin(admin, divisionNameBySlug));
  }

  const prisma = await getPrismaClient();
  const admins = await prisma.admin.findMany({
    include: {
      division: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const usersById = await listSupabaseUsersByIds(admins.map((admin) => admin.userId));

  return admins.map((admin) => ({
    id: admin.id,
    userId: admin.userId,
    email: usersById.get(admin.userId)?.email ?? null,
    name: admin.name,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.division?.slug ?? null,
    divisionName: admin.division?.name ?? null,
    isActive: admin.isActive,
    createdAt: admin.createdAt.toISOString(),
  })) satisfies ManagedAdminAccount[];
}

export async function listManagedAdminAssignments() {
  if (isMockMode()) {
    const state = await readMockState();
    const divisionNameBySlug = new Map(
      state.divisions.map((division) => [division.slug, division.name]),
    );

    return [...state.admins]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((admin) => ({
        id: admin.id,
        role: admin.role,
        divisionId: admin.divisionId,
        divisionSlug: admin.divisionSlug,
        divisionName: admin.divisionSlug ? divisionNameBySlug.get(admin.divisionSlug) ?? null : null,
        isActive: admin.isActive,
      })) satisfies ManagedAdminAssignment[];
  }

  const prisma = await getPrismaClient();
  const admins = await prisma.admin.findMany({
    select: {
      id: true,
      role: true,
      divisionId: true,
      isActive: true,
      division: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return admins.map((admin) => ({
    id: admin.id,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.division?.slug ?? null,
    divisionName: admin.division?.name ?? null,
    isActive: admin.isActive,
  })) satisfies ManagedAdminAssignment[];
}

export async function createManagedAdminAccount(input: AdminAccountCreateInput) {
  const divisionContext = await resolveDivisionForAdmin(input.divisionSlug ?? null, input.role);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      if (state.admins.some((admin) => admin.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error("이미 사용 중인 이메일입니다.");
      }
      const timestamp = Date.now();
      const record: MockAdminRecord = {
        id: "mock-managed-admin-" + timestamp,
        userId: "mock-managed-user-" + timestamp,
        email: input.email,
        name: input.name,
        role: input.role,
        divisionId: divisionContext.divisionId,
        divisionSlug: divisionContext.divisionSlug,
        isActive: input.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.admins = [...state.admins, record];
      const divisionNameBySlug = new Map(
        state.divisions.map((division) => [division.slug, division.name]),
      );
      return serializeMockAdmin(record, divisionNameBySlug);
    });
  }

  const user = await createSupabaseManagedUser({
    email: input.email,
    password: input.password,
    name: input.name,
  });

  try {
    const prisma = await getPrismaClient();
    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        name: input.name,
        role: input.role,
        divisionId: divisionContext.divisionId,
        isActive: input.isActive ?? true,
      },
      include: {
        division: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    return {
      id: admin.id,
      userId: admin.userId,
      email: input.email,
      name: admin.name,
      role: admin.role,
      divisionId: admin.divisionId,
      divisionSlug: admin.division?.slug ?? null,
      divisionName: admin.division?.name ?? null,
      isActive: admin.isActive,
      createdAt: admin.createdAt.toISOString(),
    } satisfies ManagedAdminAccount;
  } catch (error) {
    await deleteSupabaseManagedUser(user.id).catch(() => undefined);
    throw error;
  }
}

export async function deleteManagedAdminAccount(id: string) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const target = state.admins.find((admin) => admin.id === id);
      if (!target) {
        throw new Error("계정 정보를 찾을 수 없습니다.");
      }
      state.admins = state.admins.map((admin) =>
        admin.id === id ? { ...admin, isActive: false, updatedAt: new Date().toISOString() } : admin,
      );
      return { id: target.id, name: target.name };
    });
  }

  const prisma = await getPrismaClient();
  const admin = await prisma.admin.findUnique({ where: { id }, select: { id: true, name: true, userId: true } });
  if (!admin) {
    throw new Error("계정 정보를 찾을 수 없습니다.");
  }

  await prisma.admin.update({ where: { id }, data: { isActive: false } });
  return { id: admin.id, name: admin.name };
}

export async function resetManagedAdminPassword(id: string, password: string) {
  if (isMockMode()) {
    const state = await readMockState();
    const target = state.admins.find((admin) => admin.id === id);
    if (!target) {
      throw new Error("계정 정보를 찾을 수 없습니다.");
    }
    return { id: target.id, name: target.name };
  }

  const prisma = await getPrismaClient();
  const admin = await prisma.admin.findUnique({ where: { id }, select: { id: true, name: true, userId: true } });
  if (!admin) {
    throw new Error("계정 정보를 찾을 수 없습니다.");
  }

  await updateSupabaseManagedUserPassword(admin.userId, password);
  return { id: admin.id, name: admin.name };
}

export async function updateManagedAdminAccount(id: string, input: AdminAccountUpdateInput) {
  const divisionContext = await resolveDivisionForAdmin(input.divisionSlug ?? null, input.role);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const target = state.admins.find((admin) => admin.id === id);
      if (!target) {
        throw new Error("계정 정보를 찾을 수 없습니다.");
      }
      state.admins = state.admins.map((admin) =>
        admin.id === id
          ? {
              ...admin,
              name: input.name,
              role: input.role,
              divisionId: divisionContext.divisionId,
              divisionSlug: divisionContext.divisionSlug,
              isActive: input.isActive,
              updatedAt: new Date().toISOString(),
            }
          : admin,
      );
      const refreshed = state.admins.find((admin) => admin.id === id) ?? target;
      const divisionNameBySlug = new Map(
        state.divisions.map((division) => [division.slug, division.name]),
      );
      return serializeMockAdmin(refreshed, divisionNameBySlug);
    });
  }

  const prisma = await getPrismaClient();
  const admin = await prisma.admin.update({
    where: {
      id,
    },
    data: {
      name: input.name,
      role: input.role,
      divisionId: divisionContext.divisionId,
      isActive: input.isActive,
    },
    include: {
      division: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  const usersById = await listSupabaseUsersByIds([admin.userId]);

  return {
    id: admin.id,
    userId: admin.userId,
    email: usersById.get(admin.userId)?.email ?? null,
    name: admin.name,
    role: admin.role,
    divisionId: admin.divisionId,
    divisionSlug: admin.division?.slug ?? null,
    divisionName: admin.division?.name ?? null,
    isActive: admin.isActive,
    createdAt: admin.createdAt.toISOString(),
  } satisfies ManagedAdminAccount;
}
