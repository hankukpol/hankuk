import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  AdminRole,
  AttendType,
  ExamType,
  Prisma,
  ScoreSource,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
import { GET as getWeeklyReportRoute } from "../src/app/api/cron/weekly-report/route";
import { authorizeCronRequest } from "../src/lib/cron";
import { generateWeeklyReportXlsx } from "../src/lib/export/weekly-report";
import {
  buildWeeklyReportContentDisposition,
  generateActiveWeeklyReportDownload,
  getActiveWeeklyReportSurfaceState,
  handleWeeklyReportExportPost,
  handleWeeklyReportExportRequest,
  parseWeeklyReportSurfaceExpectation,
  WEEKLY_REPORT_CONTENT_TYPE,
} from "../src/lib/export/weekly-report-archive";
import { getPrisma } from "../src/lib/prisma";

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function isRetryableDbError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Error &&
      /Can't reach database server|Server has closed the connection|Connection terminated/i.test(
        error.message,
      ))
  );
}

async function withDbRetry<T>(operation: () => Promise<T>, attempts = 3) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts - 1 || !isRetryableDbError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}

async function safeDbCleanup(operation: () => Promise<unknown>) {
  try {
    await withDbRetry(operation, 5);
  } catch (error) {
    console.error("[verify-weekly-report] cleanup failed:", error);
  }
}

function asDate(value: string) {
  return new Date(`${value}T09:00:00+09:00`);
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const examNumberA = `VERIFYWR${stamp}A`;
  const examNumberB = `VERIFYWR${stamp}B`;
  const examNumberC = `VERIFYWR${stamp}C`;
  const tempWorkbookPath = path.join(process.cwd(), `tmp-verify-weekly-report-${stamp}.xlsx`);
  const originalCronSecret = process.env.CRON_SECRET;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let adminId: string | null = null;
  let createdAdminId: string | null = null;

  delete process.env.CRON_SECRET;
  assert.deepEqual(authorizeCronRequest(new Request("https://example.com/api/cron/weekly-report")), {
    ok: false,
    status: 503,
    error: "CRON_SECRET is not configured.",
  });

  process.env.CRON_SECRET = "verify-weekly-report-secret";
  assert.equal(
    authorizeCronRequest(
      new Request("https://example.com/api/cron/weekly-report", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    ).ok,
    false,
  );
  assert.deepEqual(
    authorizeCronRequest(
      new Request("https://example.com/api/cron/weekly-report", {
        headers: { authorization: "Bearer verify-weekly-report-secret" },
      }),
    ),
    { ok: true },
  );

  const period = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: `Verify Weekly Report ${stamp}`,
        startDate: asDate("2099-01-06"),
        endDate: asDate("2099-02-10"),
        totalWeeks: 6,
        isActive: true,
        isGongchaeEnabled: true,
        isGyeongchaeEnabled: true,
      },
      select: { id: true, name: true },
    }),
  );

  const [
    previousGongchaeSession,
    currentGongchaeMainSession,
    currentGongchaeOxSession,
    previousGyeongchaeSession,
    currentGyeongchaeSession,
  ] = await Promise.all([
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 1,
          subject: Subject.CONSTITUTIONAL_LAW,
          examDate: asDate("2026-03-03"),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 2,
          subject: Subject.CRIMINAL_LAW,
          examDate: asDate("2026-03-10"),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GONGCHAE,
          week: 2,
          subject: Subject.POLICE_SCIENCE,
          examDate: asDate("2026-03-10"),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GYEONGCHAE,
          week: 1,
          subject: Subject.CRIMINOLOGY,
          examDate: asDate("2026-03-04"),
        },
        select: { id: true },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: period.id,
          examType: ExamType.GYEONGCHAE,
          week: 2,
          subject: Subject.CRIMINAL_PROCEDURE,
          examDate: asDate("2026-03-11"),
        },
        select: { id: true },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: examNumberA,
          name: "Verify Weekly Alpha",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: false,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: examNumberB,
          name: "Verify Weekly Beta",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.NEW,
          isActive: true,
          notificationConsent: false,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: examNumberC,
          name: "Verify Weekly Gamma",
          examType: ExamType.GYEONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: false,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberA,
          sessionId: previousGongchaeSession.id,
          rawScore: 70,
          finalScore: 70,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.MANUAL_INPUT,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberB,
          sessionId: previousGongchaeSession.id,
          rawScore: 80,
          finalScore: 80,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.MANUAL_INPUT,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberA,
          sessionId: currentGongchaeMainSession.id,
          rawScore: 82,
          finalScore: 82,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.OFFLINE_UPLOAD,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberA,
          sessionId: currentGongchaeOxSession.id,
          oxScore: 8,
          finalScore: 8,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.OFFLINE_UPLOAD,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberB,
          sessionId: currentGongchaeMainSession.id,
          rawScore: 88,
          finalScore: 88,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.PASTE_INPUT,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberB,
          sessionId: currentGongchaeOxSession.id,
          oxScore: 9,
          finalScore: 9,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.PASTE_INPUT,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberC,
          sessionId: previousGyeongchaeSession.id,
          rawScore: 76,
          finalScore: 76,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.MANUAL_INPUT,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: examNumberC,
          sessionId: currentGyeongchaeSession.id,
          rawScore: 91,
          finalScore: 91,
          attendType: AttendType.NORMAL,
          sourceType: ScoreSource.ONLINE_UPLOAD,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberA,
          examType: ExamType.GONGCHAE,
          weekKey: "2026-03-03",
          weekStartDate: asDate("2026-03-03"),
          weekEndDate: asDate("2026-03-09"),
          weekAbsenceCount: 0,
          monthAbsenceCount: 0,
          status: StudentStatus.NORMAL,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberB,
          examType: ExamType.GONGCHAE,
          weekKey: "2026-03-03",
          weekStartDate: asDate("2026-03-03"),
          weekEndDate: asDate("2026-03-09"),
          weekAbsenceCount: 0,
          monthAbsenceCount: 0,
          status: StudentStatus.NORMAL,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberA,
          examType: ExamType.GONGCHAE,
          weekKey: "2026-03-10",
          weekStartDate: asDate("2026-03-10"),
          weekEndDate: asDate("2026-03-16"),
          weekAbsenceCount: 1,
          monthAbsenceCount: 1,
          status: StudentStatus.WARNING_1,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberB,
          examType: ExamType.GONGCHAE,
          weekKey: "2026-03-10",
          weekStartDate: asDate("2026-03-10"),
          weekEndDate: asDate("2026-03-16"),
          weekAbsenceCount: 0,
          monthAbsenceCount: 0,
          status: StudentStatus.NORMAL,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberC,
          examType: ExamType.GYEONGCHAE,
          weekKey: "2026-03-03",
          weekStartDate: asDate("2026-03-03"),
          weekEndDate: asDate("2026-03-09"),
          weekAbsenceCount: 0,
          monthAbsenceCount: 0,
          status: StudentStatus.NORMAL,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: period.id,
          examNumber: examNumberC,
          examType: ExamType.GYEONGCHAE,
          weekKey: "2026-03-10",
          weekStartDate: asDate("2026-03-10"),
          weekEndDate: asDate("2026-03-16"),
          weekAbsenceCount: 2,
          monthAbsenceCount: 2,
          status: StudentStatus.WARNING_2,
        },
      }),
    ),
  ]);

  try {
    const existingAdmin = await withDbRetry(() =>
      prisma.adminUser.findFirst({
        select: { id: true },
      }),
    );
    adminId = existingAdmin?.id ?? null;

    if (!adminId) {
      const createdAdmin = await withDbRetry(() =>
        prisma.adminUser.create({
          data: {
            id: randomUUID(),
            email: `verify-weekly-report-${stamp}@example.com`,
            name: "Verify Weekly Report Admin",
            role: AdminRole.TEACHER,
          },
          select: { id: true },
        }),
      );
      adminId = createdAdmin.id;
      createdAdminId = createdAdmin.id;
    }

    const exportRouteSource = readFileSync(
      path.join(process.cwd(), "src/app/api/export/weekly-report/route.ts"),
      "utf8",
    );
    assert.match(exportRouteSource, /requireApiAdmin\(AdminRole\.TEACHER\)/);

    const exportPageSource = readFileSync(
      path.join(process.cwd(), "src/app/admin/export/page.tsx"),
      "utf8",
    );
    assert.match(
      exportPageSource,
      /canGenerateWeeklyReport\s*\?\s*await getActiveWeeklyReportSurfaceState\(\)\s*:\s*null/,
    );

    const exportPanelSource = readFileSync(
      path.join(process.cwd(), "src/components/export/weekly-report-archive-panel.tsx"),
      "utf8",
    );
    assert.match(exportPanelSource, /body:\s*JSON\.stringify\(/);
    assert.match(exportPanelSource, /activePeriodId:\s*surface\.activePeriodId/);

    const surface = await withDbRetry(() => getActiveWeeklyReportSurfaceState());
    assert.equal(surface.activePeriodId, period.id);
    assert.equal(surface.activePeriodName, period.name);
    assert.equal(surface.canGenerate, true);
    assert.deepEqual(
      surface.availableScopes.map((scope) => [scope.examType, scope.weekKey]),
      [
        [ExamType.GONGCHAE, "2026-03-10"],
        [ExamType.GYEONGCHAE, "2026-03-10"],
      ],
    );
    assert.deepEqual(surface.missingExamTypes, []);

    assert.equal(parseWeeklyReportSurfaceExpectation(null).ok, false);
    const parsedSurface = parseWeeklyReportSurfaceExpectation({
      activePeriodId: surface.activePeriodId,
      availableScopes: surface.availableScopes.map((scope) => ({
        examType: scope.examType,
        weekKey: scope.weekKey,
      })),
    });
    if (!parsedSurface.ok) {
      throw new Error("Failed to parse expected weekly-report surface.");
    }
    assert.equal(parsedSurface.ok, true);
    const expectedSurface = parsedSurface.value;

    const activeDownload = await withDbRetry(() =>
      generateActiveWeeklyReportDownload(expectedSurface),
    );
    if (!activeDownload.ok) {
      throw new Error(activeDownload.error);
    }
    assert.equal(activeDownload.ok, true);
    const activeReport = activeDownload.report;
    assert.equal(activeReport.periodId, period.id);
    assert.equal(activeReport.fileName.endsWith(".xlsx"), true);
    assert.equal(
      buildWeeklyReportContentDisposition(activeReport.fileName),
      "attachment; filename*=UTF-8''" + encodeURIComponent(activeReport.fileName),
    );
    assert.equal(WEEKLY_REPORT_CONTENT_TYPE.includes("spreadsheetml.sheet"), true);

    const mismatchedDownload = await withDbRetry(() =>
      generateActiveWeeklyReportDownload({
        activePeriodId: expectedSurface.activePeriodId,
        availableScopes: [
          {
            examType: ExamType.GONGCHAE,
            weekKey: "1999-01-05",
          },
        ],
      }),
    );
    assert.equal(mismatchedDownload.ok, false);
    if (mismatchedDownload.ok) {
      throw new Error("Expected mismatched surface download to fail.");
    }
    assert.equal(mismatchedDownload.status, 409);
    const unauthorizedPostResponse = await handleWeeklyReportExportPost({
      request: new Request("https://example.com/api/export/weekly-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expectedSurface),
      }),
      auth: {
        ok: false,
        status: 403,
        error: "forbidden",
      },
    });
    assert.equal(unauthorizedPostResponse.status, 403);

    const malformedPostResponse = await handleWeeklyReportExportPost({
      request: new Request("https://example.com/api/export/weekly-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      auth: {
        ok: true,
        adminId: adminId!,
      },
    });
    assert.equal(malformedPostResponse.status, 400);

    const invalidBodyPostResponse = await handleWeeklyReportExportPost({
      request: new Request("https://example.com/api/export/weekly-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activePeriodId: "bad", availableScopes: [] }),
      }),
      auth: {
        ok: true,
        adminId: adminId!,
      },
    });
    assert.equal(invalidBodyPostResponse.status, 400);

    const manualExportResponse = await handleWeeklyReportExportPost({
      request: new Request("https://example.com/api/export/weekly-report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify(expectedSurface),
      }),
      auth: {
        ok: true,
        adminId: adminId!,
      },
    });
    assert.equal(manualExportResponse.status, 200);
    assert.equal(
      manualExportResponse.headers.get("content-type"),
      WEEKLY_REPORT_CONTENT_TYPE,
    );
    assert.match(
      manualExportResponse.headers.get("content-disposition") ?? "",
      /attachment; filename\*=UTF-8''/,
    );
    assert.ok((await manualExportResponse.arrayBuffer()).byteLength > 0);

    const auditLog = await withDbRetry(() =>
      prisma.auditLog.findFirst({
        where: {
          adminId: adminId!,
          action: "WEEKLY_REPORT_EXPORT",
          targetId: String(period.id),
        },
        orderBy: { createdAt: "desc" },
        select: {
          adminId: true,
          action: true,
          targetId: true,
          ipAddress: true,
          after: true,
        },
      }),
    );
    assert.ok(auditLog);
    assert.equal(auditLog?.adminId, adminId);
    assert.equal(auditLog?.action, "WEEKLY_REPORT_EXPORT");
    assert.equal(auditLog?.targetId, String(period.id));
    assert.equal(auditLog?.ipAddress, "127.0.0.1");
    const auditAfterJson = JSON.stringify(auditLog?.after ?? {});
    assert.ok(auditAfterJson.includes(activeReport.fileName));
    assert.ok(auditAfterJson.includes("GONGCHAE"));
    assert.ok(auditAfterJson.includes("GYEONGCHAE"));

    const emptyPeriod = await withDbRetry(() =>
      prisma.examPeriod.create({
        data: {
          name: `Verify Weekly Empty ${stamp}`,
          startDate: asDate("2100-01-06"),
          endDate: asDate("2100-02-10"),
          totalWeeks: 6,
          isActive: true,
          isGongchaeEnabled: true,
          isGyeongchaeEnabled: true,
        },
        select: { id: true, name: true },
      }),
    );

    const staleSurfaceResponse = await handleWeeklyReportExportRequest({
      adminId: adminId!,
      ipAddress: "127.0.0.1",
      expectedSurface,
    });
    assert.equal(staleSurfaceResponse.status, 409);
    const staleSurfaceBody = (await staleSurfaceResponse.json()) as {
      error?: string;
      periodId?: number;
    };
    assert.ok((staleSurfaceBody.error ?? "").length > 0);
    assert.equal(staleSurfaceBody.periodId, emptyPeriod.id);

    const emptySurface = await withDbRetry(() => getActiveWeeklyReportSurfaceState());
    assert.equal(emptySurface.activePeriodId, emptyPeriod.id);
    assert.equal(emptySurface.canGenerate, false);
    assert.ok((emptySurface.reason ?? "").length > 0);

    const parsedEmptySurface = parseWeeklyReportSurfaceExpectation({
      activePeriodId: emptySurface.activePeriodId,
      availableScopes: emptySurface.availableScopes.map((scope) => ({
        examType: scope.examType,
        weekKey: scope.weekKey,
      })),
    });
    if (!parsedEmptySurface.ok) {
      throw new Error("Failed to parse empty weekly-report surface.");
    }
    assert.equal(parsedEmptySurface.ok, true);

    const emptyResponse = await handleWeeklyReportExportRequest({
      adminId: adminId!,
      ipAddress: "127.0.0.1",
      expectedSurface: parsedEmptySurface.value,
    });
    assert.equal(emptyResponse.status, 409);
    const emptyBody = (await emptyResponse.json()) as {
      error?: string;
      periodId?: number;
    };
    assert.ok((emptyBody.error ?? "").length > 0);
    assert.equal(emptyBody.periodId, emptyPeriod.id);

    await safeDbCleanup(() =>
      prisma.examPeriod.delete({
        where: { id: emptyPeriod.id },
      }),
    );

    const report = await withDbRetry(() => generateWeeklyReportXlsx(period.id));
    assert.ok(report);
    assert.equal(report?.periodId, period.id);
    assert.equal(report?.periodName, period.name);
    assert.equal(report?.scopes.length, 2);
    assert.ok((report?.buffer.length ?? 0) > 0);

    assert.deepEqual(
      report?.scopes.map((scope) => scope.examType),
      [ExamType.GONGCHAE, ExamType.GYEONGCHAE],
    );

    const gongchaeScope = report?.scopes.find((scope) => scope.examType === ExamType.GONGCHAE);
    const gyeongchaeScope = report?.scopes.find((scope) => scope.examType === ExamType.GYEONGCHAE);
    assert.ok(gongchaeScope);
    assert.ok(gyeongchaeScope);
    assert.equal(gongchaeScope?.weekKey, "2026-03-10");
    assert.equal(gyeongchaeScope?.weekKey, "2026-03-10");
    assert.equal(gongchaeScope?.previousWeekKey, "2026-03-03");
    assert.equal(gyeongchaeScope?.previousWeekKey, "2026-03-03");
    assert.equal(gongchaeScope?.studentCount, 2);
    assert.equal(gyeongchaeScope?.studentCount, 1);
    assert.equal(gongchaeScope?.riskCount, 1);
    assert.equal(gyeongchaeScope?.riskCount, 1);
    assert.equal(report?.fileName.endsWith(".xlsx"), true);

    const { default: ExcelJS } = await import("exceljs");
    writeFileSync(tempWorkbookPath, report!.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(tempWorkbookPath);

    const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
    assert.equal(sheetNames.length, 6);
    assert.deepEqual(sheetNames, [
      gongchaeScope!.sheetNames.summary,
      gongchaeScope!.sheetNames.risk,
      gongchaeScope!.sheetNames.scores,
      gyeongchaeScope!.sheetNames.summary,
      gyeongchaeScope!.sheetNames.risk,
      gyeongchaeScope!.sheetNames.scores,
    ]);

    const gongchaeScoresSheet = workbook.getWorksheet(gongchaeScope!.sheetNames.scores);
    const gyeongchaeScoresSheet = workbook.getWorksheet(gyeongchaeScope!.sheetNames.scores);
    const gongchaeRiskSheet = workbook.getWorksheet(gongchaeScope!.sheetNames.risk);
    const gyeongchaeRiskSheet = workbook.getWorksheet(gyeongchaeScope!.sheetNames.risk);

    const gongchaeScoreNames = [7, 8, 9, 10].map((row) =>
      String(gongchaeScoresSheet?.getCell(`C${row}`).value ?? ""),
    );
    assert.ok(gongchaeScoreNames.includes("Verify Weekly Alpha"));
    assert.ok(gongchaeScoreNames.includes("Verify Weekly Beta"));

    const gyeongchaeScoreNames = [7, 8, 9, 10].map((row) =>
      String(gyeongchaeScoresSheet?.getCell(`C${row}`).value ?? ""),
    );
    assert.ok(gyeongchaeScoreNames.includes("Verify Weekly Gamma"));

    const gongchaeRiskNames = [5, 6, 7].map((row) =>
      String(gongchaeRiskSheet?.getCell(`B${row}`).value ?? ""),
    );
    const gyeongchaeRiskNames = [5, 6, 7].map((row) =>
      String(gyeongchaeRiskSheet?.getCell(`B${row}`).value ?? ""),
    );
    assert.ok(gongchaeRiskNames.includes("Verify Weekly Alpha"));
    assert.ok(gyeongchaeRiskNames.includes("Verify Weekly Gamma"));

    const unauthorizedResponse = await getWeeklyReportRoute(
      new Request("https://example.com/api/cron/weekly-report"),
    );
    assert.equal(unauthorizedResponse.status, 401);

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageDisabledResponse = await getWeeklyReportRoute(
      new Request("https://example.com/api/cron/weekly-report", {
        headers: { authorization: "Bearer verify-weekly-report-secret" },
      }),
    );
    assert.equal(storageDisabledResponse.status, 503);
    const storageDisabledBody = (await storageDisabledResponse.json()) as {
      error?: string;
      periodId?: number;
      fileName?: string;
    };
    assert.match(storageDisabledBody.error ?? "", /storage/i);
    assert.equal(storageDisabledBody.periodId, period.id);
    assert.ok((storageDisabledBody.fileName ?? "").endsWith(".xlsx"));

    console.log(
      JSON.stringify(
        {
          verified: true,
          periodId: report?.periodId,
          fileName: report?.fileName,
          scopes: report?.scopes,
          sheetNames,
          routeStorageDisabledStatus: storageDisabledResponse.status,
          bufferLength: report?.buffer.length,
        },
        null,
        2,
      ),
    );
  } finally {
    process.env.CRON_SECRET = originalCronSecret;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
    rmSync(tempWorkbookPath, { force: true });

    if (adminId) {
      await safeDbCleanup(() =>
        prisma.auditLog.deleteMany({
          where: {
            adminId: adminId!,
            action: "WEEKLY_REPORT_EXPORT",
            targetId: String(period.id),
          },
        }),
      );
    }
    if (createdAdminId) {
      await safeDbCleanup(() =>
        prisma.adminUser.delete({
          where: { id: createdAdminId! },
        }),
      );
    }
    await safeDbCleanup(() =>
      prisma.weeklyStatusSnapshot.deleteMany({
        where: {
          examNumber: { in: [examNumberA, examNumberB, examNumberC] },
        },
      }),
    );
    await safeDbCleanup(() =>
      prisma.score.deleteMany({
        where: {
          examNumber: { in: [examNumberA, examNumberB, examNumberC] },
        },
      }),
    );
    await safeDbCleanup(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: { in: [examNumberA, examNumberB, examNumberC] },
        },
      }),
    );
    await safeDbCleanup(() =>
      prisma.examSession.deleteMany({
        where: {
          periodId: period.id,
        },
      }),
    );
    await safeDbCleanup(() =>
      prisma.examPeriod.delete({
        where: { id: period.id },
      }),
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
