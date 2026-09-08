import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { updateMockState, readMockState } from "../../lib/mock-store";
import { parseExamImportPair } from "../../lib/exam-import-parser";

const base = process.env.TEST_BASE_URL;
if (
  !base ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) ||
  process.env.MOCK_MODE !== "true"
)
  throw new Error("Isolated local mock runtime required");
const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests/fixtures/exam-import", name));
async function login(email: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "fixture-password" }),
  });
  assert.equal(response.status, 200);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
function upload(
  category: "MORNING" | "REGULAR",
  examTypeId: string,
  overwrite = false,
) {
  const form = new FormData();
  const prefix = category === "REGULAR" ? "regular" : "morning-synthetic";
  form.set(
    "scoreFile",
    new Blob([fixture(`${prefix}-score.xls`)]),
    "grading.xls",
  );
  form.set(
    "analysisFile",
    new Blob([fixture(`${prefix}-moon.xls`)]),
    "analysis.xls",
  );
  form.set("category", category);
  form.set("examTypeId", examTypeId);
  if (category === "MORNING") form.set("topic", "단원 테스트");
  form.set("overwrite", String(overwrite));
  return form;
}
test("file import HTTP flow persists both legacy score paths and rejects foreign access/unchecked overwrite", async () => {
  const regular = parseExamImportPair(
    fixture("regular-score.xls"),
    fixture("regular-moon.xls"),
  );
  const morning = parseExamImportPair(
    fixture("morning-synthetic-score.xls"),
    fixture("morning-synthetic-moon.xls"),
  );
  await updateMockState((state) => {
    const division = state.divisions.find((row) => row.slug === "police")!;
    while (state.studentsByDivision.police.length < 5) {
      const template = state.studentsByDivision.police[0];
      state.studentsByDivision.police.push({ ...template, id: `import-student-${state.studentsByDivision.police.length}`, name: `학생${state.studentsByDivision.police.length + 1}`, seatId: null });
    }
    state.examTypesByDivision.police = state.examTypesByDivision.police.filter((row) => !row.id.startsWith("import-http-"));
    state.studentsByDivision.police.slice(0, 5).forEach((student, index) => {
      student.studentNumber = String(90001 + index);
    });
    const previous = new Set(state.examSessionsByDivision.police.filter((row) => row.examTypeId.startsWith("import-http-")).map((row) => row.id));
    state.examSessionsByDivision.police = state.examSessionsByDivision.police.filter((row) => !previous.has(row.id));
    state.examSessionItemsByDivision.police = state.examSessionItemsByDivision.police.filter((row) => !previous.has(row.sessionId));
    state.examSessionParticipantsByDivision.police = state.examSessionParticipantsByDivision.police.filter((row) => !previous.has(row.sessionId));
    state.examItemResponsesByDivision.police = state.examItemResponsesByDivision.police.filter((row) => !previous.has(row.sessionId));
    state.examScoresByDivision.police = state.examScoresByDivision.police.filter((row) => !row.examTypeId.startsWith("import-http-"));
    state.morningExamScoresByDivision.police = state.morningExamScoresByDivision.police.filter((row) => !row.examTypeId.startsWith("import-http-"));
    const now = new Date().toISOString();
    for (const [category, parsed, id] of [
      ["REGULAR", regular, "import-http-regular"],
      ["MORNING", morning, "import-http-morning"],
    ] as const) {
      const names = Array.from(
        new Set(parsed.moon.map((item) => item.subjectName)),
      );
      state.examTypesByDivision.police.push({
        id,
        divisionId: division.id,
        name: `Import ${category}`,
        category,
        studyTrack: null,
        isActive: true,
        displayOrder: 99,
        createdAt: now,
        updatedAt: now,
        subjects: names.map((name, index) => ({
          id: `${id}-${index}`,
          examTypeId: id,
          name,
          totalItems: parsed.moon.filter((item) => item.subjectName === name)
            .length,
          pointsPerItem: category === "REGULAR" ? 2.5 : 5,
          alternateGroup: category === "REGULAR" && index < 2 ? "선택" : null,
          isActive: true,
          displayOrder: index,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
  });
  const cookie = await login("admin-police@mock.local");
  const assistantCookie = await login("assistant-police@mock.local");
  for (const [category, id, fullScore] of [
    ["REGULAR", "import-http-regular", 250],
    ["MORNING", "import-http-morning", 100],
  ] as const) {
    const send = (
      suffix: string,
      overwrite = false,
      auth = cookie,
      division = "police",
    ): Promise<Response> =>
      fetch(`${base}/api/${division}/exam-imports${suffix}`, {
        method: "POST",
        headers: { cookie: auth },
        body: upload(category, id, overwrite),
      });
    assert.equal((await send("/preview", false, assistantCookie)).status, 403);
    assert.equal((await send("/preview", false, cookie, "fire")).status, 403);
    const response = await send("/preview");
    assert.equal(response.status, 200);
    const { preview } = await response.json();
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.equal(preview.fullScore, fullScore);
    assert.equal(preview.matching.matched, 5);
    assert.equal(preview.reproduction.mismatches.length, 0);
    assert.equal(preview.existing, false);
    const confirmed = await send("");
    assert.equal(confirmed.status, 201, await confirmed.clone().text());
    const { result } = await confirmed.json();
    assert.equal(result.importedCount, 5);
    assert.equal((await send("")).status, 409);
    assert.equal((await send("", true)).status, 201);
    const state = await readMockState();
    assert.equal(
      state.examSessionsByDivision.police.filter((row) => row.examTypeId === id)
        .length,
      1,
    );
    const session = state.examSessionsByDivision.police.find(
      (row) => row.examTypeId === id,
    )!;
    assert.equal(session.fullScore, fullScore);
    const scores =
      category === "REGULAR"
        ? state.examScoresByDivision.police.filter(
            (row) => row.examTypeId === id,
          )
        : state.morningExamScoresByDivision.police.filter(
            (row) => row.examTypeId === id,
          );
    assert.equal(scores.length, 5);
    assert.equal(
      state.examSessionParticipantsByDivision.police.filter(
        (row) => row.sessionId === session.id,
      ).length,
      5,
    );
    assert.equal(state.examSessionsByDivision.fire.length, 0);
    assert.equal(
      JSON.stringify(session.externalStats).includes("studentNumber"),
      false,
    );
    assert.equal(
      JSON.stringify(session.externalStats).includes("studentName"),
      false,
    );
  }
});

test("student may read own imported morning score but another student ID is forbidden", async () => {
  const state = await readMockState();
  const [student, other] = state.studentsByDivision.police;
  const loginResponse = await fetch(`${base}/api/auth/student-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ division: "police", studentNumber: student.studentNumber, name: student.name }) });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const own = await fetch(`${base}/api/police/morning-exams/student/${student.id}`, { headers: { cookie } });
  assert.equal(own.status, 200);
  const denied = await fetch(`${base}/api/police/morning-exams/student/${other.id}`, { headers: { cookie } });
  assert.equal(denied.status, 403);
  const body = await denied.text();
  assert.equal(body.includes(other.name), false);
  const importDenied = await fetch(`${base}/api/police/exam-imports/preview`, { method: "POST", headers: { cookie }, body: upload("MORNING", "import-http-morning") });
  assert.equal(importDenied.status, 401);
});

test("history deletion removes importer-owned scores and keeps subsequently edited manual scores", async () => {
  const admin = await login("admin-police@mock.local");
  const assistant = await login("assistant-police@mock.local");
  const url = `${base}/api/police/exam-imports`;
  const historyResponse = await fetch(`${url}?examTypeId=import-http-morning`, { headers: { cookie: admin } });
  assert.equal(historyResponse.status, 200);
  const { history } = await historyResponse.json();
  assert.equal(history.length, 1);
  assert.equal(history[0].matchedStudentCount, 5);
  assert.equal(history[0].topic, "단원 테스트");
  const endpoint = `${url}/${history[0].sessionId}`;
  assert.equal((await fetch(endpoint, { method: "DELETE", headers: { cookie: assistant } })).status, 403);
  assert.equal((await fetch(endpoint.replace("/police/", "/fire/"), { method: "DELETE", headers: { cookie: admin } })).status, 403);
  await updateMockState((state) => {
    const score = state.morningExamScoresByDivision.police.find((row) => row.examTypeId === "import-http-morning")!;
    score.score = 37;
    score.notes = "수기로 수정";
    score.updatedAt = new Date(Date.now() + 1000).toISOString();
  });
  const removed = await fetch(endpoint, { method: "DELETE", headers: { cookie: admin } });
  assert.equal(removed.status, 200, await removed.clone().text());
  const { result } = await removed.json();
  assert.equal(result.removedStudents, 5);
  assert.equal(result.keptManualScores, 1);
  const state = await readMockState();
  const kept = state.morningExamScoresByDivision.police.filter((row) => row.examTypeId === "import-http-morning");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].score, 37);
  assert.equal(state.examItemResponsesByDivision.police.some((row) => row.sessionId === history[0].sessionId), false);
  assert.equal((await fetch(endpoint, { method: "DELETE", headers: { cookie: admin } })).status, 404);
  // Restore this test-owned fixture for the subsequent analysis suite.
  const restored = await fetch(url, { method: "POST", headers: { cookie: admin }, body: upload("MORNING", "import-http-morning", true) });
  assert.equal(restored.status, 201, await restored.clone().text());
});
