import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { Workbook, ValueType } from "exceljs";
import * as schemas from "../../lib/exam-analysis-export-schemas";

type Sheet = { name: string; header: string[]; rows: Array<Array<string | number | null>> };
const fixture = (): Sheet[] => [
  { name: "학생 석차", header: ["이름", "수험번호", "총점", "직전 대비"], rows: [["김학생", "00123", 87.5, null], ["=1+1", "00456", 0, -2.5]] },
  { name: "과목 평균", header: ["과목", "반 평균", "외부 평균"], rows: [["과목 가", 31.25, null], ["+문자", 0, 45]] },
  { name: "문항 분석", header: ["과목", "번호", "정답", "정답률"], rows: [["과목 가", 1, "3,4", 50], ["@문자", 2, "=SUM(A1:A2)", null]] },
];
type Options = {
  role?: "ADMIN" | "SUPER_ADMIN" | "ASSISTANT" | "STUDENT" | "ANONYMOUS";
  disabled?: "reporting" | "examManagement";
  fail?: "auth" | "feature" | "service" | "serialization";
  sheets?: Sheet[];
};
function load(options: Options = {}) {
  const calls = { auth: [] as unknown[][], features: [] as string[], service: [] as unknown[][], excel: 0, errors: [] as unknown[] };
  const sheets = options.sheets ?? fixture();
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse },
    "./api-auth": { requireApiAuth: async (division: string, roles: string[]) => {
      calls.auth.push([division, roles]);
      if (options.fail === "auth") throw new Error("PRIVATE_AUTH_DETAIL");
      const role = options.role ?? "ADMIN";
      return roles.includes(role) ? { ok: true, session: { role } }
        : { ok: false, status: role === "ANONYMOUS" || role === "STUDENT" ? 401 : 403, error: "접근할 수 없습니다." };
    } },
    "./division-feature-guard": { getDivisionFeatureDisabledError: async (division: string, feature: string) => {
      assert.equal(division, "tenant-a"); calls.features.push(feature);
      if (options.fail === "feature") throw new Error("PRIVATE_FEATURE_DETAIL");
      return feature === options.disabled ? "사용할 수 없는 기능입니다." : null;
    } },
    // Matches the shared error helper's private response contract; never serializes Error.message.
    "./api-error-response": { toApiErrorResponse: (error: unknown, fallback: string, status: number) => {
      calls.errors.push(error);
      return NextResponse.json({ error: fallback }, { status: error && typeof error === "object" && "issues" in error ? 400 : status, headers: { "Cache-Control": "private, no-store" } });
    } },
    "./exam-analysis-export-schemas": schemas,
    "./services/exam-analysis-export.service": { getExamAnalysisExportRows: async (...args: unknown[]) => {
      calls.service.push(args);
      if (options.fail === "service") throw new Error("PRIVATE_DB_SQL_DETAIL");
      return { sheets };
    } },
    exceljs: { Workbook: options.fail === "serialization" ? class extends Workbook {
      constructor() { super(); this.xlsx.writeBuffer = async () => { throw new Error("PRIVATE_XLSX_DETAIL"); }; }
    } : Workbook },
  };
  const source = readFileSync(new URL("../../lib/exam-analysis-export-route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => {
    assert.ok(id in dependencies, `Unexpected real dependency: ${id}`);
    if (id === "exceljs") calls.excel++;
    return dependencies[id];
  }, module, module.exports);
  return { api: module.exports as { handleExamAnalysisExport(request: NextRequest, division: string): Promise<NextResponse> }, calls, sheets };
}
const request = (query = "kind=regular&examTypeId=t&examDate=2026-09-08") => new NextRequest(`http://localhost/api/tenant-a/reports/exam-analysis?${query}`);
const privateResponse = (response: Response) => assert.equal(response.headers.get("cache-control"), "private, no-store");

for (const role of ["ADMIN", "SUPER_ADMIN"] as const) test(`${role} exports a real three-sheet XLSX preserving names, literals, numbers and nullable blanks`, async () => {
  const h = load({ role }), original = structuredClone(h.sheets);
  const response = await h.api.handleExamAnalysisExport(request(), "tenant-a");
  assert.equal(response.status, 200); privateResponse(response);
  assert.equal(response.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="exam-analysis-regular-2026-09-08.xlsx"');
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(h.calls.auth, [["tenant-a", ["ADMIN", "SUPER_ADMIN"]]]);
  assert.deepEqual(h.calls.features, ["reporting", "examManagement"]);
  assert.deepEqual(h.calls.service, [["tenant-a", { kind: "regular", examTypeId: "t", examDate: "2026-09-08" }]]);
  assert.equal(h.calls.excel, 1);
  const workbook = new Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  assert.deepEqual(workbook.worksheets.map(s => s.name), original.map(s => s.name));
  for (let index = 0; index < original.length; index++) {
    const expected = original[index], sheet = workbook.worksheets[index];
    assert.equal(sheet.rowCount, expected.rows.length + 1);
    assert.equal(sheet.columnCount, expected.header.length);
    for (const [rowIndex, values] of Array.from([expected.header, ...expected.rows].entries())) {
      for (const [columnIndex, value] of Array.from(values.entries())) {
        const cell = sheet.getCell(rowIndex + 1, columnIndex + 1);
        assert.equal(cell.value, value);
        assert.notEqual(cell.type, ValueType.Formula);
        if (typeof value === "string") assert.equal(cell.type, ValueType.String);
        if (typeof value === "number") assert.equal(cell.type, ValueType.Number);
      }
    }
    assert.equal(sheet.getRow(1).font.bold, true);
    assert.equal(sheet.views[0].state, "frozen");
  }
  assert.deepEqual(h.sheets, original);
});

test("morning export forwards exact range, includes both dates in filename and retains three empty sheets", async () => {
  const h = load({ sheets: fixture().map(s => ({ ...s, rows: [] })) });
  const response = await h.api.handleExamAnalysisExport(request("kind=morning&examTypeId=t&from=2026-01-01&to=2026-04-03"), "tenant-a");
  assert.equal(response.status, 200); privateResponse(response);
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="exam-analysis-morning-2026-01-01_2026-04-03.xlsx"');
  assert.deepEqual(h.calls.service, [["tenant-a", { kind: "morning", examTypeId: "t", from: "2026-01-01", to: "2026-04-03" }]]);
  const workbook = new Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
  assert.equal(workbook.worksheets.length, 3);
  assert.ok(workbook.worksheets.every(s => s.rowCount === 1));
});

for (const [role, status] of [["ASSISTANT", 403], ["STUDENT", 401], ["ANONYMOUS", 401]] as const) test(`${role} rejected before features, service or ExcelJS`, async () => {
  const h = load({ role }), response = await h.api.handleExamAnalysisExport(request(), "tenant-a");
  assert.equal(response.status, status); privateResponse(response);
  assert.deepEqual(h.calls.features, []); assert.deepEqual(h.calls.service, []); assert.equal(h.calls.excel, 0);
  assert.equal(response.headers.get("content-disposition"), null);
});

for (const disabled of ["reporting", "examManagement"] as const) test(`${disabled} feature blocks downloads`, async () => {
  const h = load({ disabled }), response = await h.api.handleExamAnalysisExport(request(), "tenant-a");
  assert.equal(response.status, 403); privateResponse(response);
  assert.deepEqual(h.calls.features, disabled === "reporting" ? ["reporting"] : ["reporting", "examManagement"]);
  assert.deepEqual(h.calls.service, []); assert.equal(h.calls.excel, 0);
});

test("unknown kinds, invalid dates and out-of-bounds ranges fail before loading rows", async () => {
  for (const query of [
    "", "kind=unknown&examTypeId=t", "kind=regular&examTypeId=t", "kind=regular&examTypeId=%20&examDate=2026-09-08",
    "kind=regular&examTypeId=t&examDate=2026-02-29", "kind=regular&examTypeId=t&examDate=2026-09-08%0D%0Afoo",
    "kind=morning&examTypeId=t&from=2026-09-01", "kind=morning&examTypeId=t&from=2026-02-30&to=2026-03-01",
    "kind=morning&examTypeId=t&from=2026-09-02&to=2026-09-01", "kind=morning&examTypeId=t&from=2026-01-01&to=2026-04-04",
  ]) {
    const h = load(), response = await h.api.handleExamAnalysisExport(request(query), "tenant-a");
    assert.equal(response.status, 400, query); privateResponse(response);
    assert.deepEqual(h.calls.service, []); assert.equal(h.calls.excel, 0);
    assert.equal(response.headers.get("content-disposition"), null);
  }
});

for (const fail of ["auth", "feature", "service", "serialization"] as const) test(`${fail} exceptions remain contained in a private JSON response`, async () => {
  const h = load({ fail }), response = await h.api.handleExamAnalysisExport(request(), "tenant-a");
  assert.equal(response.status, 500); privateResponse(response);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("content-disposition"), null);
  const body = await response.json();
  assert.equal(body.error, "성적 분석 파일을 만들지 못했습니다.");
  assert.ok(!JSON.stringify(body).includes("PRIVATE_"));
  assert.equal(h.calls.errors.length, 1);
});
