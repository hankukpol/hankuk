import { Prisma } from "@prisma/client";
import { resolveAcademyByHostname } from "@/lib/academy";
import { getCurrentAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function getAcademySettingsByAcademyId(academyId?: number | null) {
  const resolvedAcademyId =
    academyId === undefined ? await resolveAcademyByHostname() : academyId;

  if (resolvedAcademyId === null) {
    return null;
  }

  return getPrisma().academySettings.findUnique({
    where: { academyId: resolvedAcademyId },
  });
}

export async function getActiveAcademySettings() {
  const context = await getCurrentAdminContext();
  if (context?.activeAcademyId === null) {
    return null;
  }

  return getAcademySettingsByAcademyId(
    context?.activeAcademyId ?? context?.academyId ?? null,
  );
}

export async function upsertAcademySettingsByAcademyId(
  academyId: number,
  data: Prisma.AcademySettingsUncheckedUpdateInput,
) {
  const { academyId: _ignoredAcademyId, ...createData } =
    data as Prisma.AcademySettingsUncheckedCreateInput;

  return getPrisma().academySettings.upsert({
    where: { academyId },
    update: data,
    create: {
      ...createData,
      academyId,
    },
  });
}
