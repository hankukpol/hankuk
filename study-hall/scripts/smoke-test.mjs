import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const port = Number(process.env.SMOKE_TEST_PORT || "43214");
const baseUrl = `http://127.0.0.1:${port}`;

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  absorb(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")]
          : [];

    for (const entry of setCookies) {
      const [pair] = entry.split(";");
      const index = pair.indexOf("=");
      if (index > 0) {
        this.map.set(pair.slice(0, index), pair.slice(index + 1));
      }
    }
  }

  header() {
    return Array.from(this.map.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
}

function getKstDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getFixtureState() {
  const fixturePath = fs.existsSync(path.join(root, ".local", "mock-db.json"))
    ? path.join(root, ".local", "mock-db.json")
    : path.join(root, ".local", "mock-db.backup.json");

  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status === 200) {
        return;
      }
    } catch {
      // ignore until the server is ready
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Smoke test server did not become ready in time.");
}

async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.jar) {
    const cookie = options.jar.header();
    if (cookie) {
      headers.set("cookie", cookie);
    }
  }

  let body = options.body;
  if (body && typeof body !== "string" && !(body instanceof Buffer)) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${urlPath}`, {
    method: options.method || "GET",
    headers,
    body,
    redirect: "manual",
  });

  if (options.jar) {
    options.jar.absorb(response);
  }

  return response;
}

async function expectStatus(label, response, expectedStatus) {
  expect(
    response.status === expectedStatus,
    `${label}: expected ${expectedStatus}, got ${response.status}`,
  );
}

async function loginAdmin(email) {
  const jar = new CookieJar();
  const response = await request("/api/auth/login", {
    method: "POST",
    jar,
    body: { email, password: "test1234" },
  });
  await expectStatus(`admin login ${email}`, response, 200);
  return jar;
}

async function loginStudent(division, studentNumber, name) {
  const jar = new CookieJar();
  const response = await request("/api/auth/student-login", {
    method: "POST",
    jar,
    body: { division, studentNumber, name },
  });
  await expectStatus(`student login ${studentNumber}`, response, 200);
  return jar;
}

function resetMockData() {
  const reset = spawnSync(process.execPath, ["scripts/reset-all-data.mjs", "--force"], {
    cwd: root,
    env: { ...process.env, MOCK_MODE: "true" },
    stdio: "inherit",
  });

  if (reset.status !== 0) {
    throw new Error("Failed to reset mock data before smoke test.");
  }
}

async function main() {
  resetMockData();
  const today = getKstDate(0);
  const nextMonth = getKstDate(30);

  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: { ...process.env, MOCK_MODE: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const superJar = await loginAdmin("super@mock.local");
    await expectStatus("super admin page", await request("/super-admin", { jar: superJar }), 200);
    const fixtureState = getFixtureState();

    const divisions = [
      ["police", "admin-police@mock.local"],
      ["fire", "admin-fire@mock.local"],
      ["allpass", "admin-allpass@mock.local"],
      ["hankyung-sparta", "admin-hankyung-sparta@mock.local"],
    ];

    for (const [slug, email] of divisions) {
      const jar = await loginAdmin(email);
      await expectStatus(`${slug} admin dashboard`, await request(`/${slug}/admin`, { jar }), 200);
      await expectStatus(`${slug} students page`, await request(`/${slug}/admin/students?q=test&status=ACTIVE&sort=name`, { jar }), 200);
      await expectStatus(`${slug} payments page`, await request(`/${slug}/admin/payments`, { jar }), 200);
      await expectStatus(`${slug} announcements page`, await request(`/${slug}/admin/announcements`, { jar }), 200);
      await expectStatus(`${slug} exams page`, await request(`/${slug}/admin/exams`, { jar }), 200);
      await expectStatus(`${slug} seats page`, await request(`/${slug}/admin/settings/seats`, { jar }), 200);
    }

    const assistantJar = await loginAdmin("assistant-police@mock.local");
    await expectStatus("assistant dashboard", await request("/police/assistant", { jar: assistantJar }), 200);
    await expectStatus("assistant check page", await request("/police/assistant/check", { jar: assistantJar }), 200);
    await expectStatus("assistant students API forbidden", await request("/api/police/students", { jar: assistantJar }), 403);

    const studentFixture = fixtureState.studentsByDivision.police.find(
      (student) => student.studentNumber === "P-2026-001",
    );
    expect(studentFixture, "student fixture missing");
    const studentJar = await loginStudent("police", studentFixture.studentNumber, studentFixture.name);
    await expectStatus("student dashboard", await request("/police/student", { jar: studentJar }), 200);
    await expectStatus("student attendance page", await request("/police/student/attendance", { jar: studentJar }), 200);
    await expectStatus("student exams page", await request("/police/student/exams", { jar: studentJar }), 200);
    await expectStatus("student points page", await request("/police/student/points", { jar: studentJar }), 200);

    const policeJar = await loginAdmin("admin-police@mock.local");
    await expectStatus("cross division API forbidden", await request("/api/fire/students", { jar: policeJar }), 403);

    const policeStudents = fixtureState.studentsByDivision.police;
    const policeSeats = fixtureState.seatsByDivision.police;
    const occupiedSeat = policeSeats.find((seat) =>
      policeStudents.some((student) => student.seatId === seat.id),
    );
    const freeSeats = policeSeats.filter(
      (seat) =>
        seat.isActive &&
        !policeStudents.some((student) => student.seatId === seat.id),
    );
    expect(occupiedSeat, "No occupied seat found in police fixtures.");
    expect(freeSeats.length >= 2, "Need at least two free seats in police fixtures.");

    const paymentCategory =
      fixtureState.paymentCategoriesByDivision.police.find((item) => item.isActive !== false) ||
      fixtureState.paymentCategoriesByDivision.police[0];
    const examType =
      fixtureState.examTypesByDivision.police.find((item) => item.isActive !== false) ||
      fixtureState.examTypesByDivision.police[0];
    const studyTrack = fixtureState.divisionSettingsByDivision.police.studyTracks?.[0] || "track";
    expect(paymentCategory, "No payment category found.");
    expect(examType, "No exam type found.");

    const uniqueSeed = Date.now();
    const firstStudentNumber = `SMOKE-${uniqueSeed}-1`;
    const secondStudentNumber = `SMOKE-${uniqueSeed}-2`;

    const firstCreate = await request("/api/police/students", {
      method: "POST",
      jar: policeJar,
      body: {
        name: "smoke-student-a",
        studentNumber: firstStudentNumber,
        studyTrack,
        phone: "010-1111-1111",
        seatId: null,
        courseStartDate: today,
        courseEndDate: nextMonth,
        tuitionPlanId: null,
        tuitionAmount: 0,
        status: "ACTIVE",
        memo: "smoke test",
      },
    });
    await expectStatus("create student A", firstCreate, 201);
    const firstStudent = (await firstCreate.json()).student;

    const secondCreate = await request("/api/police/students", {
      method: "POST",
      jar: policeJar,
      body: {
        name: "smoke-student-b",
        studentNumber: secondStudentNumber,
        studyTrack,
        phone: "010-2222-2222",
        seatId: null,
        courseStartDate: today,
        courseEndDate: nextMonth,
        tuitionPlanId: null,
        tuitionAmount: 0,
        status: "ACTIVE",
        memo: "smoke test",
      },
    });
    await expectStatus("create student B", secondCreate, 201);
    const secondStudent = (await secondCreate.json()).student;

    await expectStatus(
      "assign free seat to student A",
      await request(`/api/police/seats/${freeSeats[0].id}/assign`, {
        method: "PATCH",
        jar: policeJar,
        body: { studentId: firstStudent.id },
      }),
      200,
    );

    const conflictAssign = await request(`/api/police/seats/${freeSeats[0].id}/assign`, {
      method: "PATCH",
      jar: policeJar,
      body: { studentId: secondStudent.id },
    });
    expect(
      [400, 409].includes(conflictAssign.status),
      `seat conflict should fail, got ${conflictAssign.status}`,
    );

    await expectStatus(
      "assign second free seat to student B",
      await request(`/api/police/seats/${freeSeats[1].id}/assign`, {
        method: "PATCH",
        jar: policeJar,
        body: { studentId: secondStudent.id },
      }),
      200,
    );

    const occupiedAssign = await request(`/api/police/seats/${occupiedSeat.id}/assign`, {
      method: "PATCH",
      jar: policeJar,
      body: { studentId: secondStudent.id },
    });
    expect(
      [400, 409].includes(occupiedAssign.status),
      `occupied seat overwrite should fail, got ${occupiedAssign.status}`,
    );

    const studentsResponse = await request("/api/police/students", { jar: policeJar });
    await expectStatus("list students after seat assignment", studentsResponse, 200);
    const studentsJson = await studentsResponse.json();
    const createdStudentSummary = studentsJson.students.find((student) => student.id === firstStudent.id);
    expect(createdStudentSummary?.seatDisplay, "Created student seatDisplay should be populated.");

    const paymentCreate = await request("/api/police/payments", {
      method: "POST",
      jar: policeJar,
      body: {
        studentId: firstStudent.id,
        paymentTypeId: paymentCategory.id,
        amount: 123456,
        paymentDate: today,
        method: "bank-transfer",
        notes: "smoke payment",
      },
    });
    await expectStatus("create payment", paymentCreate, 201);

    const announcementTitle = `smoke notice ${Date.now()}`;
    const announcementCreate = await request("/api/police/announcements", {
      method: "POST",
      jar: policeJar,
      body: {
        title: announcementTitle,
        content: "notice smoke test",
        isPinned: false,
        scope: "DIVISION",
        publishedAt: null,
      },
    });
    await expectStatus("create announcement", announcementCreate, 201);
    const announcementList = await request("/api/police/announcements", { jar: policeJar });
    const announcementJson = await announcementList.json();
    expect(
      announcementJson.announcements.some((item) => item.title === announcementTitle),
      "Announcement should be listed after create.",
    );

    const examSheetResponse = await request(
      `/api/police/exams?examTypeId=${examType.id}&examRound=1`,
      { jar: policeJar },
    );
    await expectStatus("get exam sheet", examSheetResponse, 200);
    const examSheet = (await examSheetResponse.json()).sheet;
    expect(Array.isArray(examSheet.rows) && examSheet.rows.length > 0, "Exam sheet should include rows.");

    const examSave = await request("/api/police/exams", {
      method: "POST",
      jar: policeJar,
      body: {
        examTypeId: examType.id,
        examRound: 1,
        examDate: today,
        rows: examSheet.rows.map((row, index) => ({
          studentId: row.studentId,
          scores: row.scores,
          notes: index === 0 ? "smoke-note" : row.notes,
        })),
      },
    });
    await expectStatus("save exam scores", examSave, 200);

    console.log(
      JSON.stringify(
        {
          ok: true,
          checked: {
            adminBranches: divisions.length,
            assistant: true,
            student: true,
            studentCreate: true,
            seatAssignConflict: true,
            paymentCreate: true,
            announcementCreate: true,
            examSave: true,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("SMOKE_FAILED");
    console.error(error && error.stack ? error.stack : String(error));
    console.error("SERVER_STDOUT_START");
    console.error(stdout);
    console.error("SERVER_STDOUT_END");
    console.error("SERVER_STDERR_START");
    console.error(stderr);
    console.error("SERVER_STDERR_END");
    process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!server.killed) {
      server.kill("SIGKILL");
    }

    try {
      resetMockData();
    } catch (error) {
      console.error("SMOKE_RESET_FAILED");
      console.error(error && error.stack ? error.stack : String(error));
      process.exitCode = 1;
    }
  }
}

await main();
