import { Prisma } from "@prisma/client";

export function normalizeDiscountCode(value: string) {
  return value.trim().toUpperCase();
}

export function applyDiscountCodeAcademyScope(
  where: Prisma.DiscountCodeWhereInput,
  academyId: number | null,
): Prisma.DiscountCodeWhereInput {
  if (academyId === null) {
    return where;
  }

  return {
    ...where,
    academyId,
  };
}

export function applyDiscountCodeUsageAcademyScope(
  where: Prisma.DiscountCodeUsageWhereInput,
  academyId: number | null,
): Prisma.DiscountCodeUsageWhereInput {
  if (academyId === null) {
    return where;
  }

  const andConditions = where.AND
    ? Array.isArray(where.AND)
      ? where.AND
      : [where.AND]
    : [];

  return {
    ...where,
    AND: [...andConditions, { code: { is: { academyId } } }],
  };
}