import { isMockMode } from "@/lib/mock-data";
import { kstDate } from "@/lib/management-policy";
import { getPointAggregationInfo } from "@/lib/point-aggregation-mode";
import {
  readMockState,
  updateMockState,
  type MockWarningNoticeRecord,
} from "@/lib/mock-store";
import { getManagementPolicy } from "@/lib/services/management-policy.service";
import { getDivisionSettings } from "@/lib/services/settings.service";
import { getPrismaClient, getDivisionBySlugOrThrow } from "@/lib/service-helpers";
import { revalidateDivisionOperationalViews } from "@/lib/revalidation";
import type { InterviewResultTypeValue } from "@/lib/interview-meta";
import type { WarningNoticeChannelValue } from "@/lib/warning-notice-meta";
import type { WarningNoticeSchemaInput } from "@/lib/warning-notice-schemas";
import { notFound } from "@/lib/errors";

type WarningNoticeActor = {
  id: string;
  name: string;
};

export type WarningThresholdSnapshot = {
  warnLevel1: number;
  warnLevel2: number;
  warnInterview: number;
  warnWithdraw: number;
};

export type WarningNoticeItem = {
  id: string;
  studentId: string;
  stage: InterviewResultTypeValue;
  demeritPoints: number;
  thresholdSnapshot: WarningThresholdSnapshot;
  aggregationMode: string;
  channel: WarningNoticeChannelValue;
  noticeBody: string | null;
  memo: string | null;
  noticedAt: string;
  noticedByName: string;
};

function toIsoString(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function normalizeSnapshot(value: unknown): WarningThresholdSnapshot {
  const source = (value ?? {}) as Partial<WarningThresholdSnapshot>;

  return {
    warnLevel1: Number(source.warnLevel1 ?? 0),
    warnLevel2: Number(source.warnLevel2 ?? 0),
    warnInterview: Number(source.warnInterview ?? 0),
    warnWithdraw: Number(source.warnWithdraw ?? 0),
  };
}

function serializeNotice(record: {
  id: string;
  studentId: string;
  stage: InterviewResultTypeValue;
  demeritPoints: number;
  thresholdSnapshot: unknown;
  aggregationMode: string;
  channel: WarningNoticeChannelValue;
  noticeBody: string | null;
  memo: string | null;
  noticedAt: Date | string;
  noticedByName: string;
}): WarningNoticeItem {
  return {
    id: record.id,
    studentId: record.studentId,
    stage: record.stage,
    demeritPoints: record.demeritPoints,
    thresholdSnapshot: normalizeSnapshot(record.thresholdSnapshot),
    aggregationMode: record.aggregationMode,
    channel: record.channel,
    noticeBody: record.noticeBody,
    memo: record.memo,
    noticedAt: toIsoString(record.noticedAt),
    noticedByName: record.noticedByName,
  };
}

export async function listWarningNotices(
  divisionSlug: string,
  options?: { studentId?: string; limit?: number },
): Promise<WarningNoticeItem[]> {
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000);

  if (isMockMode()) {
    const state = await readMockState();

    return (state.warningNoticesByDivision[divisionSlug] ?? [])
      .filter((record) => !options?.studentId || record.studentId === options.studentId)
      .sort((left, right) => right.noticedAt.localeCompare(left.noticedAt))
      .slice(0, limit)
      .map(serializeNotice);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const notices = await prisma.warningNotice.findMany({
    where: {
      divisionId: division.id,
      ...(options?.studentId ? { studentId: options.studentId } : {}),
    },
    orderBy: { noticedAt: "desc" },
    take: limit,
  });

  return notices.map(serializeNotice);
}

/**
 * 학생·단계별 가장 최근 안내 한 건만 남긴 조회용 인덱스.
 * 경고 대상자 목록에서 "이 단계는 이미 안내했는가"를 판단하는 데 쓴다.
 */
export function indexLatestNoticeByStudentStage(notices: WarningNoticeItem[]) {
  const latest = new Map<string, WarningNoticeItem>();

  // listWarningNotices 는 최신순이므로 처음 만난 항목이 곧 최신이다.
  for (const notice of notices) {
    const key = `${notice.studentId}:${notice.stage}`;

    if (!latest.has(key)) {
      latest.set(key, notice);
    }
  }

  return latest;
}

export async function createWarningNotice(
  divisionSlug: string,
  actor: WarningNoticeActor,
  input: WarningNoticeSchemaInput,
): Promise<WarningNoticeItem> {
  // 대상 학생의 현재 벌점·기준·집계 방식을 안내 시점 스냅샷으로 고정한다.
  // 나중에 기준이 바뀌어도 "당시 몇 점으로 무엇을 통보했는지"가 남는다.
  const { listWarningStudents } = await import("@/lib/services/point.service");
  const [settings, policy, warningStudents] = await Promise.all([
    getDivisionSettings(divisionSlug),
    getManagementPolicy(divisionSlug),
    listWarningStudents(divisionSlug),
  ]);

  const target = warningStudents.find((student) => student.id === input.studentId);

  if (!target) {
    throw notFound("경고 대상자 목록에서 학생을 찾을 수 없습니다.");
  }

  const thresholdSnapshot: WarningThresholdSnapshot = {
    warnLevel1: settings.warnLevel1,
    warnLevel2: settings.warnLevel2,
    warnInterview: settings.warnInterview,
    warnWithdraw: settings.warnWithdraw,
  };
  const aggregationMode = getPointAggregationInfo(policy, kstDate()).mode;
  const noticeBody = input.noticeBody?.trim() || null;
  const memo = input.memo?.trim() || null;
  const noticedAt = new Date();

  if (isMockMode()) {
    const record = await updateMockState((state) => {
      const division = state.divisions.find((item) => item.slug === divisionSlug);

      if (!division) {
        throw notFound("지점 정보를 찾을 수 없습니다.");
      }

      const nextRecord: MockWarningNoticeRecord = {
        id: `mock-warning-notice-${divisionSlug}-${Date.now()}`,
        divisionId: division.id,
        studentId: input.studentId,
        stage: input.stage,
        demeritPoints: target.netPoints,
        thresholdSnapshot,
        aggregationMode,
        channel: input.channel,
        noticeBody,
        memo,
        noticedAt: noticedAt.toISOString(),
        noticedById: actor.id,
        noticedByName: actor.name,
        createdAt: noticedAt.toISOString(),
      };

      state.warningNoticesByDivision[divisionSlug] = [
        nextRecord,
        ...(state.warningNoticesByDivision[divisionSlug] ?? []),
      ];

      return nextRecord;
    });

    revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
    return serializeNotice(record);
  }

  const division = await getDivisionBySlugOrThrow(divisionSlug);
  const prisma = await getPrismaClient();

  const notice = await prisma.warningNotice.create({
    data: {
      divisionId: division.id,
      studentId: input.studentId,
      stage: input.stage,
      demeritPoints: target.netPoints,
      thresholdSnapshot,
      aggregationMode,
      channel: input.channel,
      noticeBody,
      memo,
      noticedAt,
      noticedById: actor.id,
      noticedByName: actor.name,
    },
  });

  revalidateDivisionOperationalViews(divisionSlug, { studentId: input.studentId });
  return serializeNotice(notice);
}
