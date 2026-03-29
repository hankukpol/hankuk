import { ExamType } from "@prisma/client";
import { formatTuesdayWeekLabel, getTuesdayWeekKey } from "@/lib/analytics/week";
import { toAuditJson } from "@/lib/audit";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { generateWeeklyReportXlsx } from "@/lib/export/weekly-report";
import { getEnabledExamTypes } from "@/lib/periods/exam-types";
import { getPrisma } from "@/lib/prisma";

export const WEEKLY_REPORT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type WeeklyReportSurfaceScope = {
  examType: ExamType;
  examTypeLabel: string;
  weekKey: string;
  weekLabel: string;
};

export type WeeklyReportSurfaceState = {
  activePeriodId: number | null;
  activePeriodName: string | null;
  canGenerate: boolean;
  availableScopes: WeeklyReportSurfaceScope[];
  missingExamTypes: ExamType[];
  missingExamTypeLabels: string[];
  reason: string | null;
};

export type WeeklyReportSurfaceExpectationScope = {
  examType: ExamType;
  weekKey: string;
};

export type WeeklyReportSurfaceExpectation = {
  activePeriodId: number | null;
  availableScopes: WeeklyReportSurfaceExpectationScope[];
};

export type ActiveWeeklyReportDownloadResult =
  | {
      ok: true;
      report: NonNullable<Awaited<ReturnType<typeof generateWeeklyReportXlsx>>>;
    }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
      periodId?: number;
      periodName?: string;
    };

function endOfToday() {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExamType(value: unknown): value is ExamType {
  return value === ExamType.GONGCHAE || value === ExamType.GYEONGCHAE;
}

function isWeekKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildScopeKey(scope: { examType: ExamType; weekKey: string }) {
  return scope.examType + ":" + scope.weekKey;
}

function buildSurfaceChangedError() {
  return "활성 기간 또는 포함 범위가 변경되었습니다. 새로고침 후 다시 시도해 주세요.";
}

export function buildWeeklyReportContentDisposition(fileName: string) {
  return "attachment; filename*=UTF-8''" + encodeURIComponent(fileName);
}

export function parseWeeklyReportSurfaceExpectation(
  input: unknown,
):
  | {
      ok: true;
      value: WeeklyReportSurfaceExpectation;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "요청 정보가 올바르지 않습니다.",
    };
  }

  const activePeriodIdValue = input.activePeriodId;
  if (
    activePeriodIdValue !== null &&
    !(typeof activePeriodIdValue === "number" && Number.isInteger(activePeriodIdValue) && activePeriodIdValue > 0)
  ) {
    return {
      ok: false,
      error: "활성 기간 정보가 올바르지 않습니다.",
    };
  }

  const availableScopesValue = input.availableScopes;
  if (!Array.isArray(availableScopesValue)) {
    return {
      ok: false,
      error: "포함 범위 정보가 올바르지 않습니다.",
    };
  }

  const availableScopes: WeeklyReportSurfaceExpectationScope[] = [];
  for (const scope of availableScopesValue) {
    if (!isRecord(scope) || !isExamType(scope.examType) || !isWeekKey(scope.weekKey)) {
      return {
        ok: false,
        error: "포함 범위 정보가 올바르지 않습니다.",
      };
    }

    availableScopes.push({
      examType: scope.examType,
      weekKey: scope.weekKey,
    });
  }

  return {
    ok: true,
    value: {
      activePeriodId: activePeriodIdValue ?? null,
      availableScopes,
    },
  };
}

export function matchesWeeklyReportSurfaceExpectation(
  expected: WeeklyReportSurfaceExpectation,
  surface: WeeklyReportSurfaceState,
) {
  if (expected.activePeriodId !== surface.activePeriodId) {
    return false;
  }

  const expectedKeys = expected.availableScopes.map(buildScopeKey).sort();
  const actualKeys = surface.availableScopes.map(buildScopeKey).sort();
  if (expectedKeys.length !== actualKeys.length) {
    return false;
  }

  return expectedKeys.every((value, index) => value === actualKeys[index]);
}

export async function getActiveWeeklyReportSurfaceState(): Promise<WeeklyReportSurfaceState> {
  const activePeriod = await getPrisma().examPeriod.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      isGongchaeEnabled: true,
      isGyeongchaeEnabled: true,
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });

  if (!activePeriod) {
    return {
      activePeriodId: null,
      activePeriodName: null,
      canGenerate: false,
      availableScopes: [],
      missingExamTypes: [],
      missingExamTypeLabels: [],
      reason: "현재 활성 기간이 없습니다.",
    };
  }

  const enabledExamTypes = getEnabledExamTypes(activePeriod);
  if (enabledExamTypes.length === 0) {
    return {
      activePeriodId: activePeriod.id,
      activePeriodName: activePeriod.name,
      canGenerate: false,
      availableScopes: [],
      missingExamTypes: [],
      missingExamTypeLabels: [],
      reason: "활성 기간에 켜진 직렬이 없습니다.",
    };
  }

  const sessions = await getPrisma().examSession.findMany({
    where: {
      periodId: activePeriod.id,
      isCancelled: false,
      examType: {
        in: enabledExamTypes,
      },
      examDate: {
        lte: endOfToday(),
      },
    },
    select: {
      examType: true,
      examDate: true,
    },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
  });

  const latestWeekByExamType = new Map<ExamType, string>();
  for (const session of sessions) {
    if (latestWeekByExamType.has(session.examType)) {
      continue;
    }
    latestWeekByExamType.set(session.examType, getTuesdayWeekKey(session.examDate));
  }

  const availableScopes = enabledExamTypes.flatMap((examType) => {
    const weekKey = latestWeekByExamType.get(examType);
    if (!weekKey) {
      return [];
    }

    return [
      {
        examType,
        examTypeLabel: EXAM_TYPE_LABEL[examType],
        weekKey,
        weekLabel: formatTuesdayWeekLabel(weekKey),
      },
    ];
  });

  const missingExamTypes = enabledExamTypes.filter((examType) => !latestWeekByExamType.has(examType));

  return {
    activePeriodId: activePeriod.id,
    activePeriodName: activePeriod.name,
    canGenerate: availableScopes.length > 0,
    availableScopes,
    missingExamTypes,
    missingExamTypeLabels: missingExamTypes.map((examType) => EXAM_TYPE_LABEL[examType]),
    reason:
      availableScopes.length > 0
        ? null
        : "완료된 회차가 없어 아직 주간 리포트를 생성할 수 없습니다.",
  };
}

export async function generateActiveWeeklyReportDownload(
  expectedSurface?: WeeklyReportSurfaceExpectation,
): Promise<ActiveWeeklyReportDownloadResult> {
  const surface = await getActiveWeeklyReportSurfaceState();

  if (expectedSurface && !matchesWeeklyReportSurfaceExpectation(expectedSurface, surface)) {
    return {
      ok: false,
      status: 409,
      error: buildSurfaceChangedError(),
      periodId: surface.activePeriodId ?? undefined,
      periodName: surface.activePeriodName ?? undefined,
    };
  }

  if (!surface.activePeriodId || !surface.activePeriodName) {
    return {
      ok: false,
      status: 404,
      error: "현재 활성 기간이 없어 주간 리포트를 생성할 수 없습니다.",
    };
  }

  if (!surface.canGenerate) {
    return {
      ok: false,
      status: 409,
      error: surface.reason ?? "완료된 회차가 없어 주간 리포트를 생성할 수 없습니다.",
      periodId: surface.activePeriodId,
      periodName: surface.activePeriodName,
    };
  }

  const report = await generateWeeklyReportXlsx(surface.activePeriodId);
  if (!report) {
    return {
      ok: false,
      status: 409,
      error: "완료된 회차가 없어 주간 리포트를 생성할 수 없습니다.",
      periodId: surface.activePeriodId,
      periodName: surface.activePeriodName,
    };
  }

  return {
    ok: true,
    report,
  };
}

export type WeeklyReportExportPostAuth =
  | {
      ok: true;
      adminId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function handleWeeklyReportExportPost(input: {
  request: Request;
  auth: WeeklyReportExportPostAuth;
}) {
  if (!input.auth.ok) {
    return Response.json({ error: input.auth.error }, { status: input.auth.status });
  }

  const body = await input.request.json().catch(() => null);
  const parsed = parseWeeklyReportSurfaceExpectation(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  return handleWeeklyReportExportRequest({
    adminId: input.auth.adminId,
    ipAddress: input.request.headers.get("x-forwarded-for"),
    expectedSurface: parsed.value,
  });
}

export async function handleWeeklyReportExportRequest(input: {
  adminId: string;
  ipAddress?: string | null;
  expectedSurface: WeeklyReportSurfaceExpectation;
}) {
  const result = await generateActiveWeeklyReportDownload(input.expectedSurface);
  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        periodId: result.periodId,
        periodName: result.periodName,
      },
      { status: result.status },
    );
  }

  await getPrisma().auditLog.create({
    data: {
      adminId: input.adminId,
      action: "WEEKLY_REPORT_EXPORT",
      targetType: "ExamPeriod",
      targetId: String(result.report.periodId),
      before: toAuditJson(null),
      after: toAuditJson({
        fileName: result.report.fileName,
        generatedAt: result.report.generatedAt,
        periodId: result.report.periodId,
        periodName: result.report.periodName,
        scopes: result.report.scopes,
      }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return new Response(new Uint8Array(result.report.buffer), {
    status: 200,
    headers: {
      "Content-Type": WEEKLY_REPORT_CONTENT_TYPE,
      "Content-Disposition": buildWeeklyReportContentDisposition(result.report.fileName),
      "Cache-Control": "no-store",
      "X-Weekly-Report-Generated-At": result.report.generatedAt.toISOString(),
    },
  });
}
