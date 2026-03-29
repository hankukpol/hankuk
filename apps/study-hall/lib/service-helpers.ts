import { cache } from "react";
import { Prisma } from "@prisma/client/index";

import { notFound } from "@/lib/errors";

export async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const PRISMA_SCHEMA_MISMATCH_CODES = new Set(["P2021", "P2022"]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isPrismaSchemaMismatchError(error: unknown, expectedPatterns: string[] = []) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    PRISMA_SCHEMA_MISMATCH_CODES.has(error.code)
  ) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();

  if (expectedPatterns.some((pattern) => message.includes(pattern.toLowerCase()))) {
    return true;
  }

  return (
    message.includes("does not exist in the current database") ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  );
}

export function logSchemaCompatibilityFallback(scope: string, error: unknown) {
  console.warn(`[schema-compat] ${scope}`, {
    message: getErrorMessage(error),
  });
}

export const getDivisionBySlugOrThrow = cache(async function getDivisionBySlugOrThrow(
  divisionSlug: string,
) {
  const prisma = await getPrismaClient();
  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
});
