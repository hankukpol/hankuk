import { cache } from "react";
import { AdminRole, Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAcademyById,
  listAccessibleAcademiesForAdmin,
  resolveAcademyByHostname,
  resolveActiveAcademyIdForAdmin,
} from "@/lib/academy";
import { getSetupState, isLocalMockMode } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const AUTH_USER_ID_HEADER = "x-morning-auth-user-id";
const AUTH_USER_EMAIL_HEADER = "x-morning-auth-user-email";
const ADMIN_CONTEXT_QUERY_RETRY_DELAY_MS = 75;
const ADMIN_CONTEXT_QUERY_COUNT = 2;
const DEFAULT_LOCAL_ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_LOCAL_ADMIN_EMAIL = "local-admin@morningmock.local";

const LOCAL_ROLE_LEVEL: Record<AdminRole, number> = {
  VIEWER: 0,
  TEACHER: 1,
  COUNSELOR: 2,
  ACADEMIC_ADMIN: 3,
  MANAGER: 4,
  DEPUTY_DIRECTOR: 5,
  DIRECTOR: 6,
  SUPER_ADMIN: 7,
};

type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export function roleAtLeast(role: AdminRole, minimum: AdminRole) {
  return LOCAL_ROLE_LEVEL[role] >= LOCAL_ROLE_LEVEL[minimum];
}

function isRetryableAdminContextError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1017"
  );
}

async function findAdminUserWithRetry(id: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getPrisma().adminUser.findUnique({
        where: { id },
      });
    } catch (error) {
      if (attempt >= ADMIN_CONTEXT_QUERY_COUNT || !isRetryableAdminContextError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, ADMIN_CONTEXT_QUERY_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

function readVerifiedAuthUserFromHeaders(): AuthenticatedUser | null {
  const headerStore = headers();
  const id = headerStore.get(AUTH_USER_ID_HEADER);

  if (!id) {
    return null;
  }

  const email = headerStore.get(AUTH_USER_EMAIL_HEADER);

  return {
    id,
    email: email?.trim() ? email : null,
  };
}

function getLocalMockAuthUser(): AuthenticatedUser {
  return {
    id: process.env.LOCAL_DEV_ADMIN_ID?.trim() || DEFAULT_LOCAL_ADMIN_ID,
    email: process.env.LOCAL_DEV_ADMIN_EMAIL?.trim() || DEFAULT_LOCAL_ADMIN_EMAIL,
  };
}

export const getCurrentAuthUser = cache(async () => {
  if (isLocalMockMode()) {
    return getLocalMockAuthUser();
  }

  const setup = getSetupState();

  if (!setup.supabaseReady || !setup.databaseReady) {
    return null;
  }

  const headerUser = readVerifiedAuthUserFromHeaders();

  if (headerUser) {
    return headerUser;
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  } satisfies AuthenticatedUser;
});

export const getCurrentAdminContext = cache(async () => {
  const user = await getCurrentAuthUser();

  if (!user) {
    return null;
  }

  const adminUser = await findAdminUserWithRetry(user.id);

  if (!adminUser || !adminUser.isActive) {
    return null;
  }

  const isSuperAdmin = adminUser.role === AdminRole.SUPER_ADMIN;
  const activeAcademyId = await resolveActiveAcademyIdForAdmin(adminUser);
  const accessibleAcademies = await listAccessibleAcademiesForAdmin(adminUser);
  const activeAcademy =
    activeAcademyId === null
      ? null
      : accessibleAcademies.find((academy) => academy.id === activeAcademyId) ??
        (await getAcademyById(activeAcademyId));

  if (!isSuperAdmin) {
    const assignedAcademyId = adminUser.academyId ?? (await resolveAcademyByHostname());
    const assignedAcademy = assignedAcademyId
      ? (accessibleAcademies.find((academy) => academy.id === assignedAcademyId) ?? null)
      : null;

    if (!assignedAcademy || !activeAcademy || activeAcademy.id !== assignedAcademy.id || !activeAcademy.isActive) {
      return null;
    }
  }

  return {
    authUser: user,
    adminUser,
    academyId: adminUser.academyId ?? null,
    isSuperAdmin,
    activeAcademyId,
    activeAcademy,
    accessibleAcademies,
  };
});

export async function requireAdminContext(minRole: AdminRole = AdminRole.VIEWER) {
  const context = await getCurrentAdminContext();

  if (!context) {
    redirect("/login?error=unauthorized");
  }

  if (!roleAtLeast(context.adminUser.role, minRole)) {
    redirect("/admin?error=forbidden");
  }

  return context;
}
