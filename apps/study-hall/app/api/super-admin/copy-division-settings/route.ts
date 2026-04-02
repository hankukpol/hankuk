import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import { supportsPointCategoryCustomization } from "@/lib/services/point.service";
import { getDivisionSettings } from "@/lib/services/settings.service";

type SourcePointRuleRow = {
  category: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
};

function assertLegacyPointCategory(category: string) {
  if (!/^[A-Z_]+$/.test(category)) {
    throw new Error(`지원하지 않는 상벌점 카테고리 값입니다: ${category}`);
  }

  return category;
}

function revalidateCopiedDivisionSettings(targetSlug: string) {
  revalidateTag(`periods:${targetSlug}`);
  revalidateTag(`division-settings:${targetSlug}`);
  revalidateDivisionOperationalViews(targetSlug);
  revalidatePath(`/${targetSlug}/admin/points`);
  revalidatePath(`/${targetSlug}/admin/points/rules`);
}

/**
 * POST /api/super-admin/copy-division-settings
 * body: { sourceSlug: string; targetSlug: string }
 *
 * 복사 항목:
 * - periods (교시 설정)
 * - point_rules (상벌점 규칙)
 * - division_settings (경고 임계값, 외출 한도 등)
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const sourceSlug = body?.sourceSlug?.trim();
  const targetSlug = body?.targetSlug?.trim();

  if (!sourceSlug || !targetSlug) {
    return NextResponse.json({ error: "sourceSlug와 targetSlug를 입력해주세요." }, { status: 400 });
  }

  if (sourceSlug === targetSlug) {
    return NextResponse.json({ error: "복사 원본과 대상이 동일합니다." }, { status: 400 });
  }

  try {
    if (isMockMode()) {
      const state = await readMockState();
      const sourcePeriods = state.periodsByDivision?.[sourceSlug] ?? [];
      const sourceRules = state.pointRulesByDivision?.[sourceSlug] ?? [];
      const sourceSettings = state.divisionSettingsByDivision?.[sourceSlug] ?? null;

      await updateMockState((s) => {
        // 교시 복사
        s.periodsByDivision = s.periodsByDivision ?? {};
        s.periodsByDivision[targetSlug] = sourcePeriods.map((p) => ({
          ...p,
          id: `${p.id}_copy_${Date.now()}`,
          divisionId: targetSlug,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        // 상벌점 규칙 복사
        s.pointRulesByDivision = s.pointRulesByDivision ?? {};
        s.pointRulesByDivision[targetSlug] = sourceRules.map((r) => ({
          ...r,
          id: `${r.id}_copy_${Date.now()}`,
          divisionId: targetSlug,
          createdAt: new Date().toISOString(),
        }));

        if (sourceSettings) {
          s.divisionSettingsByDivision[targetSlug] = {
            ...sourceSettings,
            divisionId: s.divisions.find((division) => division.slug === targetSlug)?.id ?? sourceSettings.divisionId,
            updatedAt: new Date().toISOString(),
          };
        }

        return s;
      });

      return NextResponse.json({
        ok: true,
        periodsCount: sourcePeriods.length,
        rulesCount: sourceRules.length,
      });
    }

    const { prisma } = await import("@/lib/prisma");

    // 원본/대상 직렬 조회
    const [sourceDivision, targetDivision] = await Promise.all([
      prisma.division.findUnique({ where: { slug: sourceSlug } }),
      prisma.division.findUnique({ where: { slug: targetSlug } }),
    ]);

    if (!sourceDivision) {
      return NextResponse.json({ error: `원본 직렬(${sourceSlug})을 찾을 수 없습니다.` }, { status: 404 });
    }
    if (!targetDivision) {
      return NextResponse.json({ error: `대상 직렬(${targetSlug})을 찾을 수 없습니다.` }, { status: 404 });
    }

    // 원본 데이터 조회
    const [sourcePeriods, sourceRules, sourceSettingsRow, categoryCustomizationEnabled, pointRuleCategoryColumn] = await Promise.all([
      prisma.period.findMany({ where: { divisionId: sourceDivision.id } }),
      prisma.$queryRaw<SourcePointRuleRow[]>`
        SELECT
          category::text AS category,
          name,
          points,
          description,
          is_active AS "isActive",
          display_order AS "displayOrder"
        FROM point_rules
        WHERE division_id = ${sourceDivision.id}
        ORDER BY display_order ASC
      `,
      prisma.divisionSettings.findUnique({
        where: { divisionId: sourceDivision.id },
        select: { divisionId: true },
      }),
      supportsPointCategoryCustomization(),
      prisma.$queryRaw<Array<{ udtName: string }>>`
        SELECT udt_name AS "udtName"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'point_rules'
          AND column_name = 'category'
        LIMIT 1
      `,
    ]);
    const sourceSettings = sourceSettingsRow
      ? await getDivisionSettings(sourceSlug)
      : null;
    const isLegacyPointRuleCategory =
      (pointRuleCategoryColumn[0]?.udtName ?? "text") !== "text";

    // 대상 직렬 기존 데이터에 연결된 레코드가 있으면 삭제 차단
    const [targetAttendanceCount, targetPointRecordCount] = await Promise.all([
      prisma.attendance.count({
        where: { period: { divisionId: targetDivision.id } },
      }),
      prisma.pointRecord.count({
        where: { rule: { divisionId: targetDivision.id } },
      }),
    ]);

    if (targetAttendanceCount > 0) {
      return NextResponse.json(
        { error: `대상 직렬(${targetSlug})에 출결 기록이 ${targetAttendanceCount}건 존재합니다. 기존 교시를 덮어쓰면 출결 데이터가 유실됩니다.` },
        { status: 409 },
      );
    }

    if (targetPointRecordCount > 0) {
      return NextResponse.json(
        { error: `대상 직렬(${targetSlug})에 상벌점 기록이 ${targetPointRecordCount}건 존재합니다. 기존 규칙을 덮어쓰면 상벌점 데이터가 유실됩니다.` },
        { status: 409 },
      );
    }

    // 대상 직렬 기존 데이터 초기화 후 복사
    await prisma.$transaction(async (tx) => {
      // 교시 삭제 후 재생성
      await tx.period.deleteMany({ where: { divisionId: targetDivision.id } });
      if (sourcePeriods.length > 0) {
        await tx.period.createMany({
          data: sourcePeriods.map((p) => ({
            divisionId: targetDivision.id,
            name: p.name,
            label: p.label,
            displayOrder: p.displayOrder,
            startTime: p.startTime,
            endTime: p.endTime,
            isMandatory: p.isMandatory,
            isActive: p.isActive,
          })),
        });
      }

      // 상벌점 규칙 삭제 후 재생성
      await tx.pointRule.deleteMany({ where: { divisionId: targetDivision.id } });
      if (sourceRules.length > 0) {
        if (isLegacyPointRuleCategory) {
          for (const rule of sourceRules) {
            const legacyCategory = assertLegacyPointCategory(rule.category);

            await tx.$executeRawUnsafe(
              `
                INSERT INTO point_rules (
                  division_id,
                  category,
                  name,
                  points,
                  description,
                  is_active,
                  display_order
                ) VALUES (
                  $1,
                  '${legacyCategory}',
                  $2,
                  $3,
                  $4,
                  $5,
                  $6
                )
              `,
              targetDivision.id,
              rule.name,
              rule.points,
              rule.description,
              rule.isActive,
              rule.displayOrder,
            );
          }
        } else {
          await tx.pointRule.createMany({
            data: sourceRules.map((r) => ({
              divisionId: targetDivision.id,
              category: r.category,
              name: r.name,
              points: r.points,
              description: r.description,
              isActive: r.isActive,
              displayOrder: r.displayOrder,
            })),
          });
        }
      }

      // 운영 설정 복사 (upsert)
      if (sourceSettings) {
        const divisionSettingsData = {
          warnLevel1: sourceSettings.warnLevel1,
          warnLevel2: sourceSettings.warnLevel2,
          warnInterview: sourceSettings.warnInterview,
          warnWithdraw: sourceSettings.warnWithdraw,
          tardyMinutes: sourceSettings.tardyMinutes,
          holidayLimit: sourceSettings.holidayLimit,
          halfDayLimit: sourceSettings.halfDayLimit,
          healthLimit: sourceSettings.healthLimit,
          holidayUnusedPts: sourceSettings.holidayUnusedPts,
          halfDayUnusedPts: sourceSettings.halfDayUnusedPts,
          perfectAttendancePtsEnabled: sourceSettings.perfectAttendancePtsEnabled,
          perfectAttendancePts: sourceSettings.perfectAttendancePts,
          operatingDays: sourceSettings.operatingDays as never,
          studyTracks: sourceSettings.studyTracks as never,
          ...(categoryCustomizationEnabled
            ? { pointCategories: sourceSettings.pointCategories as never }
            : {}),
        };

        await tx.divisionSettings.upsert({
          where: { divisionId: targetDivision.id },
          update: divisionSettingsData,
          create: {
            divisionId: targetDivision.id,
            ...divisionSettingsData,
          },
        });
      }
    });

    revalidateCopiedDivisionSettings(targetSlug);

    return NextResponse.json({
      ok: true,
      periodsCount: sourcePeriods.length,
      rulesCount: sourceRules.length,
      settingsCopied: !!sourceSettings,
    });
  } catch (error) {
    return toApiErrorResponse(error, "직렬 설정 복사에 실패했습니다.");
  }
}
