import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { shareInflight } from "../../lib/inflight";
import { loadWithMocks } from "../helpers/module-mocks";

// 서비스의 React cache() 는 Next 서버에서만 있다. 테스트에서는 그대로 부른다.
const react = { ...require("react"), cache: <T,>(fn: T) => fn };

// 2026-10-07 리팩토링(성능·안정성)에서 새로 생긴 동작을 지킨다.

test("shareInflight: 같은 키로 동시에 부르면 한 번만 읽고, 끝난 뒤에는 새로 읽는다", async () => {
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const load = shareInflight((slug: string) => slug, async (slug: string) => { loads++; await gate; return { slug, n: loads }; });

  const a = load("police"), b = load("police"), c = load("fire");
  release();
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.equal(ra, rb, "동시 호출은 같은 결과 객체를 나눠 쓴다");
  assert.notEqual(ra, rc, "다른 학원은 따로 읽는다");
  assert.equal(loads, 2);

  const later = await load("police");
  assert.equal(loads, 3, "끝난 뒤의 호출은 오래된 값을 돌려주지 않고 새로 읽는다");
  assert.notEqual(later, ra);
});

test("shareInflight: 실패한 읽기는 기억하지 않는다", async () => {
  let calls = 0;
  const load = shareInflight(() => "k", async () => { calls++; if (calls === 1) throw new Error("일시 오류"); return "ok"; });
  await assert.rejects(load(), /일시 오류/);
  assert.equal(await load(), "ok");
});

test("아침 주간 석차: 여러 주를 한 번에 읽은 결과가 주마다 따로 읽은 결과와 같다", async () => {
  const subject = (id: string, name: string) => ({ id, name, isActive: true, displayOrder: 0, totalItems: 20, pointsPerItem: 5 });
  const examType = { id: "m", name: "아침", category: "MORNING", studyTrack: null, isActive: true, subjects: [subject("a", "헌법"), subject("b", "형법")] };
  const students = [
    { id: "s1", name: "가", studentNumber: "1", status: "ACTIVE", studyTrack: null },
    { id: "s2", name: "나", studentNumber: "2", status: "ACTIVE", studyTrack: null },
    { id: "s3", name: "다", studentNumber: "3", status: "ACTIVE", studyTrack: null },
  ];
  const score = (studentId: string, subjectId: string, examDate: string, value: number | null, weekNumber: number) =>
    ({ studentId, examTypeId: "m", subjectId, examDate, score: value, weekYear: 2026, weekNumber });
  const state = {
    morningExamScoresByDivision: {
      police: [
        score("s1", "a", "2026-09-14", 80, 38), score("s2", "a", "2026-09-14", 90, 38), score("s3", "a", "2026-09-14", null, 38),
        score("s1", "b", "2026-09-15", 70, 38), score("s2", "b", "2026-09-15", 60, 38),
        score("s1", "a", "2026-09-21", 50, 39), score("s3", "a", "2026-09-21", 95, 39),
        score("s2", "b", "2026-09-28", 40, 40),
        { ...score("s1", "a", "2026-09-14", 99, 38), examTypeId: "other" },
      ],
    },
  };
  const { module: service, restore } = loadWithMocks<typeof import("../../lib/services/morning-exam.service")>(
    require.resolve("../../lib/services/morning-exam.service"),
    {
      react,
      "@/lib/mock-data": { isMockMode: () => true },
      "@/lib/mock-store": { readMockState: async () => state, updateMockState: async () => { throw new Error("읽기만 한다"); } },
      "@/lib/services/exam.service": { listExamTypes: async () => [examType] },
      "@/lib/services/student.service": { listStudents: async () => students },
    },
  );
  try {
    const weeks = [{ weekYear: 2026, weekNumber: 38 }, { weekYear: 2026, weekNumber: 39 }, { weekYear: 2026, weekNumber: 40 }, { weekYear: 2026, weekNumber: 41 }];
    const batch = await service.getMorningExamWeeklySummaries("police", "m", weeks);
    const single = await Promise.all(weeks.map((w) => service.getMorningExamWeeklySummary("police", "m", w.weekYear, w.weekNumber)));
    assert.deepEqual(batch, single);
    assert.equal(batch[3].rankings.every((r) => r.weeklyRank === null), true, "점수 없는 주도 같은 모양으로 돌려준다");
    assert.deepEqual(await service.getMorningExamWeeklySummaries("police", "m", []), []);
  } finally {
    restore();
  }
});

test("결제(목업): 환불은 남은 환불 가능액까지만, 환불이 걸린 원결제는 지울 수 없다", async () => {
  const state = {
    studentsByDivision: { police: [{ id: "s1", name: "가", studentNumber: "1", status: "ACTIVE", divisionId: "d1" }] },
    paymentCategoriesByDivision: { police: [{ id: "tuition", divisionId: "d1", name: "수강료", isActive: true, displayOrder: 0 }, { id: "refund", divisionId: "d1", name: "환불", isActive: true, displayOrder: 1 }] },
    paymentRecordsByDivision: { police: [] as Array<Record<string, unknown>> },
  };
  const { module: payment, restore } = loadWithMocks<typeof import("../../lib/services/payment.service")>(
    require.resolve("../../lib/services/payment.service"),
    {
      react,
      "@/lib/mock-data": { isMockMode: () => true, getMockAdminSession: () => ({ id: "admin", name: "관리자" }), getMockDivisionBySlug: () => ({ id: "d1", slug: "police" }) },
      "@/lib/mock-store": { readMockState: async () => state, updateMockState: async <T,>(fn: (s: typeof state) => T) => fn(state) },
      "@/lib/revalidation": { revalidateDivisionOperationalViews: () => undefined },
    },
  );
  try {
    const actor = { id: "admin", role: "ADMIN" as const };
    await payment.createPayment("police", actor as never, { studentId: "s1", paymentTypeId: "tuition", amount: 300000, paymentDate: "2026-09-03", method: "카드", notes: null } as never);
    const original = state.paymentRecordsByDivision.police.find((r) => r.amount === 300000)!;
    const refund = (amount: number) => payment.refundPayment("police", actor as never, { mode: "simple", studentId: "s1", refundPaymentTypeId: "refund", paymentDate: "2026-09-10", amount, originalPaymentId: original.id as string, method: "카드", notes: null });

    await refund(100000);
    // 잔액(20만 원)과 원결제의 남은 환불 가능액(20만 원)을 모두 넘는다. 어느 규칙이 먼저 막아도 "초과"다.
    await assert.rejects(refund(250000), /초과/, "이미 10만 원을 환불해 20만 원까지만 된다");
    await assert.rejects(payment.deletePayment("police", original.id as string), /환불 이력이 있는 원결제는 삭제할 수 없습니다/);

    const linked = state.paymentRecordsByDivision.police.find((r) => r.originalPaymentId === original.id)!;
    assert.equal(linked.amount, -100000);
    await payment.deletePayment("police", linked.id as string);
    await payment.deletePayment("police", original.id as string);
    assert.equal(state.paymentRecordsByDivision.police.length, 0);
  } finally {
    restore();
  }
});

test("결제 직렬화 충돌(P2034)은 한 번 다시 시도하고, 계속되면 409 로 알린다", async () => {
  const conflict = () => new Prisma.PrismaClientKnownRequestError("serialization failure", { code: "P2034", clientVersion: "test" });
  const { module: payment, restore } = loadWithMocks<typeof import("../../lib/services/payment.service")>(require.resolve("../../lib/services/payment.service"), { react });
  try {
    let calls = 0;
    assert.equal(await payment.withSerializableRetry(async () => { calls++; if (calls === 1) throw conflict(); return "saved"; }), "saved");
    assert.equal(calls, 2, "충돌 한 번은 다시 시도해 저장한다");

    calls = 0;
    await assert.rejects(payment.withSerializableRetry(async () => { calls++; throw conflict(); }), (error: unknown) => (error as { status?: number }).status === 409 && /다시 시도/.test((error as Error).message));
    assert.equal(calls, 2, "두 번째 충돌에서 멈춘다");

    calls = 0;
    await assert.rejects(payment.withSerializableRetry(async () => { calls++; throw new Error("다른 오류"); }), /다른 오류/);
    assert.equal(calls, 1, "충돌이 아닌 오류는 다시 시도하지 않는다");
  } finally {
    restore();
  }
});
