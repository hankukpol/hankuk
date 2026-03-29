import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ExamType, Prisma, StudentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "../src/app/api/student/auth/login/route";
import { POST as logoutRoute } from "../src/app/api/student/auth/logout/route";
import { requireStudentFromRequest } from "../src/lib/auth/require-student";
import {
  STUDENT_SESSION_COOKIE_NAME,
  verifyStudentJwt,
} from "../src/lib/auth/student-jwt";
import { getPrisma } from "../src/lib/prisma";
import { middleware } from "../src/middleware";

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

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const stamp = Date.now();
  const activeExamNumber = `VERIFYAUTH${stamp}`;
  const inactiveExamNumber = `VERIFYAUTH${stamp}X`;
  const originalStudentJwtSecret = process.env.STUDENT_JWT_SECRET;

  process.env.STUDENT_JWT_SECRET =
    process.env.STUDENT_JWT_SECRET || `verify-student-secret-${stamp}`;

  await Promise.all([
    withDbRetry(() =>
      prisma.student.create({
        data: {
          examNumber: activeExamNumber,
          name: "포털학생",
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
          examNumber: inactiveExamNumber,
          name: "비활성학생",
          phone: "01033334444",
          examType: ExamType.GONGCHAE,
          studentType: StudentType.EXISTING,
          isActive: false,
          notificationConsent: false,
        },
      }),
    ),
  ]);

  try {
    const missingFields = await loginRoute(
      new Request("https://example.com/api/student/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ examNumber: "", name: "" }),
      }),
    );
    assert.equal(missingFields.status, 400);

    const invalidLogin = await loginRoute(
      new Request("https://example.com/api/student/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ examNumber: activeExamNumber, name: "다른이름" }),
      }),
    );
    assert.equal(invalidLogin.status, 401);

    const inactiveLogin = await loginRoute(
      new Request("https://example.com/api/student/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ examNumber: inactiveExamNumber, name: "비활성학생" }),
      }),
    );
    assert.equal(inactiveLogin.status, 401);

    const successLogin = await loginRoute(
      new Request("https://example.com/api/student/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify({ examNumber: activeExamNumber, name: "포털학생" }),
      }),
    );
    assert.equal(successLogin.status, 200);

    const setCookieHeader = successLogin.headers.get("set-cookie");
    assert.ok(setCookieHeader?.includes(`${STUDENT_SESSION_COOKIE_NAME}=`));
    assert.ok(setCookieHeader?.includes("HttpOnly"));
    assert.ok(/SameSite=strict/i.test(setCookieHeader ?? ""));

    const token = extractSessionToken(setCookieHeader);
    const claims = await verifyStudentJwt(token);
    assert.equal(claims.examNumber, activeExamNumber);
    assert.equal(claims.sub, activeExamNumber);

    const student = await requireStudentFromRequest(
      new Request("https://example.com/api/student/wrong-notes", {
        headers: {
          cookie: `${STUDENT_SESSION_COOKIE_NAME}=${token}`,
        },
      }),
    );
    assert.equal(student.examNumber, activeExamNumber);

    await assert.rejects(
      () =>
        requireStudentFromRequest(
          new Request("https://example.com/api/student/wrong-notes", {
            headers: {
              cookie: `${STUDENT_SESSION_COOKIE_NAME}=invalid.token.value`,
            },
          }),
        ),
      /INVALID_TOKEN/,
    );

    const unauthMiddlewareResponse = await middleware(
      new NextRequest("https://example.com/student/wrong-notes"),
    );
    assert.equal(unauthMiddlewareResponse.status, 307);
    assert.ok(
      unauthMiddlewareResponse.headers
        .get("location")
        ?.includes("/student/login?redirectTo=%2Fstudent%2Fwrong-notes"),
    );

    const invalidMiddlewareResponse = await middleware(
      new NextRequest("https://example.com/student/notices", {
        headers: {
          cookie: `${STUDENT_SESSION_COOKIE_NAME}=invalid.token.value`,
        },
      }),
    );
    assert.equal(invalidMiddlewareResponse.status, 307);
    assert.ok(
      invalidMiddlewareResponse.headers
        .get("location")
        ?.includes("/student/login?redirectTo=%2Fstudent%2Fnotices"),
    );

    const authMiddlewareResponse = await middleware(
      new NextRequest("https://example.com/student/wrong-notes", {
        headers: {
          cookie: `${STUDENT_SESSION_COOKIE_NAME}=${token}`,
        },
      }),
    );
    assert.equal(authMiddlewareResponse.headers.get("location"), null);

    const logoutResponse = await logoutRoute();
    assert.equal(logoutResponse.status, 200);
    assert.ok(
      logoutResponse.headers
        .get("set-cookie")
        ?.includes(`${STUDENT_SESSION_COOKIE_NAME}=`),
    );
    assert.ok(logoutResponse.headers.get("set-cookie")?.includes("Max-Age=0"));

    console.log(
      JSON.stringify(
        {
          verified: true,
          activeExamNumber,
          middlewareRedirect: true,
          loginCookieIssued: true,
          logoutCookieCleared: true,
        },
        null,
        2,
      ),
    );
  } finally {
    process.env.STUDENT_JWT_SECRET = originalStudentJwtSecret;

    await withDbRetry(() =>
      prisma.student.deleteMany({
        where: {
          examNumber: {
            in: [activeExamNumber, inactiveExamNumber],
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


