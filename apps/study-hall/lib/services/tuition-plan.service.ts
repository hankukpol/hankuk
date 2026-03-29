import { revalidateTag, unstable_cache } from "next/cache";
import { isMockMode } from "@/lib/mock-data";
import { conflict, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockTuitionPlanRecord,
} from "@/lib/mock-store";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
} from "@/lib/service-helpers";
import { getDefaultTuitionPlanTemplates } from "@/lib/tuition-meta";

export type TuitionPlanItem = {
  id: string;
  divisionId: string;
  name: string;
  durationDays: number | null;
  amount: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TuitionPlanInput = {
  name: string;
  durationDays?: number | null;
  amount: number;
  description?: string | null;
  isActive?: boolean;
};

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializePlan(plan: {
  id: string;
  divisionId: string;
  name: string;
  durationDays: number | null;
  amount: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}) {
  return {
    id: plan.id,
    divisionId: plan.divisionId,
    name: plan.name,
    durationDays: plan.durationDays,
    amount: plan.amount,
    description: plan.description,
    isActive: plan.isActive,
    displayOrder: plan.displayOrder,
    createdAt: typeof plan.createdAt === "string" ? plan.createdAt : plan.createdAt.toISOString(),
    updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : plan.updatedAt.toISOString(),
  } satisfies TuitionPlanItem;
}

async function getDivisionOrThrow(divisionSlug: string) {
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
}

async function ensureDefaultTuitionPlans(divisionId: string, divisionSlug: string) {
  const prisma = await getPrismaClient();
  const existing = await prisma.tuitionPlan.findMany({
    where: {
      divisionId,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });

  if (existing.length > 0) {
    return existing;
  }

  await prisma.tuitionPlan.createMany({
    data: getDefaultTuitionPlanTemplates(divisionSlug).map((plan, index) => ({
      divisionId,
      name: plan.name,
      durationDays: plan.durationDays,
      amount: plan.amount,
      description: plan.description ?? null,
      isActive: true,
      displayOrder: index,
    })),
  });

  return prisma.tuitionPlan.findMany({
    where: {
      divisionId,
    },
    orderBy: {
      displayOrder: "asc",
    },
  });
}

async function listTuitionPlansUncached(
  divisionSlug: string,
  options?: { activeOnly?: boolean },
) {
  if (isMockMode()) {
    const state = await readMockState();
    return [...(state.tuitionPlansByDivision[divisionSlug] ?? [])]
      .filter((plan) => !options?.activeOnly || plan.isActive)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((plan) => serializePlan(plan));
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const plans = await ensureDefaultTuitionPlans(division.id, divisionSlug);

  return plans
    .filter((plan) => !options?.activeOnly || plan.isActive)
    .map((plan) => serializePlan(plan));
}

function listTuitionPlansCached(
  divisionSlug: string,
  options?: { activeOnly?: boolean },
) {
  const activeOnlyKey = options?.activeOnly ? "active" : "all";

  return unstable_cache(
    async () => listTuitionPlansUncached(divisionSlug, options),
    ["tuition-plans", divisionSlug, activeOnlyKey],
    {
      revalidate: 300,
      tags: [`tuition-plans:${divisionSlug}`],
    },
  )();
}

export async function listTuitionPlans(
  divisionSlug: string,
  options?: { activeOnly?: boolean },
) {
  if (isMockMode()) {
    return listTuitionPlansUncached(divisionSlug, options);
  }

  try {
    return await listTuitionPlansCached(divisionSlug, options);
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["tuition_plans", "tuition_plan_id"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("tuition-plans:list", error);
    return [];
  }
}

export async function getTuitionPlanById(divisionSlug: string, planId: string) {
  const plans = await listTuitionPlans(divisionSlug);
  return plans.find((plan) => plan.id === planId) ?? null;
}

export async function createTuitionPlan(divisionSlug: string, input: TuitionPlanInput) {
  const name = normalizeText(input.name);
  const description = normalizeOptionalText(input.description);
  const durationDays =
    typeof input.durationDays === "number" && Number.isFinite(input.durationDays)
      ? Math.max(1, Math.trunc(input.durationDays))
      : null;
  const amount = Math.max(0, Math.trunc(input.amount));
  const isActive = input.isActive ?? true;

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const division = state.divisions.find((item) => item.slug === divisionSlug);
      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }
      const current = state.tuitionPlansByDivision[divisionSlug] ?? [];
      if (current.some((plan) => plan.name === name)) {
        throw conflict("이미 같은 이름의 등록 플랜이 있습니다.");
      }
      const now = new Date().toISOString();
      const plan: MockTuitionPlanRecord = {
        id: "mock-tuition-plan-" + divisionSlug + "-" + Date.now(),
        divisionId: division.id,
        name,
        durationDays,
        amount,
        description,
        isActive,
        displayOrder: current.length,
        createdAt: now,
        updatedAt: now,
      };
      state.tuitionPlansByDivision[divisionSlug] = [...current, plan];
      return serializePlan(plan);
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const duplicate = await prisma.tuitionPlan.findFirst({
    where: {
      divisionId: division.id,
      name,
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 같은 이름의 등록 플랜이 있습니다.");
  }

  const displayOrder = await prisma.tuitionPlan.count({
    where: {
      divisionId: division.id,
    },
  });

  const plan = await prisma.tuitionPlan.create({
    data: {
      divisionId: division.id,
      name,
      durationDays,
      amount,
      description,
      isActive,
      displayOrder,
    },
  });

  revalidateTag(`tuition-plans:${divisionSlug}`);
  return serializePlan(plan);
}

export async function updateTuitionPlan(
  divisionSlug: string,
  planId: string,
  input: TuitionPlanInput,
) {
  const name = normalizeText(input.name);
  const description = normalizeOptionalText(input.description);
  const durationDays =
    typeof input.durationDays === "number" && Number.isFinite(input.durationDays)
      ? Math.max(1, Math.trunc(input.durationDays))
      : null;
  const amount = Math.max(0, Math.trunc(input.amount));
  const isActive = input.isActive ?? true;

  if (isMockMode()) {
    return updateMockState(async (state) => {
      const current = state.tuitionPlansByDivision[divisionSlug] ?? [];
      const target = current.find((plan) => plan.id === planId);
      if (!target) {
        throw notFound("등록 플랜을 찾을 수 없습니다.");
      }
      if (current.some((plan) => plan.id !== planId && plan.name === name)) {
        throw new Error("이미 같은 이름의 등록 플랜이 있습니다.");
      }
      const now = new Date().toISOString();
      state.tuitionPlansByDivision[divisionSlug] = current.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              name,
              durationDays,
              amount,
              description,
              isActive,
              updatedAt: now,
            }
          : plan,
      );
      return serializePlan(
        state.tuitionPlansByDivision[divisionSlug].find((plan) => plan.id === planId)!,
      );
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const target = await prisma.tuitionPlan.findFirst({
    where: {
      id: planId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    throw new Error("등록 플랜을 찾을 수 없습니다.");
  }

  const duplicate = await prisma.tuitionPlan.findFirst({
    where: {
      divisionId: division.id,
      name,
      id: {
        not: planId,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error("이미 같은 이름의 등록 플랜이 있습니다.");
  }

  const plan = await prisma.tuitionPlan.update({
    where: {
      id: planId,
    },
    data: {
      name,
      durationDays,
      amount,
      description,
      isActive,
    },
  });

  revalidateTag(`tuition-plans:${divisionSlug}`);
  return serializePlan(plan);
}

export async function deleteTuitionPlan(divisionSlug: string, planId: string) {
  if (isMockMode()) {
    return updateMockState(async (state) => {
      const current = state.tuitionPlansByDivision[divisionSlug] ?? [];
      const target = current.find((plan) => plan.id === planId);
      if (!target) {
        throw new Error("등록 플랜을 찾을 수 없습니다.");
      }
      state.tuitionPlansByDivision[divisionSlug] = current.filter((plan) => plan.id !== planId);
      state.studentsByDivision[divisionSlug] = (state.studentsByDivision[divisionSlug] ?? []).map((student) =>
        student.tuitionPlanId === planId
          ? {
              ...student,
              tuitionPlanId: null,
            }
          : student,
      );
      return { id: planId };
    });
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const prisma = await getPrismaClient();
  const target = await prisma.tuitionPlan.findFirst({
    where: {
      id: planId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    throw new Error("등록 플랜을 찾을 수 없습니다.");
  }

  await prisma.tuitionPlan.delete({
    where: {
      id: planId,
    },
  });

  revalidateTag(`tuition-plans:${divisionSlug}`);
  return { id: planId };
}
