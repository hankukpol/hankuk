import { cache } from "react";
import { managementPolicySchema, isPolicyEffective, kstDate, kstMonthBounds, separatePointTotals, type ManagementPolicy } from "@/lib/management-policy";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { getPrismaClient } from "@/lib/service-helpers";
import { badRequest, notFound } from "@/lib/errors";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";

export const getManagementPolicy = cache(async (divisionSlug: string): Promise<ManagementPolicy | null> => {
  // This rollout is deliberately limited to one division; no inherited defaults.
  if (divisionSlug !== "police") return null;
  let value: unknown;
  if (isMockMode()) {
    const state = await readMockState();
    value = (state.divisionSettingsByDivision[divisionSlug] as unknown as { managementPolicy?: unknown })?.managementPolicy;
  } else {
    const prisma = await getPrismaClient();
    const rows = await prisma.$queryRaw<{ policy: unknown }[]>`
      SELECT to_jsonb(s)->'management_policy' AS policy
      FROM study_hall.division_settings s JOIN study_hall.divisions d ON d.id = s.division_id
      WHERE d.slug = ${divisionSlug}`;
    value = rows[0]?.policy;
  }
  if (value == null) return null;
  const parsed = managementPolicySchema.safeParse(value);
  if (!parsed.success) throw new Error("관리규정 설정 형식이 올바르지 않습니다. 관리자에게 확인해 주세요.");
  return parsed.data;
});

export async function getPolicyPointTotals(divisionSlug: string, range?: { dateFrom: string; dateTo: string }) {
  const policy = await getManagementPolicy(divisionSlug);
  if (!isPolicyEffective(policy, kstDate()) || !policy.separateMeritDemerit) return null;
  const bounds = range ?? kstMonthBounds();
  if (isMockMode()) {
    const state = await readMockState();
    return separatePointTotals(state.pointRecordsByDivision[divisionSlug] ?? [], bounds.dateFrom, bounds.dateTo);
  }
  const prisma = await getPrismaClient();
  const end = new Date(`${bounds.dateTo}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const rows = await prisma.pointRecord.findMany({
    where: { student: { division: { slug: divisionSlug } }, date: { gte: new Date(`${bounds.dateFrom}T00:00:00Z`), lt: end } },
    select: { studentId: true, points: true, date: true },
  });
  return separatePointTotals(rows, bounds.dateFrom, bounds.dateTo);
}

export async function getPolicyHolidayUsage(divisionSlug: string, dateFrom: string, dateTo: string) {
  const used = new Map<string, number>();
  if (!(await getManagementPolicy(divisionSlug))) return used;
  if (isMockMode()) {
    const state = await readMockState();
    for (const r of state.leavePermissionsByDivision[divisionSlug] ?? []) if (r.type === "HOLIDAY" && r.status !== "REJECTED" && r.date >= dateFrom && r.date <= dateTo) used.set(r.studentId, (used.get(r.studentId) ?? 0) + 1);
  } else {
    const prisma = await getPrismaClient();
    const rows = await prisma.leavePermission.groupBy({ by: ["studentId"], where: { student: { division: { slug: divisionSlug } }, type: "HOLIDAY", status: { not: "REJECTED" }, date: { gte: new Date(`${dateFrom}T00:00:00Z`), lte: new Date(`${dateTo}T00:00:00Z`) } }, _count: true });
    for (const r of rows) used.set(r.studentId, r._count);
  }
  return used;
}

export async function saveOptionalEnrollment(divisionSlug: string, input: ManagementPolicy["optionalEnrollments"][number]) {
  const policy = await getManagementPolicy(divisionSlug);
  if (!policy) throw notFound("적용된 관리규정이 없습니다.");
  const parsed = managementPolicySchema.shape.optionalEnrollments.element.parse(input);
  if (!parsed.weekdays.length) throw badRequest("적용 요일을 선택해 주세요.");
  if (parsed.dateFrom > parsed.dateTo) throw badRequest("종료일은 시작일보다 빠를 수 없습니다.");
  if (!policy.controlledPeriods.some((p) => p.periodId === parsed.periodId && p.optional && parsed.weekdays.every((d) => p.weekdays.includes(d)))) throw badRequest("선택자습 교시와 운영 요일을 확인해 주세요.");
  if (parsed.dateFrom < kstDate()) throw badRequest("선택자습 신청은 오늘 이후부터 적용할 수 있습니다. 과거 출결은 변경하지 않습니다.");
  if (isMockMode()) {
    await updateMockState((state) => {
      if (!(state.studentsByDivision[divisionSlug] ?? []).some((s) => s.id === parsed.studentId)) throw notFound("해당 직렬 학생이 아닙니다.");
      const settings = state.divisionSettingsByDivision[divisionSlug] as unknown as { managementPolicy: ManagementPolicy };
      if (settings.managementPolicy.optionalEnrollments.some((e) => enrollmentOverlaps(e, parsed))) throw badRequest("해당 학생의 신청 기간이 겹칩니다. 기존 신청을 확인해 주세요.");
      settings.managementPolicy = { ...settings.managementPolicy, optionalEnrollments: [...settings.managementPolicy.optionalEnrollments, parsed] };
    });
  } else {
    const prisma = await getPrismaClient();
    const affected = await prisma.$executeRaw`
      UPDATE study_hall.division_settings s
      SET management_policy = jsonb_set(s.management_policy, '{optionalEnrollments}',
        COALESCE(s.management_policy->'optionalEnrollments', '[]'::jsonb) || ${JSON.stringify([parsed])}::jsonb), updated_at = now()
      FROM study_hall.divisions d
      WHERE d.id = s.division_id AND d.slug = ${divisionSlug}
        AND s.management_policy IS NOT NULL
        AND EXISTS (SELECT 1 FROM study_hall.students st WHERE st.id = ${parsed.studentId} AND st.division_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.management_policy->'optionalEnrollments') e
          WHERE e->>'studentId' = ${parsed.studentId} AND e->>'periodId' = ${parsed.periodId}
          AND e->>'dateFrom' <= ${parsed.dateTo} AND e->>'dateTo' >= ${parsed.dateFrom}
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(e->'weekdays') day WHERE ${JSON.stringify(parsed.weekdays)}::jsonb @> jsonb_build_array(day)))`;
    if (affected !== 1) throw badRequest("해당 직렬 학생·관리규정 또는 겹치는 신청을 확인해 주세요.");
  }
  revalidateDivisionOperationalViews(divisionSlug);
}

function enrollmentOverlaps(a: ManagementPolicy["optionalEnrollments"][number], b: ManagementPolicy["optionalEnrollments"][number]) {
  return a.studentId === b.studentId && a.periodId === b.periodId && a.dateFrom <= b.dateTo && a.dateTo >= b.dateFrom && a.weekdays.some((d) => b.weekdays.includes(d));
}

/** End an enrollment from tomorrow. Today and historical enforcement remain stable. */
export async function endOptionalEnrollment(divisionSlug: string, input: ManagementPolicy["optionalEnrollments"][number]) {
  const policy = await getManagementPolicy(divisionSlug);
  if (!policy) throw notFound("적용된 관리규정이 없습니다.");
  const parsed = managementPolicySchema.shape.optionalEnrollments.element.parse(input);
  const today = kstDate();
  const matches = (e: ManagementPolicy["optionalEnrollments"][number]) => e.studentId === parsed.studentId && e.periodId === parsed.periodId && e.dateFrom === parsed.dateFrom && e.dateTo === parsed.dateTo
    && e.weekdays.every((day) => parsed.weekdays.includes(day)) && parsed.weekdays.every((day) => e.weekdays.includes(day));
  if (isMockMode()) {
    await updateMockState((state) => {
      const settings = state.divisionSettingsByDivision[divisionSlug] as unknown as { managementPolicy: ManagementPolicy };
      settings.managementPolicy.optionalEnrollments = settings.managementPolicy.optionalEnrollments.flatMap((e) => !matches(e) || e.dateTo <= today ? [e] : e.dateFrom > today ? [] : [{ ...e, dateTo: today }]);
    });
  } else {
    const prisma = await getPrismaClient();
    await prisma.$executeRaw`
      UPDATE study_hall.division_settings s SET management_policy = jsonb_set(s.management_policy, '{optionalEnrollments}',
        COALESCE((SELECT jsonb_agg(CASE WHEN e->>'studentId' = ${parsed.studentId} AND e->>'periodId' = ${parsed.periodId}
          AND e->>'dateFrom' = ${parsed.dateFrom} AND e->>'dateTo' = ${parsed.dateTo} AND e->>'dateTo' > ${today}
          AND e->'weekdays' @> ${JSON.stringify(parsed.weekdays)}::jsonb AND e->'weekdays' <@ ${JSON.stringify(parsed.weekdays)}::jsonb
          THEN jsonb_set(e, '{dateTo}', to_jsonb(${today}::text)) ELSE e END)
        FROM jsonb_array_elements(s.management_policy->'optionalEnrollments') e
        WHERE NOT (e->>'studentId' = ${parsed.studentId} AND e->>'periodId' = ${parsed.periodId}
          AND e->>'dateFrom' = ${parsed.dateFrom} AND e->>'dateTo' = ${parsed.dateTo} AND e->>'dateFrom' > ${today}
          AND e->'weekdays' @> ${JSON.stringify(parsed.weekdays)}::jsonb AND e->'weekdays' <@ ${JSON.stringify(parsed.weekdays)}::jsonb)), '[]'::jsonb)), updated_at = now()
      FROM study_hall.divisions d WHERE d.id = s.division_id AND d.slug = ${divisionSlug}`;
  }
  revalidateDivisionOperationalViews(divisionSlug);
}
