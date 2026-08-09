import assert from "node:assert/strict";
import {
  ActiveExamInvariantError,
  isNewActiveExamTransition,
  PastExamWriteError,
  requireSoleActiveExam,
  resolveActiveExamForWrite,
} from "../src/lib/active-exam";
import { SITE_FEATURE_FLOW_SETTING_KEYS } from "../src/app/admin/site/_lib/site-settings-sections";

type FakeExam = {
  id: number;
  name: string;
  year: number;
  round: number;
  examDate: Date;
  isActive: boolean;
};

function fakeDb(exams: FakeExam[]) {
  return {
    exam: {
      findMany: async () => exams.filter((exam) => exam.isActive),
    },
  };
}

const roundOne: FakeExam = {
  id: 1,
  name: "2026년 1차",
  year: 2026,
  round: 1,
  examDate: new Date("2026-03-14T00:00:00.000Z"),
  isActive: false,
};
const roundTwo: FakeExam = {
  id: 2,
  name: "2026년 2차",
  year: 2026,
  round: 2,
  examDate: new Date("2026-08-22T00:00:00.000Z"),
  isActive: true,
};

async function expectRejectsWith(
  action: () => Promise<unknown>,
  errorType: typeof ActiveExamInvariantError | typeof PastExamWriteError
) {
  await assert.rejects(action, (error: unknown) => error instanceof errorType);
}

async function main() {
  assert(
    isNewActiveExamTransition(false, true),
    "inactive-to-active transition must initialize the new round"
  );
  assert(
    !isNewActiveExamTransition(true, true),
    "editing an already-active exam must not reset live operation settings"
  );
  assert(
    !isNewActiveExamTransition(true, undefined),
    "editing active exam metadata must not reset live operation settings"
  );
  assert(
    SITE_FEATURE_FLOW_SETTING_KEYS.includes("site.policePredictionGradesEnabled"),
    "the police prediction-grade switch must be accepted by the admin feature settings API"
  );
  const policeDb = fakeDb([roundOne, roundTwo]);
  const fireDb = fakeDb([
    { ...roundOne, id: 101 },
    { ...roundTwo, id: 102, name: "2026년 소방 시험" },
  ]);

  const resolvedPolice = await resolveActiveExamForWrite({
    db: policeDb as never,
    tenantType: "police",
    context: "test/police/missing-exam-id",
    requestedExamId: null,
  });
  assert.equal(resolvedPolice.id, 2, "경찰 누락 examId는 경찰의 유일 활성 회차로 보정해야 합니다.");

  const resolvedFire = await requireSoleActiveExam({
    db: fireDb as never,
    tenantType: "fire",
    context: "test/fire/independent-active-exam",
  });
  assert.equal(resolvedFire.id, 102, "소방 활성 회차는 경찰 활성 회차와 독립적으로 결정해야 합니다.");

  await expectRejectsWith(
    () =>
      resolveActiveExamForWrite({
        db: policeDb as never,
        tenantType: "police",
        context: "test/police/past-write",
        requestedExamId: 1,
      }),
    PastExamWriteError
  );

  await expectRejectsWith(
    () =>
      requireSoleActiveExam({
        db: fakeDb([]) as never,
        tenantType: "police",
        context: "test/police/no-active",
      }),
    ActiveExamInvariantError
  );

  await expectRejectsWith(
    () =>
      resolveActiveExamForWrite({
        db: fakeDb([
          { ...roundTwo, id: 2, isActive: true },
          { ...roundOne, id: 3, isActive: true },
        ]) as never,
        tenantType: "police",
        context: "test/police/two-active",
        requestedExamId: null,
      }),
    ActiveExamInvariantError
  );

  console.log("exam-lifecycle-test: passed");
}

void main();
