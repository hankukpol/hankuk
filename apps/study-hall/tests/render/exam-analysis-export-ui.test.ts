import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as schema from "../../lib/morning-exam-analysis-schemas";

const root = path.resolve(__dirname, "../..");
const file = "components/reports/ExamAnalysisExport.tsx";
// Exercise private UI functions in the VM without exposing test exports in production.
function load(overrides: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { fileName: file, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const loaded = { exports: {} as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  vm.runInNewContext(`${compiled.outputText}
Object.assign(exports, { DownloadFile, RegularExport, MorningExport, ExportSelection, useList });`, {
    module: loaded, exports: loaded.exports, URLSearchParams, AbortController, ...globals,
    require(name: string) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (name === "@/lib/morning-exam-analysis-schemas") return schema;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return loaded.exports;
}

function hooks() {
  type Slot = { value: any; deps?: unknown[]; cleanup?: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const slots: Slot[] = [];
  let cursor = 0, writes = 0;
  const effects: (() => void)[] = [];
  const api = {
    useId: () => "export-filter",
    useRef(initial: unknown) { const i = cursor++; slots[i] ??= { value: { current: initial } }; return slots[i].value; },
    useState(initial: unknown) { const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (next: any) => { writes++; slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    useEffect(effect: () => () => void, deps: unknown[]) { const i = cursor++; if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps?.[index]))) { slots[i]?.cleanup?.(); slots[i] = { value: null, deps }; effects.push(() => { slots[i].cleanup = effect(); }); } },
  };
  return { api, slots, get writes() { return writes; }, render<T>(fn: () => T) { cursor = 0; const result = fn(); while (effects.length) effects.shift()!(); return result; }, unmount() { slots.forEach((slot) => slot.cleanup?.()); } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("initial export is flat, labelled and loading; no ExcelJS client dependency", () => {
  const Component = load().ExamAnalysisExport;
  const html = renderToStaticMarkup(React.createElement(Component, { divisionSlug: "test" }));
  for (const text of ["성적 분석 내보내기", "분석 구분", "정기 모의고사", "아침 모의고사", "목록을 불러오는 중"]) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("엑셀 다운로드</button>"));
  assert.ok(!/exceljs|xlsx/i.test(fs.readFileSync(path.join(root, file), "utf8").split("function useList")[0]));
});

test("regular sessions default latest first and empty imported sessions offer no download", () => {
  let sessions = [{ sessionId: "old", examDate: "2026-08-08", participantCount: 5 }, { sessionId: "new", examDate: "2026-09-08", participantCount: 6 }];
  const Component = load({ react: { ...React, useState(initial: unknown) { return React.useState(initial && typeof initial === "object" && "url" in initial ? { ...initial, data: { sessions } } : initial); } } }).RegularExport;
  const html = renderToStaticMarkup(React.createElement(Component, { base: "/api/test", examTypeId: "type" }));
  assert.match(html, /value="2026-09-08" selected=""/);
  assert.ok(html.indexOf('value="2026-09-08"') < html.indexOf('value="2026-08-08"'));
  assert.ok(html.includes("엑셀 다운로드"));
  sessions = [];
  const empty = renderToStaticMarkup(React.createElement(Component, { base: "/api/test", examTypeId: "type" }));
  assert.ok(empty.includes("가져온 정기 시험이 없습니다")); assert.ok(!empty.includes("엑셀 다운로드"));
});

test("selection filters category, retains inactive history, and no types has an empty state", () => {
  let examTypes = [{ id: "m", category: "MORNING", name: "아침" }, { id: "r", category: "REGULAR", name: "지난학기정기", isActive: false }];
  const h = hooks();
  const Component = load({ react: h.api }).ExportSelection;
  h.render(() => Component({ base: "/api/test", kind: "regular" }));
  const requestSlot = h.slots.find((slot) => slot.value?.url);
  assert.ok(requestSlot);
  requestSlot.value.data = { examTypes };
  const tree = h.render(() => Component({ base: "/api/test", kind: "regular" }));
  assert.equal(tree.props.children[1].props.examTypeId, "r");
  examTypes = [];
  requestSlot.value.data = { examTypes };
  const empty = h.render(() => Component({ base: "/api/test", kind: "regular" }));
  assert.ok(renderToStaticMarkup(empty).includes("시험 종류가 없습니다"));
});

test("morning uses shared 84-day KST range and disables invalid, reversed, oversized dates", () => {
  const h = hooks(); const Component = load({ react: h.api }).MorningExport;
  let tree = h.render(() => Component({ base: "/api/test", examTypeId: "morning" }));
  const download = tree.props.children.at(-1);
  const query = new URL(download.props.url, "http://localhost").searchParams;
  assert.equal(query.get("kind"), "morning"); assert.equal(query.get("examTypeId"), "morning");
  assert.equal((Date.parse(query.get("to")!) - Date.parse(query.get("from")!)) / 86400000, 83);
  for (const range of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-09-08", to: "2026-09-01" }, { from: "2026-01-01", to: "2026-09-08" }]) {
    h.slots[0].value = range;
    tree = h.render(() => Component({ base: "/api/test", examTypeId: "morning" }));
    assert.equal(tree.props.children.at(-1).props.disabled, true);
    assert.ok(tree.props.children[2]);
  }
});

test("download locks duplicate clicks, creates an xlsx blob link and revokes its URL", async () => {
  const h = hooks(); const callbacks: (() => void)[] = []; const revoked: string[] = [];
  let resolve!: (value: unknown) => void, calls = 0, clicked = 0, removed = 0;
  const anchor = { href: "", download: "", click: () => { clicked++; }, remove: () => { removed++; } };
  const Component = load({ react: h.api }, {
    fetch: () => { calls++; return new Promise((done) => { resolve = done; }); },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: (url: string) => revoked.push(url) },
    document: { createElement: () => anchor, body: { appendChild: () => {} } }, setTimeout: (fn: () => void) => callbacks.push(fn),
  }).DownloadFile;
  const render = () => h.render(() => Component({ url: "/api/test/reports/exam-analysis?kind=regular&examTypeId=r&examDate=2026-09-08", filename: "성적.xlsx" }));
  const click = render().props.children[0].props.onClick;
  click(); click(); assert.equal(calls, 1); assert.equal(render().props.children[0].props.disabled, true);
  resolve({ ok: true, status: 200, headers: { get: () => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, blob: async () => ({ size: 100 }) });
  await settle();
  assert.equal(clicked, 1); assert.equal(removed, 1); assert.equal(anchor.download, "성적.xlsx"); assert.equal(anchor.href, "blob:test");
  assert.equal(render().props.children[0].props.disabled, false);
  callbacks.forEach((fn) => fn()); assert.deepEqual(revoked, ["blob:test"]);
  h.unmount(); assert.deepEqual(revoked, ["blob:test"]);
});

test("empty, 404, error and non-xlsx responses never download; failures allow retry", async () => {
  for (const reply of [
    { ok: false, status: 404 }, { ok: false, status: 500 },
    { ok: true, status: 204, blob: async () => ({ size: 0 }) },
    { ok: true, status: 200, headers: { get: () => "text/html" }, blob: async () => ({ size: 10 }) },
  ]) {
    const h = hooks(); let calls = 0;
    const Component = load({ react: h.api }, { fetch: async () => { calls++; return reply; }, URL: { createObjectURL: () => { throw new Error("must not download"); } } }).DownloadFile;
    const render = () => h.render(() => Component({ url: "/export", filename: "file.xlsx" }));
    render().props.children[0].props.onClick(); await settle();
    const html = renderToStaticMarkup(render());
    assert.ok(!html.includes("다운로드를 시작했습니다"));
    assert.ok(html.includes(reply.status === 404 || reply.status === 204 ? "내보낼 분석 자료가 없습니다" : "다시 시도"));
    assert.equal(render().props.children[0].props.disabled, false);
    render().props.children[0].props.onClick(); await settle(); assert.equal(calls, 2);
  }
});

test("unmount aborts download and ignores even a late failed response", async () => {
  const h = hooks(); let resolve!: (value: unknown) => void; let signal!: AbortSignal;
  const Component = load({ react: h.api }, { fetch: (_url: string, options: { signal: AbortSignal }) => { signal = options.signal; return new Promise((done) => { resolve = done; }); } }).DownloadFile;
  const tree = h.render(() => Component({ url: "/export", filename: "file.xlsx" }));
  tree.props.children[0].props.onClick(); h.unmount(); const writes = h.writes;
  resolve({ ok: false, status: 500 }); await settle();
  assert.equal(signal.aborted, true); assert.equal(h.writes, writes);
});

test("reports wiring is guarded by examManagement and adds only one section", () => {
  const source = fs.readFileSync(path.join(root, "components/reports/ReportsDashboard.tsx"), "utf8");
  assert.match(source, /flags\.examManagement && <ExamAnalysisExport key=\{divisionSlug\} divisionSlug=\{divisionSlug\}/);
  assert.equal((source.match(/<ExamAnalysisExport/g) ?? []).length, 1);
});


test("list requests clear stale results, ignore old replies and retry errors", async () => {
  const h = hooks(); const pending: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
  const useList = load({ react: h.api }, { fetch: (_url: string, options: { signal: AbortSignal }) => new Promise((resolve) => pending.push({ signal: options.signal, resolve })) }).useList;
  const render = (url = "/types") => h.render(() => useList(url));
  render(); render("/other"); assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({ ok: false }); await settle();
  const failed = render("/other"); assert.ok(failed.error); failed.retry(); render("/other");
  assert.equal(pending.length, 3);
  pending[0].resolve({ ok: true, json: async () => ({ obsolete: true }) }); await settle();
  assert.equal(render("/other").data, undefined);
  pending[2].resolve({ ok: true, json: async () => ({ current: true }) }); await settle();
  assert.equal(render("/other").data.current, true);
  const changed = render("/third"); assert.equal(changed.data, undefined);
  h.unmount(); const writes = h.writes;
  pending[3].resolve({ ok: true, json: async () => ({ ignored: true }) }); await settle();
  assert.equal(h.writes, writes);
});

test("disabled downloads cannot issue a request", () => {
  const h = hooks(); let requests = 0;
  const Component = load({ react: h.api }, { fetch: () => { requests++; } }).DownloadFile;
  const tree = h.render(() => Component({ url: "/export", filename: "file.xlsx", disabled: true }));
  assert.equal(tree.props.children[0].props.disabled, true);
  tree.props.children[0].props.onClick(); assert.equal(requests, 0);
});
