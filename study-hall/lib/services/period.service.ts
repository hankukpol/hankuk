import { cache } from "react";

import { revalidateTag, unstable_cache } from "next/cache";
import { readMockState, type MockPeriodRecord, updateMockState } from "@/lib/mock-store";
import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";

export type PeriodRecord = {
  id: string;
  divisionId: string;
  name: string;
  label: string | null;
  displayOrder: number;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type PeriodInput = {
  name: string;
  label?: string | null;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
};

function sortPeriods<T extends { displayOrder: number }>(periods: T[]) {
  return [...periods].sort((left, right) => left.displayOrder - right.displayOrder);
}

function reindexMockPeriods(periods: MockPeriodRecord[]) {
  return sortPeriods(periods).map((period, index) => ({
    ...period,
    displayOrder: index,
    updatedAt: new Date().toISOString(),
  }));
}

async function getDivisionOrThrow(divisionSlug: string) {
  const { prisma } = await import("@/lib/prisma");

  const division = await prisma.division.findUnique({
    where: { slug: divisionSlug },
  });

  if (!division) {
    throw new Error(`Division not found for slug: ${divisionSlug}`);
  }

  return division;
}

async function reorderDivisionPeriodsInDb(divisionId: string, orderedIds: string[]) {
  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.period.update({
        where: { id },
        data: { displayOrder: index + 1000 },
      }),
    ),
  );

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.period.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );

  return prisma.period.findMany({
    where: { divisionId },
    orderBy: { displayOrder: "asc" },
  });
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

async function getPeriodsUncached(divisionSlug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    return sortPeriods(state.periodsByDivision[divisionSlug] ?? []);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  return prisma.period.findMany({
    where: { divisionId: division.id },
    orderBy: { displayOrder: "asc" },
  });
}

function getPeriodsCached(divisionSlug: string) {
  return unstable_cache(
    async () => getPeriodsUncached(divisionSlug),
    ["periods", divisionSlug],
    {
      revalidate: 300,
      tags: [`periods:${divisionSlug}`],
    },
  )();
}

export const getPeriods = cache(async function getPeriods(divisionSlug: string) {
  return isMockMode() ? getPeriodsUncached(divisionSlug) : getPeriodsCached(divisionSlug);
});

export async function createPeriod(divisionSlug: string, input: PeriodInput) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division = getMockDivisionBySlug(divisionSlug);
      if (!division) {
        throw new Error(`Mock division not found for slug: ${divisionSlug}`);
      }
      const periods = state.periodsByDivision[divisionSlug] ?? [];
      const nextPeriod: MockPeriodRecord = {
        id: `mock-period-${divisionSlug}-${Date.now()}`,
        divisionId: division.id,
        name: input.name,
        label: input.label?.trim() ? input.label.trim() : null,
        displayOrder: periods.length,
        startTime: input.startTime,
        endTime: input.endTime,
        isMandatory: input.isMandatory,
        isActive: input.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.periodsByDivision[divisionSlug] = reindexMockPeriods([...periods, nextPeriod]);
      return state.periodsByDivision[divisionSlug].find((period) => period.id === nextPeriod.id) ?? nextPeriod;
    });
  }


  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");
  const count = await prisma.period.count({ where: { divisionId: division.id } });

  const createdPeriod = await prisma.period.create({
    data: {
      divisionId: division.id,
      name: input.name,
      label: input.label?.trim() ? input.label.trim() : null,
      displayOrder: count,
      startTime: input.startTime,
      endTime: input.endTime,
      isMandatory: input.isMandatory,
      isActive: input.isActive,
    },
  });

  revalidateTag(`periods:${divisionSlug}`);
  return createdPeriod;
}

export async function updatePeriod(
  divisionSlug: string,
  periodId: string,
  input: Partial<PeriodInput> & { reorderIds?: string[] },
) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const periods = state.periodsByDivision[divisionSlug] ?? [];
      if (input.reorderIds?.length) {
        const reordered = input.reorderIds
          .map((id) => periods.find((period) => period.id === id))
          .filter(Boolean) as MockPeriodRecord[];
        state.periodsByDivision[divisionSlug] = reindexMockPeriods(reordered);
        return state.periodsByDivision[divisionSlug];
      }
      state.periodsByDivision[divisionSlug] = periods.map((period) =>
        period.id === periodId
          ? {
              ...period,
              name: input.name ?? period.name,
              label: input.label === undefined ? period.label : input.label?.trim() ? input.label.trim() : null,
              startTime: input.startTime ?? period.startTime,
              endTime: input.endTime ?? period.endTime,
              isMandatory: input.isMandatory ?? period.isMandatory,
              isActive: input.isActive ?? period.isActive,
              updatedAt: new Date().toISOString(),
            }
          : period,
      );
      return state.periodsByDivision[divisionSlug].find((period) => period.id === periodId) ?? null;
    });
  }


  const division = await getDivisionOrThrow(divisionSlug);

  if (input.reorderIds?.length) {
    const reorderedPeriods = await reorderDivisionPeriodsInDb(division.id, input.reorderIds);
    revalidateTag(`periods:${divisionSlug}`);
    return reorderedPeriods;
  }

  const { prisma } = await import("@/lib/prisma");
  const period = await prisma.period.findFirst({
    where: {
      id: periodId,
      divisionId: division.id,
    },
  });

  if (!period) {
    throw new Error("Period not found.");
  }

  const updatedPeriod = await prisma.period.update({
    where: { id: periodId },
    data: {
      name: input.name ?? undefined,
      label:
        input.label === undefined
          ? undefined
          : input.label?.trim()
            ? input.label.trim()
            : null,
      startTime: input.startTime ?? undefined,
      endTime: input.endTime ?? undefined,
      isMandatory: input.isMandatory ?? undefined,
      isActive: input.isActive ?? undefined,
    },
  });

  revalidateTag(`periods:${divisionSlug}`);
  return updatedPeriod;
}

export async function deletePeriod(divisionSlug: string, periodId: string) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const periods = state.periodsByDivision[divisionSlug] ?? [];
      state.periodsByDivision[divisionSlug] = reindexMockPeriods(
        periods.filter((period) => period.id !== periodId),
      );
      return state.periodsByDivision[divisionSlug];
    });
  }


  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");
  const period = await prisma.period.findFirst({
    where: {
      id: periodId,
      divisionId: division.id,
    },
    select: { id: true },
  });

  if (!period) {
    throw new Error("Period not found.");
  }

  // 출결 기록이 존재하면 삭제 차단 (CASCADE로 출결 데이터 유실 방지)
  const attendanceCount = await prisma.attendance.count({
    where: { periodId },
  });
  if (attendanceCount > 0) {
    throw new Error(
      `이 교시에 출결 기록이 ${attendanceCount}건 존재합니다. 출결 데이터가 함께 삭제되므로 교시를 삭제할 수 없습니다. 대신 비활성화해 주세요.`,
    );
  }

  // 핸드폰 제출 기록이 존재하면 삭제 차단
  const phoneSubmissionCount = await prisma.phoneSubmission.count({
    where: { periodId },
  });
  if (phoneSubmissionCount > 0) {
    throw new Error(
      `이 교시에 핸드폰 제출 기록이 ${phoneSubmissionCount}건 존재합니다. 교시를 삭제할 수 없습니다. 대신 비활성화해 주세요.`,
    );
  }

  await prisma.period.delete({
    where: { id: periodId },
  });

  const remaining = await prisma.period.findMany({
    where: { divisionId: division.id },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });

  const reorderedPeriods = await reorderDivisionPeriodsInDb(
    division.id,
    remaining.map((item) => item.id),
  );

  revalidateTag(`periods:${divisionSlug}`);
  return reorderedPeriods;
}

export async function getCurrentPeriod(divisionSlug: string, now = new Date()) {
  const periods = await getPeriods(divisionSlug);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return periods.find((period) => {
    if (!period.isActive) {
      return false;
    }

    const start = timeToMinutes(period.startTime);
    const end = timeToMinutes(period.endTime) + 5;

    return currentMinutes >= start && currentMinutes <= end;
  }) ?? null;
}
