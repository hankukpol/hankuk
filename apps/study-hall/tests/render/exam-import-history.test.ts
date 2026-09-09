import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { ExamImportHistoryRow } from "../../lib/exam-import-types";

type Node = { type: unknown; props: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Slot = { value?: any; deps?: unknown[]; cleanup?: void | (() => void) }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Reply = { ok: boolean; json: () => Promise<unknown> };
const row: ExamImportHistoryRow = { sessionId: "s/1", examTypeName: "시험 A", examDate: "2026-09-08", primarySubjectName: "과목 A", topic: "총론 3강", itemCount: 20, externalCohortSize: 203, matchedStudentCount: 5, importedByName: null, importedAt: "2026-09-08T01:00:00Z" };

// Isolated deterministic hooks execute the actual GET, confirmation and DELETE
// handlers without network/DB access. Layout still needs parent browser QA.
function mount() {
  const slots: Slot[] = [];
  let cursor = 0, deleted = 0, lateWrites = 0, live = true;
  let props = { divisionSlug: "test", examTypeId: undefined as string | undefined, refreshKey: 0, disabled: false };
  let tree: Node;
  const busy: boolean[] = [];
  const effects: (() => void)[] = [];
  const requests: { url: string; method?: string; signal: AbortSignal; resolve: (reply: Reply) => void }[] = [];
  const confirmations: { options: { description: string; variant: string }; resolve: (accepted: boolean) => void }[] = [];
  const hooks = {
    useRef(value: unknown) { const i = cursor++; slots[i] ??= { value: { current: value } }; return slots[i].value; },
    useState(value: unknown) {
      const i = cursor++; slots[i] ??= { value };
      return [slots[i].value, (next: unknown) => {
        if (!live) lateWrites++;
        slots[i].value = typeof next === "function" ? next(slots[i].value) : next;
      }];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, index) => !Object.is(dep, slots[i].deps?.[index]))) {
        slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const loaded = { exports: {} as { ExamImportHistory: (props: unknown) => Node } };
  const source = fs.readFileSync(path.resolve(__dirname, "../../components/exams/import/ExamImportHistory.tsx"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, AbortController, URLSearchParams, Error,
    fetch: (url: string, options: { signal: AbortSignal; method?: string }) => new Promise<Reply>((resolve) => requests.push({ url, ...options, resolve })),
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "@/components/ui/useConfirmDialog") return { useConfirmDialog: () => ({ confirmDialog: null, confirm: (options: { description: string; variant: string }) => new Promise<boolean>((resolve) => confirmations.push({ options, resolve })) }) };
      if (name === "react/jsx-runtime") return { Fragment: "fragment", jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render(next: Partial<typeof props> = {}) {
    props = { ...props, ...next }; cursor = 0;
    tree = loaded.exports.ExamImportHistory({ ...props, onDeleted: () => deleted++, onBusyChange: (value: boolean) => busy.push(value) });
    while (effects.length) effects.shift()!();
  }
  function nodes(predicate: (node: Node) => boolean) {
    const found: Node[] = [];
    function visit(value: unknown) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object" || !("props" in value)) return;
      const node = value as Node; if (predicate(node)) found.push(node); visit(node.props.children);
    }
    visit(tree); return found;
  }
  render();
  return {
    render, nodes, requests, confirmations, busy,
    button: (label: string) => nodes((node) => node.type === "button" && node.props.children === label)[0],
    text: () => JSON.stringify(tree),
    get deleted() { return deleted; }, get lateWrites() { return lateWrites; },
    unmount() { live = false; slots.forEach((slot) => slot.cleanup?.()); },
  };
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function respond(view: ReturnType<typeof mount>, index: number, data: unknown, ok = true) {
  view.requests[index].resolve({ ok, json: async () => data }); await settle(); view.render();
}

test("history: GET wrapper, empty first semester, optional type filter, null uploader and topic", async () => {
  const view = mount(); assert.equal(view.requests[0].url, "/api/test/exam-imports");
  await respond(view, 0, { history: [] }); assert.ok(view.text().includes("새 학기 첫 시험"));
  view.render({ examTypeId: "a/b" }); assert.equal(view.requests[1].url, "/api/test/exam-imports?examTypeId=a%2Fb");
  await respond(view, 1, { history: [row] });
  for (const text of ["2026-09-08", "총론 3강", "정보 없음", "시험 A"]) assert.ok(view.text().includes(text));
  assert.equal(view.button("삭제").props.disabled, false);
});

test("history: changed scope aborts old GET and ignores a late response", async () => {
  const view = mount(); view.render({ divisionSlug: "next" });
  assert.equal(view.requests[0].signal.aborted, true);
  await respond(view, 1, { history: [] });
  await respond(view, 0, { history: [row] }); assert.equal(view.button("삭제"), undefined);
});

test("history: delete requires confirmation, prevents duplicates, displays preserved manual scores and reloads", async () => {
  const view = mount(); await respond(view, 0, { history: [row] });
  const button = view.button("삭제"); button.props.onClick(); button.props.onClick();
  assert.equal(view.confirmations.length, 1); assert.equal(view.requests.length, 1);
  assert.match(view.confirmations[0].options.description, /대상 학생 5명/);
  assert.equal(view.confirmations[0].options.variant, "danger");
  view.confirmations[0].resolve(false); await settle(); view.render();
  assert.equal(view.requests.length, 1); assert.equal(view.busy.at(-1), false);
  view.button("삭제").props.onClick(); view.confirmations[1].resolve(true); await settle(); view.render();
  assert.equal(view.requests[1].method, "DELETE"); assert.equal(view.requests[1].url, "/api/test/exam-imports/s%2F1");
  assert.equal(view.button("삭제").props.disabled, true);
  await respond(view, 1, { result: { removedStudents: 5, keptManualScores: 2 } }); view.render();
  assert.equal(view.deleted, 1); assert.equal(view.requests.length, 3);
  assert.ok(view.text().includes("보존된 수기 성적")); assert.ok(view.text().includes("수기 입력분과 구분할 수 없는 성적"));
  assert.equal(view.busy.at(-1), false);
  await respond(view, 2, { history: [] }); assert.equal(view.button("삭제"), undefined);
});

test("history: failed DELETE sanitizes error and rechecks state without claiming success", async () => {
  const view = mount(); await respond(view, 0, { history: [row] });
  view.button("삭제").props.onClick(); view.confirmations[0].resolve(true); await settle();
  await respond(view, 1, { error: "SELECT secret FROM database" }, false);
  assert.equal(view.deleted, 0); assert.ok(!view.text().includes("SELECT"));
  assert.ok(view.text().includes("삭제 결과를 확인하지 못했습니다")); assert.equal(view.requests.length, 3);
});

test("history: failed GET offers retry, refresh key reloads and disabled parent prevents mutation", async () => {
  const view = mount(); await respond(view, 0, { error: "forbidden" }, false);
  assert.ok(view.text().includes("다시 조회")); view.button("다시 조회").props.onClick(); view.render();
  await respond(view, 1, { history: [row] }); view.render({ disabled: true });
  view.button("삭제").props.onClick(); assert.equal(view.confirmations.length, 0);
  view.render({ refreshKey: 1 }); assert.equal(view.requests.length, 3);
});

test("history: unmount aborts DELETE and rejects late writes", async () => {
  const view = mount(); await respond(view, 0, { history: [row] });
  view.button("삭제").props.onClick(); view.confirmations[0].resolve(true); await settle();
  view.unmount(); assert.equal(view.requests[1].signal.aborted, true);
  view.requests[1].resolve({ ok: true, json: async () => ({ result: { removedStudents: 5, keptManualScores: 0 } }) });
  await settle(); assert.equal(view.deleted, 0); assert.equal(view.lateWrites, 0);
});

test("history: scope change while confirmation is open cannot delete a previous scope", async () => {
  const view = mount(); await respond(view, 0, { history: [row] });
  view.button("삭제").props.onClick(); view.render({ divisionSlug: "next" });
  view.confirmations[0].resolve(true); await settle();
  assert.equal(view.requests.filter((request) => request.method === "DELETE").length, 0);
});
