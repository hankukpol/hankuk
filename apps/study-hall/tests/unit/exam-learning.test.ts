import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { RegularRawSource } from "../../lib/exam-analysis-types";
import {
  emptyLearningDocument,
  learningMutationSchema,
  policyAt,
  type LearningCommand,
  type LearningPolicy,
} from "../../lib/exam-preview/learning-types";
import {
  applyLearningCommand,
  itemIdentity,
} from "../../lib/exam-preview/learning-mutations";
import { buildLearningPayload } from "../../lib/exam-preview/learning-report";
import {
  topicAnalytics,
  subjectPriorities,
} from "../../lib/exam-preview/learning-analytics";
import { totalHistory } from "../../lib/exam-preview/total-history";
import { progressAnswers } from "../../lib/exam-preview/metrics";
import { previewJson } from "../../lib/exam-preview/json-response";
import { gunzipSync } from "node:zlib";
import { learningChangeRows } from "../../lib/exam-preview/learning-preview";

test("large private preview JSON is compressed without changing analytical data", async () => {
  const data = {
    rows: Array.from({ length: 100 }, (_, id) => ({
      id,
      text: "헌법 진도별 학습 기록",
    })),
  };
  const response = await previewJson(
    { headers: new Headers({ "accept-encoding": "br, gzip" }) },
    data,
  );
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Accept-Encoding");
  assert.deepEqual(
    JSON.parse(
      gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"),
    ),
    data,
  );
});

test("clients declining gzip receive the same plain JSON", async () => {
  const data = { text: "학습 결과".repeat(300) };
  for (const encoding of ["", "gzip;q=0, br", "identity"]) {
    const response = await previewJson(
      { headers: new Headers({ "accept-encoding": encoding }) },
      data,
    );
    assert.equal(response.headers.get("content-encoding"), null);
    assert.deepEqual(await response.json(), data);
  }
});

function fixture(): RegularRawSource {
  const make = (id: string, category: "MORNING" | "REGULAR") => ({
    id,
    name: id,
    category,
    subjects: [
      {
        id: id + "-a",
        name: "과목",
        totalItems: 3,
        pointsPerItem: 5,
        isActive: true,
        alternateGroup: null,
      },
    ],
  });
  const types = [make("m", "MORNING"), make("r", "REGULAR")];
  const sessions = types.map((t, i) => ({
    id: t.id + "-s",
    divisionId: "d",
    examTypeId: t.id,
    examDate: i ? "2026-09-16" : "2026-09-10",
    primarySubjectId: i ? null : t.id + "-a",
    topic: "범위",
    fullScore: 15,
    itemCount: 3,
    externalCohortSize: 4,
    externalStats: {
      count: 4,
      mean: 10,
      distribution: [
        { score: 15, count: 1 },
        { score: 10, count: 2 },
        { score: 5, count: 1 },
      ],
      subjects: {
        [t.id + "-a"]: {
          count: 4,
          mean: 10,
          distribution: [
            { score: 15, count: 1 },
            { score: 10, count: 2 },
            { score: 5, count: 1 },
          ],
          top10Avg: 15,
          top30Avg: 12.5,
          top10Complete: true,
          top30Complete: true,
        },
      },
    },
  }));
  return {
    divisionId: "d",
    examTypes: types,
    sessions,
    students: [
      { id: "me", divisionId: "d", name: "학생", studentNumber: "01" },
      { id: "other", divisionId: "d", name: "다른 학생", studentNumber: "02" },
    ],
    participants: sessions.map((s) => ({
      divisionId: "d",
      sessionId: s.id,
      studentId: "me",
      region: null,
      subjectScores: { [s.examTypeId + "-a"]: 10 },
      totalScore: 10,
      isPartial: false,
      externalRank: 2,
      externalPercentile: null,
      regionalRank: null,
    })),
    items: sessions.flatMap((s) =>
      [1, 2, 3].map((itemNo) => ({
        divisionId: "d",
        sessionId: s.id,
        subjectId: s.examTypeId + "-a",
        itemNo,
        position: itemNo,
        answerKey: "1",
        points: 5,
        correctRatePct: itemNo === 3 ? Number.NaN : 80,
        choiceRates: { "1": 80, "2": 20 },
        mostCommonWrong: "2",
      })),
    ),
    responses: sessions.flatMap((s) =>
      [1, 2, 3].map((itemNo) => ({
        divisionId: "d",
        sessionId: s.id,
        studentId: "me",
        subjectId: s.examTypeId + "-a",
        itemNo,
        answer: itemNo === 2 ? null : "2",
        isCorrect: false,
      })),
    ),
    targets: [],
  };
}
const admin = { id: "admin", role: "ADMIN" as const },
  student = { id: "me", role: "STUDENT" as const, studentId: "me" },
  stamp = "2026-09-16T03:00:00.000Z";
const policy: LearningPolicy = {
  minItems: 2,
  minSessions: 1,
  weakGap: 10,
  lowCorrectRate: 70,
  repeatWrongSessions: 2,
  timeTracking: true,
  timeLimits: { r: 100 },
};
function setup() {
  const source = fixture();
  let doc = emptyLearningDocument("d");
  const apply = (c: LearningCommand, at = stamp) => {
    doc = applyLearningCommand(
      doc,
      source,
      c,
      admin,
      doc.revision,
      randomUUID(),
      at,
    );
  };
  apply({ action: "subject", name: "공통 과목", subjectIds: ["m-a", "r-a"] });
  apply({
    action: "topic",
    subjectGroupId: doc.subjects[0].id,
    parentId: null,
    name: "대단원",
    code: "A",
    active: true,
  });
  apply({
    action: "topic",
    subjectGroupId: doc.subjects[0].id,
    parentId: doc.topics[0].id,
    name: "세부 진도",
    code: "A1",
    active: true,
  });
  const topicId = doc.topics[1].id;
  apply({ action: "assign", topicId, itemIds: source.items.map(itemIdentity) });
  apply({ action: "policy", effectiveFrom: "2026-09-01", value: policy });
  return { source, doc, topicId };
}

test("mapped but untaken exams retain topic coverage without inventing wrong answers", () => {
  const { source, doc, topicId } = setup();
  source.participants = source.participants.filter(
    (p) => p.sessionId !== "m-s",
  );
  source.responses = source.responses.filter((r) => r.sessionId !== "m-s");
  doc.plans.push({
    id: "future",
    date: "2100-09-30",
    examTypeId: "m",
    topicId,
  });
  const payload = buildLearningPayload(source, doc, "me");
  assert.equal(
    payload.topicSessions.find((s) => s.sessionId === "m-s")?.itemCount,
    3,
  );
  assert.equal(payload.items.filter((i) => i.sessionId === "m-s").length, 0);
  const row = topicAnalytics(
    payload,
    "m",
    "m-a",
    "2026-09-01",
    "2100-09-30",
    false,
  )[0];
  assert.equal(row.status, "미응시 / 채점 자료 없음");
  assert.equal(row.registeredSessions, 1);
  assert.equal(row.wrong.length, 0);
  assert.equal(row.count, 0);
  source.sessions[0].examDate = "2100-09-10";
  const future = topicAnalytics(
    buildLearningPayload(source, doc, "me"),
    "m",
    "m-a",
    "2100-09-01",
    "2100-09-30",
    false,
  )[0];
  assert.equal(future.status, "학습 예정");
});

test("policy preview compares the selected effective date and includes removed time limits", () => {
  const { source, doc } = setup();
  doc.policies.push({
    id: "future",
    effectiveFrom: "2026-10-01",
    value: { ...policy, minItems: 30, timeLimits: { r: 90 } },
    at: stamp,
    actor: "admin",
  });
  const rows = learningChangeRows(
    buildLearningPayload(source, doc, undefined, true),
    {
      action: "policy",
      effectiveFrom: "2026-10-10",
      value: { ...policy, minItems: 15, timeLimits: {} },
    },
  );
  assert.deepEqual(
    rows.find((r) => r[0] === "최소 비교 문항 수"),
    ["최소 비교 문항 수", "30", "15"],
  );
  assert.deepEqual(
    rows.find((r) => r[0] === "r 제한 시간"),
    ["r 제한 시간", "90분", "미설정"],
  );
});

test("topic edits and bulk mapping preview expose each old and new value", () => {
  const { source, doc, topicId } = setup();
  const payload = buildLearningPayload(source, doc, undefined, true);
  const topic = doc.topics.find((t) => t.id === topicId)!;
  const rows = learningChangeRows(payload, {
    action: "topic",
    ...topic,
    name: "변경된 진도",
  });
  assert.deepEqual(
    rows.find((r) => r[0] === "진도명"),
    ["진도명", "세부 진도", "변경된 진도"],
  );
  const mapped = learningChangeRows(payload, {
    action: "assign",
    topicId: null,
    itemIds: source.items.slice(0, 2).map(itemIdentity),
  });
  assert.equal(mapped.length, 2);
  assert.ok(mapped[0][0].includes("1번") && mapped[1][0].includes("2번"));
  assert.ok(mapped.every((r) => r[1] === "세부 진도" && r[2] === "미연결"));
});

test("learning policy validates finite thresholds, dates, explicit settings and effective dates", () => {
  assert.equal(
    learningMutationSchema.safeParse({
      revision: 0,
      requestId: randomUUID(),
      command: { action: "policy", effectiveFrom: "2026-02-30", value: policy },
    }).success,
    false,
  );
  const { doc } = setup();
  assert.equal(policyAt(doc, "2026-08-31"), null);
  assert.equal(policyAt(doc, "2026-09-01")?.minItems, 2);
  assert.equal(policyAt(emptyLearningDocument("other"), "2026-09-16"), null);
});
test("tenant ownership, cross-subject mapping and student administrative writes are denied atomically", () => {
  const { source, doc, topicId } = setup(),
    copy = structuredClone(doc);
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        { ...source, divisionId: "foreign" },
        { action: "assign", topicId, itemIds: [itemIdentity(source.items[0])] },
        admin,
        doc.revision,
        randomUUID(),
      ),
    /다른 학원/,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        { action: "assign", topicId, itemIds: ["foreign-question"] },
        admin,
        doc.revision,
        randomUUID(),
      ),
    /현재 학원/,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        { action: "policy", effectiveFrom: "2026-09-16", value: policy },
        student,
        doc.revision,
        randomUUID(),
      ),
    /관리자/,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        {
          action: "plan",
          studentId: "other",
          itemIds: [itemIdentity(source.items[0])],
          dueDate: "2026-09-17",
        },
        student,
        doc.revision,
        randomUUID(),
      ),
    /본인/,
  );
  assert.deepEqual(doc, copy);
});
test("revision conflict prevents lost updates; identical retry does not append duplicate history", () => {
  const { source, doc } = setup(),
    requestId = randomUUID(),
    command: LearningCommand = {
      action: "plan",
      studentId: "me",
      itemIds: [itemIdentity(source.items[0])],
      dueDate: "2026-09-17",
    };
  const next = applyLearningCommand(
    doc,
    source,
    command,
    student,
    doc.revision,
    requestId,
    stamp,
  );
  assert.equal(next.reviews.length, 1);
  assert.equal(
    applyLearningCommand(
      next,
      source,
      command,
      student,
      doc.revision,
      requestId,
    ),
    next,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        next,
        source,
        command,
        student,
        doc.revision,
        randomUUID(),
      ),
    /다른 변경/,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        next,
        source,
        { ...command, dueDate: "2026-09-18" },
        student,
        next.revision,
        requestId,
      ),
    /같은 요청/,
  );
});
test("grading is server-derived; review plans, attempts and failures preserve original responses", () => {
  const { source, doc } = setup(),
    original = structuredClone(source),
    itemId = itemIdentity(source.items[0]);
  let next = doc;
  for (const answer of ["1", "2"])
    next = applyLearningCommand(
      next,
      source,
      { action: "attempt", studentId: "me", itemId, answer },
      student,
      next.revision,
      randomUUID(),
      stamp.replace("03:", answer === "1" ? "04:" : "05:"),
    );
  assert.deepEqual(
    next.reviews.map((r) => r.correct),
    [true, false],
  );
  assert.deepEqual(source, original);
  const analysis = topicAnalytics(
    buildLearningPayload(source, next, "me"),
    "m",
    "m-a",
    "2026-09-01",
    "2026-09-16",
    false,
  )[0];
  assert.equal(analysis.solved, 0);
  assert.equal(analysis.again, 1);
  assert.throws(
    () =>
      applyLearningCommand(
        next,
        source,
        { action: "attempt", studentId: "me", itemId, answer: "9" },
        student,
        next.revision,
        randomUUID(),
      ),
    /유효한 선택지/,
  );
});
test("unknown response or future exam cannot become a review or a recorded wrong answer", () => {
  const { source, doc } = setup(),
    itemId = itemIdentity(source.items[0]);
  source.responses = [];
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        { action: "attempt", studentId: "me", itemId, answer: "1" },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /채점 기록/,
  );
  const s = fixture();
  s.sessions[0].examDate = "2026-10-16";
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        s,
        { action: "attempt", studentId: "me", itemId, answer: "1" },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /시행하지 않은/,
  );
});
test("own wrong percentage includes blanks but not missing records; relative rates pair the same questions", () => {
  const { source, doc } = setup(),
    payload = buildLearningPayload(source, doc, "me"),
    analysis = topicAnalytics(
      payload,
      "m",
      "m-a",
      "2026-09-01",
      "2026-09-16",
      false,
    )[0];
  assert.equal(analysis.count, 3);
  assert.equal(analysis.pairedCount, 2);
  assert.equal(analysis.my, 0);
  assert.equal(analysis.external, 80);
  assert.equal(analysis.gap, -80);
  assert.equal(analysis.status, "우선 복습");
  const items = payload.items.filter((i) => i.kind === "MORNING");
  items.push({ ...items[0], id: "missing", correct: null });
  const result = progressAnswers(items);
  assert.equal(result.wrong.length, 3);
  assert.equal(result.unanswered.length, 1);
  assert.equal(result.wrongRate, 100);
  assert.equal(result.missing, 1);
});
test("insufficient samples and independent academy thresholds withhold judgments", () => {
  const { source, doc } = setup();
  doc.policies[0].value = { ...policy, minItems: 20, timeTracking: false };
  const row = topicAnalytics(
    buildLearningPayload(source, doc, "me"),
    "m",
    "m-a",
    "2026-09-01",
    "2026-09-16",
    false,
  )[0];
  assert.equal(row.status, "자료 부족");
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        {
          action: "time",
          studentId: "me",
          sessionId: "r-s",
          totalMinutes: 50,
          subjectMinutes: { "r-a": 50 },
          ranOut: false,
        },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /활성화/,
  );
});
test("transfer uses different regular questions after morning review and keeps attempts separate", () => {
  const { source, doc } = setup(),
    next = applyLearningCommand(
      doc,
      source,
      {
        action: "attempt",
        studentId: "me",
        itemId: itemIdentity(source.items[0]),
        answer: "1",
      },
      student,
      doc.revision,
      randomUUID(),
      "2026-09-12T03:00:00Z",
    );
  source.responses.find((r) => r.sessionId === "r-s")!.isCorrect = true;
  const payload = buildLearningPayload(source, next, "me");
  for (const [type, subject] of [
    ["m", "m-a"],
    ["r", "r-a"],
  ]) {
    const row = topicAnalytics(
      payload,
      type,
      subject,
      "2026-09-01",
      "2026-09-16",
      false,
    )[0];
    assert.deepEqual(row.transfer, { count: 3, correct: 1 });
  }
  assert.deepEqual(
    topicAnalytics(payload, "m", "m-a", "2026-09-01", "2026-09-11", false)[0]
      .transfer,
    { count: 0, correct: 0 },
  );
});
test("monthly and cumulative boundaries differ without fabricating missing exams", () => {
  const { source, doc } = setup();
  source.sessions[0].examDate = "2026-08-10";
  const payload = buildLearningPayload(source, doc, "me");
  assert.equal(
    topicAnalytics(payload, "m", "m-a", "2026-09-01", "2026-09-30", false)[0]
      .count,
    0,
  );
  assert.equal(
    topicAnalytics(payload, "m", "m-a", "2026-09-01", "2026-09-30", true)[0]
      .count,
    3,
  );
});

test("relative weakness requires enough sessions with paired question statistics", () => {
  const { source, doc, topicId } = setup();
  const payload = buildLearningPayload(source, doc, "me");
  payload.document.policies[0].value = { ...policy, minSessions: 2 };
  const extra = payload.items
    .filter((i) => i.kind === "MORNING")
    .map((i) => ({
      ...i,
      id: i.id + "-second",
      sessionId: "m-second",
      date: "2026-09-11",
      externalRate: null,
    }));
  for (const item of extra) payload.document.assignments[item.id] = topicId;
  payload.items.push(...extra);
  const analyze = () =>
    topicAnalytics(payload, "m", "m-a", "2026-09-01", "2026-09-30", false)[0];
  assert.equal(analyze().sessions, 2);
  assert.equal(analyze().status, "자료 부족");
  assert.equal(analyze().pairedSessions, 1);
  payload.items.find((i) => i.id === extra[0].id)!.externalRate = 80;
  assert.equal(analyze().pairedSessions, 2);
  assert.equal(analyze().status, "우선 복습");
});

test("policy audit uses the policy effective on the requested date, preserving future rules", () => {
  const { source, doc } = setup();
  const previous = structuredClone(doc.policies[0]);
  doc.policies.push({
    id: "future",
    effectiveFrom: "2026-10-01",
    value: { ...policy, minItems: 30 },
    at: stamp,
    actor: "admin",
  });
  const next = applyLearningCommand(
    doc,
    source,
    {
      action: "policy",
      effectiveFrom: "2026-09-12",
      value: { ...policy, minItems: 10 },
    },
    admin,
    doc.revision,
    randomUUID(),
    stamp,
  );
  assert.deepEqual(next.audit.at(-1)!.before, previous);
  assert.equal(policyAt(next, "2026-09-12")!.minItems, 10);
  assert.equal(policyAt(next, "2026-10-01")!.minItems, 30);
  assert.equal(doc.policies.length, 2);
});

test("ambiguous multiple answer keys never create an incorrect reattempt grade", () => {
  const { source, doc } = setup();
  source.items[0].answerKey = "1,2";
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        {
          action: "attempt",
          studentId: "me",
          itemId: itemIdentity(source.items[0]),
          answer: "1",
        },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /복수 정답/,
  );
  assert.equal(doc.reviews.length, 0);
  const next = applyLearningCommand(
    doc,
    source,
    {
      action: "plan",
      studentId: "me",
      itemIds: [itemIdentity(source.items[0])],
      dueDate: "2026-09-18",
    },
    student,
    doc.revision,
    randomUUID(),
    stamp,
  );
  assert.equal(next.reviews[0].action, "plan");
});
test("total history validates full cohort, competition ties and absence rather than adding subject means", () => {
  const source = fixture();
  let row = totalHistory(source, "r", "me", "2026-04-01", "2026-09-16")[0];
  assert.equal(row.external, 10);
  assert.equal(row.rank, 2);
  assert.equal(row.topPercent, 50);
  assert.equal(row.count, 4);
  source.participants[1].totalScore = 5;
  row = totalHistory(source, "r", "me", "2026-04-01", "2026-09-16")[0];
  assert.equal(row.rank, 4);
  (source.sessions[1].externalStats as { count: number }).count = 99;
  row = totalHistory(source, "r", "me", "2026-04-01", "2026-09-16")[0];
  assert.equal(row.external, null);
  assert.equal(row.count, null);
  assert.equal(row.rank, null);
  source.participants[1].isPartial = true;
  assert.equal(
    totalHistory(source, "r", "me", "2026-04-01", "2026-09-16")[0].my,
    null,
  );
});
test("time records validate subject membership and totals, then append safely", () => {
  const { source, doc } = setup();
  const command: LearningCommand = {
    action: "time",
    studentId: "me",
    sessionId: "r-s",
    totalMinutes: 90,
    subjectMinutes: { "r-a": 80 },
    ranOut: true,
  };
  const next = applyLearningCommand(
    doc,
    source,
    command,
    student,
    doc.revision,
    randomUUID(),
    stamp,
  );
  assert.equal(next.times[0].totalMinutes, 90);
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        { ...command, totalMinutes: 70 },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /합계/,
  );
  assert.throws(
    () =>
      applyLearningCommand(
        doc,
        source,
        { ...command, subjectMinutes: { foreign: 30 } },
        student,
        doc.revision,
        randomUUID(),
        stamp,
      ),
    /해당 시험/,
  );
});
test("personal payload contains only own review and time history, no roster or request ledger", () => {
  const { source, doc } = setup();
  doc.reviews.push({
    id: "other-r",
    studentId: "other",
    itemId: "x",
    action: "plan",
    dueDate: "2026-09-20",
    answer: null,
    correct: null,
    at: stamp,
    actor: "staff",
  });
  const payload = buildLearningPayload(source, doc, "me");
  assert.deepEqual(payload.document.reviews, []);
  assert.deepEqual(payload.document.audit, []);
  assert.deepEqual(payload.document.requests, []);
  assert.deepEqual(payload.mappingItems, []);
  assert.ok(!("students" in payload));
  assert.equal(subjectPriorities(payload, "r", "2026-09-16", 70)[0].loss, 15);
  const adminReport = buildLearningPayload(source, doc, "me", true);
  assert.deepEqual(adminReport.items, payload.items);
  assert.deepEqual(adminReport.mappingItems, []);
  assert.deepEqual(adminReport.document.audit, []);
  const configuration = buildLearningPayload(source, doc, undefined, true);
  assert.deepEqual(configuration.items, []);
  assert.equal(configuration.mappingItems.length, source.items.length);
  assert.deepEqual(configuration.document.audit, doc.audit);
});
