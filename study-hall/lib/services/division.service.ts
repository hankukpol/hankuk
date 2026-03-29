import { unstable_cache } from "next/cache";

import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { readMockState } from "@/lib/mock-store";

const getActiveDivisionsCached = unstable_cache(
  async () => {
    const { prisma } = await import("@/lib/prisma");

    return prisma.division.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    });
  },
  ["division-service", "active-divisions"],
  { revalidate: 300, tags: ["divisions"] },
);

const getAllDivisionsCached = unstable_cache(
  async () => {
    const { prisma } = await import("@/lib/prisma");

    return prisma.division.findMany({
      orderBy: { displayOrder: "asc" },
    });
  },
  ["division-service", "all-divisions"],
  { revalidate: 300, tags: ["divisions"] },
);

const getDivisionBySlugCached = unstable_cache(
  async (slug: string) => {
    const { prisma } = await import("@/lib/prisma");

    return prisma.division.findUnique({
      where: { slug },
    });
  },
  ["division-service", "division-by-slug"],
  { revalidate: 300, tags: ["divisions"] },
);

export async function getDivisions(options?: { includeInactive?: boolean }) {
  if (isMockMode()) {
    const state = await readMockState();
    const divisions = state.divisions ?? [];

    return options?.includeInactive
      ? divisions
      : divisions.filter((division) => division.isActive);
  }

  return options?.includeInactive ? getAllDivisionsCached() : getActiveDivisionsCached();
}

export async function getDivisionBySlug(slug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    return state.divisions.find((division) => division.slug === slug) ?? getMockDivisionBySlug(slug);
  }

  return getDivisionBySlugCached(slug);
}
