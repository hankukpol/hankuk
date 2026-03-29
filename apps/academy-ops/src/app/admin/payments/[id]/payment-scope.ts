import type { Prisma } from "@prisma/client";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";

export async function getVisiblePaymentAcademyId() {
  const academyScope = await getAdminAcademyScope();
  return resolveVisibleAcademyId(academyScope);
}

export function buildScopedPaymentWhere(id: string, academyId: number | null): Prisma.PaymentWhereInput {
  return academyId === null ? { id } : { id, academyId };
}

export function buildScopedEnrollmentWhere(
  id: string,
  academyId: number | null,
): Prisma.CourseEnrollmentWhereInput {
  return academyId === null ? { id } : { id, academyId };
}

export function buildScopedEnrollmentListWhere(
  academyId: number | null,
): Prisma.CourseEnrollmentWhereInput | undefined {
  return academyId === null ? undefined : { academyId };
}
