import { Prisma } from "@prisma/client";
import {
  getAdminAcademyScope,
  requireVisibleAcademyId,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";

export async function resolveVisibleScoreSessionAcademyId() {
  const scope = await getAdminAcademyScope();
  return resolveVisibleAcademyId(scope);
}

export async function requireVisibleScoreSessionWriteAcademyId() {
  const scope = await getAdminAcademyScope();
  return requireVisibleAcademyId(scope);
}

export function applyScoreSessionAcademyScope(
  where: Prisma.ExamSessionWhereInput,
  academyId: number | null,
): Prisma.ExamSessionWhereInput {
  if (academyId === null) {
    return where;
  }

  return {
    AND: [where, { period: { academyId } }],
  };
}