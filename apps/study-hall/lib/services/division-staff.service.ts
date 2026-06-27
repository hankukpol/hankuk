import { revalidatePath, revalidateTag } from "next/cache";

import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState, type MockAdminRecord } from "@/lib/mock-store";
import type { StaffCreateInput, StaffUpdateInput } from "@/lib/division-staff-schemas";
import { forbidden } from "@/lib/errors";
import {
  createSupabaseManagedUser,
  deleteSupabaseManagedUser,
  listSupabaseUsersByIds,
  updateSupabaseManagedUserPassword,
} from "@/lib/supabase/admin";

type StaffActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type DivisionStaffAccount = {
  id: string;
  userId: string;
  email: string | null;
  name: string;
  role: "ADMIN" | "ASSISTANT";
  isActive: boolean;
  createdAt: string;
};

function revalidateDivisionStaffMutationViews() {
  revalidateTag("super-admin-overview");
  revalidatePath("/super-admin");
}

function serializeMockStaff(admin: MockAdminRecord): DivisionStaffAccount {
  return {
    id: admin.id,
    userId: admin.userId,
    email: admin.email,
    name: admin.name,
    role: admin.role as "ADMIN" | "ASSISTANT",
    isActive: admin.isActive,
    createdAt: admin.createdAt,
  };
}

function assertDivisionStaffMutationAllowed(
  actor: StaffActor,
  target: { id: string; role: string } | null,
  nextRole?: string,
) {
  if (actor.role === "SUPER_ADMIN") {
    return;
  }

  if (actor.role !== "ADMIN") {
    throw forbidden("직원 관리 권한이 없습니다.");
  }

  if (target?.id === actor.id) {
    throw forbidden("본인 계정은 직접 수정할 수 없습니다.");
  }

  if (target && target.role !== "ASSISTANT") {
    throw forbidden("관리자 계정은 최고관리자만 변경할 수 있습니다.");
  }

  if (nextRole && nextRole !== "ASSISTANT") {
    throw forbidden("일반 관리자는 조교 계정만 관리할 수 있습니다.");
  }
}

export async function listDivisionStaff(divisionId: string, divisionSlug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    return state.admins
      .filter((a) => a.divisionSlug === divisionSlug && (a.role === "ADMIN" || a.role === "ASSISTANT"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(serializeMockStaff);
  }

  const { prisma } = await import("@/lib/prisma");

  const admins = await prisma.admin.findMany({
    where: {
      divisionId,
      role: { in: ["ADMIN", "ASSISTANT"] },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const usersById = await listSupabaseUsersByIds(admins.map((a) => a.userId));

  return admins.map((admin) => ({
    id: admin.id,
    userId: admin.userId,
    email: usersById.get(admin.userId)?.email ?? null,
    name: admin.name,
    role: admin.role as "ADMIN" | "ASSISTANT",
    isActive: admin.isActive,
    createdAt: admin.createdAt.toISOString(),
  })) satisfies DivisionStaffAccount[];
}

export async function createDivisionStaff(
  divisionId: string,
  divisionSlug: string,
  input: StaffCreateInput,
  actor: StaffActor,
) {
  assertDivisionStaffMutationAllowed(actor, null, input.role);

  if (isMockMode()) {
    return updateMockState(async (state) => {
      if (state.admins.some((a) => a.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error("이미 사용 중인 이메일입니다.");
      }
      const timestamp = Date.now();
      const record: MockAdminRecord = {
        id: "mock-staff-" + timestamp,
        userId: "mock-staff-user-" + timestamp,
        email: input.email,
        name: input.name,
        role: input.role,
        divisionId,
        divisionSlug,
        isActive: input.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.admins = [...state.admins, record];
      return serializeMockStaff(record);
    });
  }

  const user = await createSupabaseManagedUser({
    email: input.email,
    password: input.password,
    name: input.name,
  });

  try {
    const { prisma } = await import("@/lib/prisma");

    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        name: input.name,
        role: input.role,
        divisionId,
        isActive: input.isActive ?? true,
      },
    });

    revalidateDivisionStaffMutationViews();
    return {
      id: admin.id,
      userId: admin.userId,
      email: input.email,
      name: admin.name,
      role: admin.role as "ADMIN" | "ASSISTANT",
      isActive: admin.isActive,
      createdAt: admin.createdAt.toISOString(),
    } satisfies DivisionStaffAccount;
  } catch (error) {
    await deleteSupabaseManagedUser(user.id).catch(() => undefined);
    throw error;
  }
}

export async function updateDivisionStaff(
  divisionId: string,
  staffId: string,
  input: StaffUpdateInput,
  actor: StaffActor,
) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const target = state.admins.find((a) => a.id === staffId && a.divisionId === divisionId);
      if (!target) throw new Error("직원 정보를 찾을 수 없습니다.");
      assertDivisionStaffMutationAllowed(actor, target, input.role);
      state.admins = state.admins.map((a) =>
        a.id === staffId
          ? { ...a, name: input.name, role: input.role, isActive: input.isActive, updatedAt: new Date().toISOString() }
          : a,
      );
      const refreshed = state.admins.find((a) => a.id === staffId) ?? target;
      return serializeMockStaff(refreshed);
    });
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.admin.findFirst({
    where: { id: staffId, divisionId, role: { in: ["ADMIN", "ASSISTANT"] } },
  });
  if (!existing) throw new Error("직원 정보를 찾을 수 없습니다.");
  assertDivisionStaffMutationAllowed(actor, existing, input.role);

  const admin = await prisma.admin.update({
    where: { id: staffId },
    data: { name: input.name, role: input.role, isActive: input.isActive },
  });

  const usersById = await listSupabaseUsersByIds([admin.userId]);
  revalidateDivisionStaffMutationViews();
  return {
    id: admin.id,
    userId: admin.userId,
    email: usersById.get(admin.userId)?.email ?? null,
    name: admin.name,
    role: admin.role as "ADMIN" | "ASSISTANT",
    isActive: admin.isActive,
    createdAt: admin.createdAt.toISOString(),
  } satisfies DivisionStaffAccount;
}

export async function deleteDivisionStaff(divisionId: string, staffId: string, actor: StaffActor) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const target = state.admins.find((a) => a.id === staffId && a.divisionId === divisionId);
      if (!target) throw new Error("직원 정보를 찾을 수 없습니다.");
      assertDivisionStaffMutationAllowed(actor, target);
      state.admins = state.admins.map((a) =>
        a.id === staffId ? { ...a, isActive: false, updatedAt: new Date().toISOString() } : a,
      );
      return { id: target.id, name: target.name };
    });
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.admin.findFirst({
    where: { id: staffId, divisionId, role: { in: ["ADMIN", "ASSISTANT"] } },
    select: { id: true, name: true, role: true },
  });
  if (!existing) throw new Error("직원 정보를 찾을 수 없습니다.");
  assertDivisionStaffMutationAllowed(actor, existing);

  await prisma.admin.update({ where: { id: staffId }, data: { isActive: false } });
  revalidateDivisionStaffMutationViews();
  return { id: existing.id, name: existing.name };
}

export async function permanentDeleteDivisionStaff(divisionId: string, staffId: string, actor: StaffActor) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const target = state.admins.find((a) => a.id === staffId && a.divisionId === divisionId);
      if (!target) throw new Error("직원 정보를 찾을 수 없습니다.");
      assertDivisionStaffMutationAllowed(actor, target);
      state.admins = state.admins.filter((a) => a.id !== staffId);
      return { id: target.id, name: target.name };
    });
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.admin.findFirst({
    where: { id: staffId, divisionId, role: { in: ["ADMIN", "ASSISTANT"] } },
    select: { id: true, name: true, userId: true, role: true },
  });
  if (!existing) throw new Error("직원 정보를 찾을 수 없습니다.");
  assertDivisionStaffMutationAllowed(actor, existing);

  await prisma.admin.delete({ where: { id: staffId } });
  await deleteSupabaseManagedUser(existing.userId).catch(() => undefined);
  revalidateDivisionStaffMutationViews();
  return { id: existing.id, name: existing.name };
}

export async function resetDivisionStaffPassword(
  divisionId: string,
  staffId: string,
  password: string,
  actor: StaffActor,
) {
  if (isMockMode()) {
    const state = await readMockState();
    const target = state.admins.find((a) => a.id === staffId && a.divisionId === divisionId);
    if (!target) throw new Error("직원 정보를 찾을 수 없습니다.");
    assertDivisionStaffMutationAllowed(actor, target);
    return { id: target.id, name: target.name };
  }

  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.admin.findFirst({
    where: { id: staffId, divisionId, role: { in: ["ADMIN", "ASSISTANT"] } },
    select: { id: true, name: true, userId: true, role: true },
  });
  if (!existing) throw new Error("직원 정보를 찾을 수 없습니다.");
  assertDivisionStaffMutationAllowed(actor, existing);

  await updateSupabaseManagedUserPassword(existing.userId, password);
  return { id: existing.id, name: existing.name };
}
