import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  NoticeTargetType,
  PointType,
  Prisma,
  StudentType,
  Subject,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "../src/app/api/student/auth/login/route";
import {
  GET as absenceNotesRoute,
  POST as createAbsenceNoteRoute,
} from "../src/app/api/student/absence-notes/route";
import { GET as attendanceRoute } from "../src/app/api/student/attendance/route";
import { GET as noticesRoute } from "../src/app/api/student/notices/route";
import { GET as pointsRoute } from "../src/app/api/student/points/route";
import { GET as scoresRoute } from "../src/app/api/student/scores/route";
import {
  STUDENT_SESSION_COOKIE_NAME,
  verifyStudentJwt,
} from "../src/lib/auth/student-jwt";
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

function extractSessionToken(setCookieHeader: string | null) {
  const match = setCookieHeader?.match(
    new RegExp(`${STUDENT_SESSION_COOKIE_NAME}=([^;]+)`),
  );

  if (!match?.[1]) {
    throw new Error("Student session cookie was not set.");
  }

  return match[1];
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const examNumber = `VERIFYSTUAPI${stamp}`;
  const peerExamNumber = `VERIFYSTUAPI${stamp}B`;
  const originalStudentJwtSecret = process.env.STUDENT_JWT_SECRET;
  process.env.STUDENT_JWT_SECRET = process.env.STUDENT_JWT_SECRET || `verify-student-api-secret-${stamp}`;
  const date1 = new Date("2026-03-10T00:00:00.000Z");
  const date2 = new Date("2026-03-11T00:00:00.000Z");
  const activePeriod = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: `Verifier Student API ${stamp}`,
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        totalWeeks: 4,
        isActive: true,
      },
    }),
  );
  const extraPeriod = await withDbRetry(() =>
    prisma.examPeriod.create({
      data: {
        name: `Verifier Student API Extra ${stamp}`,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2026-04-30T00:00:00.000Z"),
        totalWeeks: 4,
        isActive: false,
      },
    }),
  );

  const [student] = await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber,
          name: "PortalVerifyStudent",
          phone: "01011112222",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: true,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: peerExamNumber,
          name: "PortalVerifyPeer",
          phone: "01011113333",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: true,
          notificationConsent: false,
        },
      }),
    ),
  ]);

  await Promise.all([
    withDbRetry(() =>
      prisma.periodEnrollment.create({
        data: {
          periodId: activePeriod.id,
          examNumber,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.periodEnrollment.create({
        data: {
          periodId: activePeriod.id,
          examNumber: peerExamNumber,
        },
      }),
    ),
  ]);

  const [session1, session2, wrongTypeSession, extraPeriodSession] = await Promise.all([
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: activePeriod.id,
          examType: ExamType.GONGCHAE,
          week: 1,
          subject: Subject.CONSTITUTIONAL_LAW,
          examDate: date1,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: activePeriod.id,
          examType: ExamType.GONGCHAE,
          week: 1,
          subject: Subject.CRIMINAL_LAW,
          examDate: date2,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: activePeriod.id,
          examType: ExamType.GYEONGCHAE,
          week: 1,
          subject: Subject.CRIMINAL_PROCEDURE,
          examDate: date2,
        },
      }),
    ),
    withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: extraPeriod.id,
          examType: ExamType.GONGCHAE,
          week: 1,
          subject: Subject.CRIMINOLOGY,
          examDate: date2,
        },
      }),
    ),
  ]);
  let militarySessionId: number | null = null;
  let militaryScoreId: number | null = null;

  const [score1, score2, peerScore1] = await Promise.all([
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber,
          sessionId: session1.id,
          rawScore: 88,
          oxScore: null,
          finalScore: 88,
          attendType: AttendType.NORMAL,
          sourceType: "MANUAL_INPUT",
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber,
          sessionId: session2.id,
          rawScore: null,
          oxScore: null,
          finalScore: null,
          attendType: AttendType.ABSENT,
          sourceType: "MANUAL_INPUT",
        },
      }),
    ),
    withDbRetry(() =>
      prisma.score.create({
        data: {
          examNumber: peerExamNumber,
          sessionId: session1.id,
          rawScore: 77,
          oxScore: null,
          finalScore: 77,
          attendType: AttendType.NORMAL,
          sourceType: "MANUAL_INPUT",
        },
      }),
    ),
  ]);

  const rejectedAbsenceNote = await withDbRetry(() =>
    prisma.absenceNote.create({
      data: {
        examNumber,
        sessionId: session2.id,
        reason: "Rejected reason",
        absenceCategory: AbsenceCategory.OTHER,
        status: AbsenceStatus.REJECTED,
        submittedAt: date2,
      },
    }),
  );

  await Promise.all([
    withDbRetry(() =>
      prisma.weeklyStatusSnapshot.create({
        data: {
          periodId: activePeriod.id,
          examNumber,
          examType: ExamType.GONGCHAE,
          weekKey: "2026-W10",
          weekStartDate: new Date("2026-03-10T00:00:00.000Z"),
          weekEndDate: new Date("2026-03-16T00:00:00.000Z"),
          weekAbsenceCount: 1,
          monthAbsenceCount: 2,
          status: "WARNING_1",
        },
      }),
    ),
    withDbRetry(() =>
      prisma.notice.createMany({
        data: [
          {
            title: `ALL-NOTICE-${stamp}`,
            content: "<p>All notice</p>",
            targetType: NoticeTargetType.ALL,
            isPublished: true,
            publishedAt: new Date("2026-03-12T00:00:00.000Z"),
          },
          {
            title: `GONGCHAE-NOTICE-${stamp}`,
            content: "<p>Gongchae notice</p>",
            targetType: NoticeTargetType.GONGCHAE,
            isPublished: true,
            publishedAt: new Date("2026-03-13T00:00:00.000Z"),
          },
          {
            title: `GYEONGCHAE-NOTICE-${stamp}`,
            content: "<p>Gyeongchae notice</p>",
            targetType: NoticeTargetType.GYEONGCHAE,
            isPublished: true,
            publishedAt: new Date("2026-03-14T00:00:00.000Z"),
          },
          {
            title: `HIDDEN-NOTICE-${stamp}`,
            content: "<p>Hidden notice</p>",
            targetType: NoticeTargetType.ALL,
            isPublished: false,
          },
        ],
      }),
    ),
    withDbRetry(() =>
      prisma.pointLog.createMany({
        data: [
          {
            examNumber,
            type: PointType.PERFECT_ATTENDANCE,
            amount: 5,
            reason: "Perfect attendance reward",
            periodId: activePeriod.id,
            year: 2026,
            month: 3,
          },
          {
            examNumber,
            type: PointType.MANUAL,
            amount: 2,
            reason: "Manual bonus",
          },
          {
            examNumber: peerExamNumber,
            type: PointType.MANUAL,
            amount: 9,
            reason: "Peer-only bonus",
          },
        ],
      }),
    ),
  ]);

  try {
    const loginResponse = await loginRoute(
      new Request("https://example.com/api/student/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ examNumber, name: student.name }),
      }),
    );
    assert.equal(loginResponse.status, 200);

    const token = extractSessionToken(loginResponse.headers.get("set-cookie"));
    const cookie = `${STUDENT_SESSION_COOKIE_NAME}=${token}`;
    const claims = await verifyStudentJwt(token);
    assert.equal(claims.examNumber, examNumber);

    const unauthScores = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores"),
    );
    assert.equal(unauthScores.status, 401);

    const scoresResponse = await scoresRoute(
      new NextRequest(
        `https://example.com/api/student/scores?periodId=${activePeriod.id}&date=${formatDateInput(date1)}&monthKey=2026-3&subject=${Subject.CONSTITUTIONAL_LAW}`,
        {
          headers: {
            cookie,
          },
        },
      ),
    );
    assert.equal(scoresResponse.status, 200);
    const scoresPayload = await scoresResponse.json();
    assert.equal(scoresPayload.data.student.examNumber, examNumber);
    assert.equal(scoresPayload.data.selectedDate, formatDateInput(date1));
    assert.equal(scoresPayload.data.dailyAnalysis.length, 1);
    assert.equal(scoresPayload.data.selectedSubject, Subject.CONSTITUTIONAL_LAW);
    assert.equal(scoresPayload.data.selectedPeriod.id, activePeriod.id);

    const invalidScoresResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?subject=INVALID", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(invalidScoresResponse.status, 400);

    const invalidDateResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?date=2026-99-99", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(invalidDateResponse.status, 400);

    const invalidMonthKeyResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?monthKey=2026-13", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(invalidMonthKeyResponse.status, 400);

    const invalidPeriodIdResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?periodId=0", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(invalidPeriodIdResponse.status, 400);

    const foreignPeriodResponse = await scoresRoute(
      new NextRequest(`https://example.com/api/student/scores?periodId=${extraPeriod.id}`, {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(foreignPeriodResponse.status, 400);

    const outOfScopeDateResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?date=2026-03-31", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(outOfScopeDateResponse.status, 400);

    const outOfScopeMonthKeyResponse = await scoresRoute(
      new NextRequest("https://example.com/api/student/scores?monthKey=2026-4", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(outOfScopeMonthKeyResponse.status, 400);

    const outOfScopeSubjectResponse = await scoresRoute(
      new NextRequest(`https://example.com/api/student/scores?subject=${Subject.CRIMINOLOGY}`, {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(outOfScopeSubjectResponse.status, 400);

    const attendanceResponse = await attendanceRoute(
      new NextRequest("https://example.com/api/student/attendance", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(attendanceResponse.status, 200);
    const attendancePayload = await attendanceResponse.json();
    assert.equal(attendancePayload.data.currentStatus, "WARNING_1");
    assert.equal(attendancePayload.data.thisWeekAbsences, 1);
    assert.equal(attendancePayload.data.thisMonthAbsences, 2);
    assert.equal(attendancePayload.data.totalSessions, 2);
    assert.equal(attendancePayload.data.attendedSessions, 1);
    assert.equal(attendancePayload.data.attendanceRate, 50);

    const noticesResponse = await noticesRoute(
      new NextRequest("https://example.com/api/student/notices", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(noticesResponse.status, 200);
    const noticesPayload = await noticesResponse.json();
    const noticeTitles = noticesPayload.notices.map((notice: { title: string }) => notice.title);
    assert.ok(noticeTitles.includes(`ALL-NOTICE-${stamp}`));
    assert.ok(noticeTitles.includes(`GONGCHAE-NOTICE-${stamp}`));
    assert.ok(!noticeTitles.includes(`GYEONGCHAE-NOTICE-${stamp}`));
    assert.ok(!noticeTitles.includes(`HIDDEN-NOTICE-${stamp}`));

    const absenceNotesResponse = await absenceNotesRoute(
      new NextRequest(`https://example.com/api/student/absence-notes?periodId=${activePeriod.id}`, {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(absenceNotesResponse.status, 200);
    const absenceNotesPayload = await absenceNotesResponse.json();
    assert.equal(absenceNotesPayload.data.notes.length, 1);
    assert.equal(absenceNotesPayload.data.notes[0].id, rejectedAbsenceNote.id);
    assert.ok(absenceNotesPayload.data.sessionOptions.some((session: { id: number }) => session.id === session2.id));

    const invalidAbsencePeriodResponse = await absenceNotesRoute(
      new NextRequest("https://example.com/api/student/absence-notes?periodId=0", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(invalidAbsencePeriodResponse.status, 400);

    const foreignAbsencePeriodResponse = await absenceNotesRoute(
      new NextRequest(`https://example.com/api/student/absence-notes?periodId=${extraPeriod.id}`, {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(foreignAbsencePeriodResponse.status, 400);

    const pointsResponse = await pointsRoute(
      new NextRequest("https://example.com/api/student/points", {
        headers: {
          cookie,
        },
      }),
    );
    assert.equal(pointsResponse.status, 200);
    const pointsPayload = await pointsResponse.json();
    assert.equal(pointsPayload.data.summary.totalPoints, 7);
    assert.equal(pointsPayload.data.pointLogs.length, 2);
    assert.ok(pointsPayload.data.pointLogs.every((log: { examNumber?: string }) => log.examNumber === undefined));

    const resubmitResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: session2.id,
          reason: "Resubmitted reason",
          absenceCategory: AbsenceCategory.OTHER,
        }),
      }),
    );
    assert.equal(resubmitResponse.status, 200);
    const resubmitPayload = await resubmitResponse.json();
    assert.equal(resubmitPayload.note.id, rejectedAbsenceNote.id);
    assert.equal(resubmitPayload.note.status, AbsenceStatus.PENDING);
    assert.equal(resubmitPayload.note.reason, "Resubmitted reason");

    const duplicateResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: session2.id,
          reason: "Duplicate request",
          absenceCategory: AbsenceCategory.OTHER,
        }),
      }),
    );
    assert.equal(duplicateResponse.status, 409);

    const invalidReasonResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: session2.id,
          reason: { invalid: true },
          absenceCategory: AbsenceCategory.OTHER,
        }),
      }),
    );
    assert.equal(invalidReasonResponse.status, 400);

    const foreignPeriodSessionResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: extraPeriodSession.id,
          reason: "Foreign period",
          absenceCategory: AbsenceCategory.OTHER,
        }),
      }),
    );
    assert.equal(foreignPeriodSessionResponse.status, 403);

    const wrongTypeResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: wrongTypeSession.id,
          reason: "Wrong exam type",
          absenceCategory: AbsenceCategory.OTHER,
        }),
      }),
    );
    assert.equal(wrongTypeResponse.status, 403);

    const militarySession = await withDbRetry(() =>
      prisma.examSession.create({
        data: {
          periodId: activePeriod.id,
          examType: ExamType.GONGCHAE,
          week: 2,
          subject: Subject.POLICE_SCIENCE,
          examDate: new Date("2026-03-12T00:00:00.000Z"),
        },
      }),
    );
    militarySessionId = militarySession.id;

    const militarySuccessResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: militarySession.id,
          reason: "Military auto approve success",
          absenceCategory: AbsenceCategory.MILITARY,
        }),
      }),
    );
    assert.equal(militarySuccessResponse.status, 200);
    const militarySuccessPayload = await militarySuccessResponse.json();
    assert.equal(militarySuccessPayload.note.status, AbsenceStatus.APPROVED);
    const militaryScore = await withDbRetry(() =>
      prisma.score.findUnique({
        where: {
          examNumber_sessionId: {
            examNumber,
            sessionId: militarySession.id,
          },
        },
      }),
    );
    assert.equal(militaryScore?.attendType, AttendType.EXCUSED);
    militaryScoreId = militaryScore?.id ?? null;

    const militaryOnScoredSessionResponse = await createAbsenceNoteRoute(
      new Request("https://example.com/api/student/absence-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          sessionId: session1.id,
          reason: "Military auto approve",
          absenceCategory: AbsenceCategory.MILITARY,
        }),
      }),
    );
    assert.equal(militaryOnScoredSessionResponse.status, 400);

    console.log(
      JSON.stringify(
        {
          verified: true,
          examNumber,
          selectedPeriodId: activePeriod.id,
          scoresDailyRows: scoresPayload.data.dailyAnalysis.length,
          noticeCount: noticesPayload.notices.length,
          attendanceRate: attendancePayload.data.attendanceRate,
          rejectedResubmitted: true,
          militaryAutoApproved: true,
        },
        null,
        2,
      ),
    );
  } finally {
    process.env.STUDENT_JWT_SECRET = originalStudentJwtSecret;

    await withDbRetry(() =>
      prisma.notice.deleteMany({
        where: {
          title: {
            in: [
              `ALL-NOTICE-${stamp}`,
              `GONGCHAE-NOTICE-${stamp}`,
              `GYEONGCHAE-NOTICE-${stamp}`,
              `HIDDEN-NOTICE-${stamp}`,
            ],
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.weeklyStatusSnapshot.deleteMany({
        where: {
          examNumber,
          periodId: activePeriod.id,
        },
      }),
    );

    await withDbRetry(() =>
      prisma.absenceNote.deleteMany({
        where: {
          examNumber,
          sessionId: {
            in: [session1.id, session2.id, wrongTypeSession.id, extraPeriodSession.id, ...(militarySessionId ? [militarySessionId] : [])],
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.score.deleteMany({
        where: {
          id: {
            in: [score1.id, score2.id, peerScore1.id, ...(militaryScoreId ? [militaryScoreId] : [])],
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.examSession.deleteMany({
        where: {
          id: {
            in: [session1.id, session2.id, wrongTypeSession.id, extraPeriodSession.id, ...(militarySessionId ? [militarySessionId] : [])],
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: {
            in: [examNumber, peerExamNumber],
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.examPeriod.deleteMany({
        where: {
          id: {
            in: [activePeriod.id, extraPeriod.id],
          },
        },
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


