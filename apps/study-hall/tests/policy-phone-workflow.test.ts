import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import * as mockData from "../lib/mock-data";
import * as dates from "../lib/date-utils";
import * as policyMeta from "../lib/management-policy";
import * as schemas from "../lib/phone-submission-schemas";
import { mapPolicy } from "../scripts/restart-police-policy";
import { loadWithMocks } from "./helpers/module-mocks";
import type { StudentListItem } from "../lib/services/student.service";
import type { PeriodRecord } from "../lib/services/period.service";

type PhoneService = typeof import("../lib/services/phone-submission.service");
type Store = typeof import("../lib/mock-store");
type ReviewService = typeof import("../lib/services/policy-review.service");
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "docs/policies/restart-police-v3.1.json"), "utf8"));
const date = "2026-09-08";
const assistant = { id: "mock-assistant-police", role: "ASSISTANT" as const };
const manager = { id: "mock-admin-police", role: "ADMIN" as const };

// The service and mock persistence are real. Only app/DB boundaries and the service
// clock are replaced; no .local/.mock-data file in the checkout is read or written.
async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "study-hall-phone-policy-"));
  const previousCwd = process.cwd();
  let loaded: ReturnType<typeof loadWithMocks<Store>>;
  try {
    process.chdir(directory);
    loaded = loadWithMocks<Store>(path.join(sourceRoot, "lib/mock-store.ts"), {});
  } finally {
    process.chdir(previousCwd);
  }
  t.after(async () => { loaded.restore(); await rm(directory, { recursive: true, force: true }); });
  const store = loaded.module;
  const initial = await store.readMockState();
  const students = initial.studentsByDivision.police.slice(0, 2).map((s) => ({ ...s, status: "ACTIVE" as const })) as unknown as StudentListItem[];
  const periods: PeriodRecord[] = manifest.periods.map((p: PeriodRecord) => ({ ...p, id: p.startTime, divisionId: "police", isActive: true }));
  const policy = mapPolicy(manifest, periods);
  policy.optionalEnrollments = [{ studentId: students[0].id, periodId: "18:15", dateFrom: date, dateTo: date, weekdays: [2] }];
  await store.updateMockState((state) => {
    state.phoneSubmissionsByDivision.police = [];
    state.attendanceByDivision.police = [];
    state.pointRecordsByDivision.police = [];
  });
  let now = new Date(`${date}T09:30:00+09:00`).getTime();
  let attendanceEnabled = false;
  class Clock extends Date {
    constructor(value?: string | number | Date) { super(value === undefined ? now : value instanceof Date ? value.getTime() : value); }
    static now() { return now; }
  }
  const dependencies: Record<string, unknown> = {
    "@/lib/mock-data": { ...mockData, isMockMode: () => true },
    "@/lib/mock-store": store,
    "@/lib/date-utils": dates,
    "@/lib/management-policy": { ...policyMeta, kstDate: (value = new Clock()) => policyMeta.kstDate(value), kstMonthBounds: () => policyMeta.kstMonthBounds(new Clock()) },
    "@/lib/phone-submission-schemas": schemas,
    "@/lib/errors": { badRequest: (message: string) => new Error(message), notFound: (message: string) => new Error(message) },
    "@/lib/revalidation": { revalidateDivisionOperationalViews() {} },
    "@/lib/service-helpers": { getPrismaClient() { throw new Error("Real DB access forbidden in this fixture"); } },
    "@/lib/services/student.service": { listStudents: async (slug: string) => slug === "police" ? students : [] },
    "@/lib/services/period.service": { getPeriods: async () => periods },
    "@/lib/services/settings.service": { getDivisionFeatureSettings: async () => ({ featureFlags: { attendanceManagement: attendanceEnabled } }) },
    "@/lib/services/management-policy.service": { getManagementPolicy: async (slug: string) => slug === "police" ? policy : null },
  };
  function load<T>(name: string): T {
    const source = readFileSync(path.join(sourceRoot, `lib/services/${name}.service.ts`), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const target = { exports: {} };
    new Function("require", "module", "exports", "Date", code)((id: string) => {
      if (!(id in dependencies)) throw new Error(`Unmocked dependency: ${id}`);
      return dependencies[id];
    }, target, target.exports, Clock);
    return target.exports as T;
  }
  const service = load<PhoneService>("phone-submission");
  const review = load<ReviewService>("policy-review");
  const input = (record: Partial<schemas.PhoneSubmissionBatchSchemaInput["records"][number]> = {}, overrides: Partial<schemas.PhoneSubmissionBatchSchemaInput> = {}) => ({
    date, periodId: "09:15", records: [{ studentId: students[0].id, status: "RENTED" as const, rentalNote: "본인인증", ...record }], ...overrides,
  });
  const records = async () => (await store.readMockState()).phoneSubmissionsByDivision.police;
  return { service, review, store, students, policy, dependencies, load, input, records,
    setTime: (time: string) => { now = new Date(time).getTime(); },
    enableAttendance: () => { attendanceEnabled = true; },
  };
}

test("short loan requires a reason, records the configured deadline, and return retains history without charging points", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ rentalNote: " " })), /사유/);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  assert.match((await f.records())[0].rentalNote!, /5층 지정공간 \/ 반납기한 2026-09-08T00:40:00.000Z/);
  f.setTime(`${date}T09:43:00+09:00`); // overdue is evidence for staff, never an automatic charge
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED", rentalNote: undefined }));
  const record = (await f.records())[0];
  assert.equal(record.status, "SUBMITTED");
  assert.match(record.rentalNote!, /\[반납 2026-09-08T00:43:00.000Z\]/);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "NOT_SUBMITTED" }));
  assert.deepEqual((await f.store.readMockState()).pointRecordsByDivision.police, []);
});

test("assistant cannot self-approve a new or already active loan", async (t) => {
  const f = await fixture(t);
  const loanApproval = { until: `${date}T10:00:00+09:00`, place: "6층 상담실", purpose: "긴급 연락" };
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ loanApproval })), /관리자/);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  const before = await f.records();
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ loanApproval })), /관리자/);
  assert.deepEqual(await f.records(), before);
});

test("manager approval of an active short loan records purpose, place and deadline without counting a second release", async (t) => {
  const f = await fixture(t);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  f.setTime(`${date}T09:35:00+09:00`);
  await f.service.upsertPhoneCheckBatch("police", manager, f.input({ loanApproval: { until: `${date}T10:00:00+09:00`, place: "6층 상담실", purpose: "긴급 연락" } }));
  const note = (await f.records())[0].rentalNote!;
  assert.match(note, /6층 상담실 \/ 목적 긴급 연락 \/ 승인자 mock-admin-police/);
  assert.match(note, /반납기한 2026-09-08T01:00:00.000Z/);
  assert.equal(Array.from(note.matchAll(/\[반출 /g)).length, 1);
});

test("manager approval validates current date, future deadline and closing time even on an active loan", async (t) => {
  const f = await fixture(t);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  for (const until of [`${date}T09:29:00+09:00`, `${date}T22:01:00+09:00`]) {
    await assert.rejects(f.service.upsertPhoneCheckBatch("police", manager, f.input({ loanApproval: { until, place: "6층", purpose: "긴급 연락" } })), /종료시각/);
  }
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({}, { date: "2026-09-09" })), /오늘|당일/);
});

test("a new exception cannot re-import old history as its reason or forge release markers", async (t) => {
  const f = await fixture(t);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED" }));
  const history = (await f.records())[0].rentalNote!;
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ rentalNote: history })), /사유|기록/);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ rentalNote: "본인인증 [반출 invalid]" })), /사유|기록/);
  for (let i = 0; i < 2; i++) {
    await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ rentalNote: "긴급 연락" }));
    await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED" }));
  }
  assert.equal(Array.from((await f.records())[0].rentalNote!.matchAll(/\[반출 /g)).length, 3);
  assert.equal((await f.review.getPolicyReviewSignals("police")).filter((r) => /휴대폰/.test(r.reason)).length, 1);
});

test("optional fifth-period enrollment, Saturday and Sunday exemption hold with attendance integration disabled", async (t) => {
  const f = await fixture(t);
  const fifth = (await f.service.getPhoneDaySnapshot("police", date)).periods.find((p) => p.periodId === "18:15")!;
  assert.equal(fifth.checkableStudentCount, 1);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ studentId: f.students[1].id, status: "NOT_SUBMITTED" }, { periodId: "18:15" })), /대상/);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED" }, { periodId: "18:15" }));
  const sunday = await f.service.getPhoneDaySnapshot("police", "2026-09-13");
  assert.ok(sunday.periods.every((p) => p.checkableStudentCount === 0 && p.uncheckedCount === 0));
  const saturday = await f.service.getPhoneDaySnapshot("police", "2026-09-12");
  assert.equal(saturday.periods.find((p) => p.periodId === "18:15")!.checkableStudentCount, 0);
  assert.equal(saturday.periods.find((p) => p.periodId === "09:15")!.checkableStudentCount, 2);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "NOT_SUBMITTED" }, { date: "2026-09-13" })), /대상/);
});

test("bulk long rental and foreign students cannot alter either division", async (t) => {
  const f = await fixture(t);
  const before = (await f.store.readMockState()).phoneSubmissionsByDivision;
  await assert.rejects(f.service.applyPhoneBulkRental("police", manager, { date, studentIds: [f.students[0].id], startPeriodId: "09:15", endPeriodId: "18:15", rentalNote: "인강" }), /허용하지/);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input({ studentId: "foreign-student", status: "NOT_SUBMITTED" })), /대상/);
  assert.deepEqual((await f.store.readMockState()).phoneSubmissionsByDivision, before);
});

test("duplicate student cells are rejected before any write", async (t) => {
  const f = await fixture(t);
  const input = f.input();
  input.records.push({ ...input.records[0], status: "SUBMITTED" });
  assert.equal(schemas.phoneSubmissionBatchSchema.safeParse(input).success, false);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, input), /중복/);
  assert.deepEqual(await f.records(), []);
});

test("approval is valid only for rented status", () => {
  const loanApproval = { until: `${date}T10:00:00+09:00`, place: "6층", purpose: "긴급 연락" };
  for (const status of ["SUBMITTED", "NOT_SUBMITTED", null]) {
    assert.equal(schemas.phoneSubmissionBatchSchema.safeParse({ date, periodId: "09:15", records: [{ studentId: "student", status, loanApproval }] }).success, false);
  }
});

test("actual return remains recordable after attendance changes to an approved absence", async (t) => {
  const f = await fixture(t);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  f.enableAttendance();
  await f.store.updateMockState((state) => {
    state.attendanceByDivision.police = [{ id: "approved-leave", studentId: f.students[0].id, periodId: "09:15", date, status: "EXCUSED", reason: "승인된 외출", checkInTime: null, recordedById: manager.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  });
  const outstanding = (await f.service.listPhoneRecords("police", { dateFrom: date, dateTo: date, status: "RENTED" }))
    .filter((record) => !record.attendanceCheckable);
  assert.equal(outstanding.length, 1);
  assert.equal(outstanding[0].studentId, f.students[0].id);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED", rentalNote: undefined }));
  const record = (await f.records())[0];
  assert.equal(record.status, "SUBMITTED");
  assert.match(record.rentalNote!, /\[반출 /);
  assert.match(record.rentalNote!, /\[반납 /);
  assert.deepEqual(await f.service.listPhoneRecords("police", { dateFrom: date, dateTo: date, status: "RENTED" }), []);
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", assistant, f.input()), /출석/);
});

test("DB branch preserves the same loan, approval and return evidence with explicit division write filters", async (t) => {
  const f = await fixture(t);
  type DbRecord = Omit<Awaited<ReturnType<typeof f.records>>[number], "date" | "createdAt" | "updatedAt"> & { date: Date; createdAt: Date; updatedAt: Date };
  const rows = new Map<string, DbRecord>();
  let writes = 0;
  const prisma = {
    phoneSubmission: {
      findMany: async ({ where }: { where: { divisionId: string } }) => {
        assert.equal(where.divisionId, "police");
        return Array.from(rows.values());
      },
      upsert: async ({ where, create, update }: { where: { divisionId: string; studentId_date_periodId: { studentId: string } }; create: DbRecord; update: Partial<DbRecord> }) => {
        assert.equal(where.divisionId, "police");
        assert.equal(create.divisionId, "police");
        writes++;
        const key = where.studentId_date_periodId.studentId;
        const previous = rows.get(key);
        const saved = previous ? { ...previous, ...update } : { ...create, id: `phone-${key}`, createdAt: new Date(), updatedAt: new Date() };
        rows.set(key, saved);
        return saved;
      },
      deleteMany: async ({ where }: { where: { divisionId: string; studentId: string } }) => {
        assert.equal(where.divisionId, "police");
        writes++;
        rows.delete(where.studentId);
        return { count: 1 };
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  f.dependencies["@/lib/mock-data"] = { ...mockData, isMockMode: () => false };
  f.dependencies["@/lib/service-helpers"] = { getPrismaClient: async () => prisma, getDivisionBySlugOrThrow: async () => ({ id: "police" }) };
  const service = f.load<PhoneService>("phone-submission");
  await service.upsertPhoneCheckBatch("police", assistant, f.input());
  const loanApproval = { until: `${date}T10:00:00+09:00`, place: "6층 상담실", purpose: "긴급 연락" };
  await assert.rejects(service.upsertPhoneCheckBatch("police", assistant, f.input({ loanApproval })), /관리자/);
  assert.equal(writes, 1);
  await service.upsertPhoneCheckBatch("police", manager, f.input({ loanApproval }));
  await service.upsertPhoneCheckBatch("police", assistant, f.input({ status: "SUBMITTED", rentalNote: undefined }));
  const record = Array.from(rows.values())[0];
  assert.equal(record.status, "SUBMITTED");
  assert.match(record.rentalNote!, /반납기한 2026-09-08T01:00:00.000Z/);
  assert.match(record.rentalNote!, /\[반납 /);
  assert.equal(Array.from(record.rentalNote!.matchAll(/\[반출 /g)).length, 1);
  await service.upsertPhoneCheckBatch("police", manager, f.input({ status: null }));
  assert.equal(rows.size, 0);
});

test("an overdue exception cannot be retrospectively extended as prior approval", async (t) => {
  const f = await fixture(t);
  await f.service.upsertPhoneCheckBatch("police", assistant, f.input());
  f.setTime(`${date}T09:41:00+09:00`);
  const before = await f.records();
  await assert.rejects(f.service.upsertPhoneCheckBatch("police", manager, f.input({ loanApproval: { until: `${date}T10:00:00+09:00`, place: "6층 상담실", purpose: "긴급 연락" } })), /기한|사전승인/);
  assert.deepEqual(await f.records(), before);
  assert.deepEqual((await f.store.readMockState()).pointRecordsByDivision.police, []);
});
