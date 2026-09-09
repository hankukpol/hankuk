import type { Prisma } from "@prisma/client";

import { isMockMode } from "@/lib/mock-data";
import {
  readMockState,
  updateMockState,
  type MockDivisionSettingsHistoryRecord,
} from "@/lib/mock-store";
import { getDivisionBySlugOrThrow, getPrismaClient } from "@/lib/service-helpers";
import type { DivisionRuleSettings } from "@/lib/services/settings.service";

export type SettingsChangeEntry = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
};

export type SettingsHistoryItem = {
  id: string;
  section: string;
  changes: SettingsChangeEntry[];
  changedByName: string;
  changedAt: string;
};

type SettingsHistoryActor = {
  id: string;
  name: string;
};

/**
 * 이력 화면에 그대로 노출할 한글 이름. 여기 없는 필드는 이력에 남기지 않는다
 * (내부 전용 값이 목록을 어지럽히지 않도록 화이트리스트로 관리).
 */
export const RULE_SETTING_FIELD_LABELS: Record<string, string> = {
  tardyMinutes: "지각 기준(분)",
  assistantPastEditAllowed: "조교 과거 출결 수정 허용",
  assistantPastEditDays: "조교 과거 출결 수정 허용 일수",
  warnLevel1: "1차 경고 기준",
  warnLevel2: "2차 경고 기준",
  warnInterview: "면담 기준",
  warnWithdraw: "퇴원 기준",
  holidayLimit: "외출권 한도",
  halfDayLimit: "반휴권 한도",
  healthLimit: "병가권 한도",
  holidayUnusedPts: "외출권 미사용 상점",
  halfDayUnusedPts: "반휴권 미사용 상점",
  warnMsgLevel1: "1차 경고 문자 템플릿",
  warnMsgLevel2: "2차 경고 문자 템플릿",
  warnMsgInterview: "면담 문자 템플릿",
  warnMsgWithdraw: "퇴원 문자 템플릿",
  tardyPointRuleId: "지각 자동 벌점 규칙",
  absentPointRuleId: "결석 자동 벌점 규칙",
  perfectAttendancePtsEnabled: "개근 상점 사용",
  perfectAttendancePts: "개근 상점 점수",
  expirationWarningDays: "수강 만료 알림 일수",
};

function isSameValue(before: unknown, after: unknown) {
  // null 과 빈 문자열은 "값 없음"으로 같게 본다 (규칙 미선택 셀렉트 등).
  const normalize = (value: unknown) => (value === "" ? null : value);
  return normalize(before) === normalize(after);
}

export function diffRuleSettings(
  before: DivisionRuleSettings,
  after: DivisionRuleSettings,
): SettingsChangeEntry[] {
  const changes: SettingsChangeEntry[] = [];

  for (const [field, label] of Object.entries(RULE_SETTING_FIELD_LABELS)) {
    const beforeValue = (before as Record<string, unknown>)[field];
    const afterValue = (after as Record<string, unknown>)[field];

    if (!isSameValue(beforeValue, afterValue)) {
      changes.push({ field, label, before: beforeValue ?? null, after: afterValue ?? null });
    }
  }

  return changes;
}

export async function listDivisionSettingsHistory(
  divisionSlug: string,
  options?: { limit?: number },
): Promise<SettingsHistoryItem[]> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 100);

  if (isMockMode()) {
    const state = await readMockState();

    return (state.divisionSettingsHistoryByDivision[divisionSlug] ?? [])
      .slice()
      .sort((left, right) => right.changedAt.localeCompare(left.changedAt))
      .slice(0, limit)
      .map((record) => ({
        id: record.id,
        section: record.section,
        changes: record.changes,
        changedByName: record.changedByName,
        changedAt: record.changedAt,
      }));
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const rows = await prisma.divisionSettingsHistory.findMany({
    where: { divisionId: division.id },
    orderBy: { changedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    changes: (row.changes ?? []) as SettingsChangeEntry[],
    changedByName: row.changedByName,
    changedAt: row.changedAt.toISOString(),
  }));
}

/**
 * 변경 이력 기록. 이력 저장이 실패해도 설정 저장 자체는 이미 끝났으므로
 * 예외를 밖으로 던지지 않고 로그만 남긴다 (기록 누락 < 저장 실패).
 */
export async function recordDivisionSettingsChange(
  divisionSlug: string,
  actor: SettingsHistoryActor | null,
  changes: SettingsChangeEntry[],
  section = "RULES",
) {
  if (!changes.length) {
    return;
  }

  const changedByName = actor?.name ?? "알 수 없음";
  const changedAt = new Date();

  try {
    if (isMockMode()) {
      await updateMockState((state) => {
        const division = state.divisions.find((item) => item.slug === divisionSlug);

        if (!division) {
          return;
        }

        const record: MockDivisionSettingsHistoryRecord = {
          id: `mock-settings-history-${divisionSlug}-${Date.now()}`,
          divisionId: division.id,
          section,
          changes,
          changedById: actor?.id ?? null,
          changedByName,
          changedAt: changedAt.toISOString(),
        };

        state.divisionSettingsHistoryByDivision[divisionSlug] = [
          record,
          ...(state.divisionSettingsHistoryByDivision[divisionSlug] ?? []),
        ];
      });

      return;
    }

    const division = await getDivisionBySlugOrThrow(divisionSlug);
    const prisma = await getPrismaClient();

    await prisma.divisionSettingsHistory.create({
      data: {
        divisionId: division.id,
        section,
        // Prisma 의 JSON 입력 타입은 배열 리터럴을 직접 받지 않는다.
        changes: changes as unknown as Prisma.InputJsonValue,
        changedById: actor?.id ?? null,
        changedByName,
        changedAt,
      },
    });
  } catch (error) {
    console.warn("[settings-history] 변경 이력 기록에 실패했습니다.", {
      divisionSlug,
      section,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
