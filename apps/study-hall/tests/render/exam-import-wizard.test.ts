import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { ExamImportPreview } from "../../lib/exam-import-types";

type Node = { type: unknown; props: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Slot = { value?: any; deps?: unknown[]; cleanup?: void | (() => void) }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Reply = { ok: boolean; json: () => Promise<unknown> };

// Same deterministic hook approach as component-lifecycle.test.ts. Exercises the
// real handlers and request bodies; deliberately makes no browser-layout claims.
function mount(category = "MORNING") {
  const slots: Slot[] = [];
  let cursor = 0;
  let live = true;
  let lateWrites = 0;
  let refreshes = 0;
  let imports = 0;
  let tree: Node;
  const effects: (() => void)[] = [];
  const requests: { url: string; signal: AbortSignal; body: FormData; resolve: (reply: Reply) => void }[] = [];
  const refs: { current: unknown }[] = [];
  const hooks = {
    useId: () => "wizard",
    useRef(value: unknown) {
      const i = cursor++;
      if (!slots[i]) { slots[i] = { value: { current: value } }; refs.push(slots[i].value); }
      return slots[i].value;
    },
    useState(value: unknown) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value };
      return [slots[i].value, (next: unknown) => {
        if (!live) lateWrites++;
        slots[i].value = typeof next === "function" ? next(slots[i].value) : next;
      }];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const i = cursor++;
      if (!slots[i]) { slots[i] = { deps }; effects.push(() => { slots[i].cleanup = effect(); }); }
    },
  };
  const loaded = { exports: {} as { ExamImportWizard: (props: unknown) => Node } };
  const source = fs.readFileSync(path.resolve(__dirname, "../../components/exams/import/ExamImportWizard.tsx"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: loaded, exports: loaded.exports, AbortController, FormData, Error,
    fetch: (url: string, options: { signal: AbortSignal; body: FormData }) => new Promise<Reply>((resolve) => {
      requests.push({ url, ...options, resolve });
    }),
    require: (name: string) => {
      if (name === "react") return hooks;
      if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes++ }) };
      if (name === "react/jsx-runtime") return {
        Fragment: "fragment",
        jsx: (type: unknown, props: unknown) => ({ type, props }),
        jsxs: (type: unknown, props: unknown) => ({ type, props }),
      };
      throw new Error(`Unexpected client import: ${name}`);
    },
  });
  function render() {
    cursor = 0;
    tree = loaded.exports.ExamImportWizard({ divisionSlug: "test", category, examTypes: [{ id: "type-a", name: "시험 A" }], onImported: () => imports++ });
    while (effects.length) effects.shift()!();
  }
  function nodes(predicate: (node: Node) => boolean) {
    const found: Node[] = [];
    function visit(value: unknown) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object" || !("props" in value)) return;
      const node = value as Node;
      if (predicate(node)) found.push(node);
      visit(node.props.children);
    }
    visit(tree);
    return found;
  }
  render();
  const button = (label: string) => nodes((n) => n.type === "button" && n.props.children === label)[0];
  const change = (suffix: string, value: string) => { nodes((n) => n.props.id === `wizard-${suffix}`)[0].props.onChange({ target: { value } }); render(); };
  const file = (suffix: string, size = 10, name = "sample.xls") => {
    nodes((n) => n.props.id === `wizard-${suffix}`)[0].props.onChange({ target: { files: [new File([new Uint8Array(size)], name)], value: name } });
    render();
  };
  const ready = () => { file("score"); file("analysis"); if (category === "REGULAR") change("round", "2"); };
  return {
    render, nodes, button, change, file, ready, refs, requests,
    get refreshes() { return refreshes; }, get imports() { return imports; }, get lateWrites() { return lateWrites; },
    unmount() { live = false; slots.forEach((slot) => slot.cleanup?.()); },
  };
}

const preview = (extra: Partial<ExamImportPreview> = {}): ExamImportPreview => ({
  examDate: "2026-09-08", category: "MORNING", examTypeId: "type-a", examTypeName: "시험 A",
  subjectNames: ["과목 A"], cohortSize: 8, itemCount: 20, fullScore: 100,
  mappings: [{ blockIndex: 0, subjectName: "과목 A", itemCount: 20 }],
  reproduction: { matchedCount: 8, mismatches: [] }, matching: { matched: 5, unmatched: 3, invalid: 0 },
  invalidRows: [], partialRows: [], errors: [], existing: false, canConfirm: true, ...extra,
});
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function respond(view: ReturnType<typeof mount>, index: number, data: unknown, ok = true) {
  view.requests[index].resolve({ ok, json: async () => data });
  await settle(); view.render();
}

test("import wizard: auto selection, files resent, double-submit blocked, success clears files and refreshes", async () => {
  const view = mount(); view.ready();
  const first = view.button("미리보기"); first.props.onClick(); first.props.onClick();
  assert.equal(view.requests.length, 1);
  assert.equal(view.requests[0].body.has("examTypeId"), false);
  assert.equal(view.requests[0].body.get("overwrite"), "false");
  await respond(view, 0, { preview: preview() });
  const confirm = view.button("가져오기 확정"); assert.equal(confirm.props.disabled, false);
  confirm.props.onClick(); confirm.props.onClick();
  assert.equal(view.requests.length, 2);
  assert.equal(view.requests[1].url, "/api/test/exam-imports");
  assert.equal(view.requests[1].body.get("examTypeId"), "type-a");
  assert.ok(view.requests[1].body.get("scoreFile") instanceof File);
  assert.ok(view.requests[1].body.get("analysisFile") instanceof File);
  await respond(view, 1, { result: { sessionId: "s", importedCount: 5, examDate: "2026-09-08", examTypeId: "type-a", examRound: null } });
  assert.equal(view.refreshes, 1); assert.equal(view.imports, 1);
  assert.equal(view.button("미리보기").props.disabled, true);
  assert.deepEqual(Object.values(view.refs[0].current as object), [null, null]);
});

test("import wizard: mismatch blocks confirmation even if server canConfirm is true", async () => {
  const view = mount(); view.ready(); view.button("미리보기").props.onClick();
  await respond(view, 0, { preview: preview({ reproduction: { matchedCount: 7, mismatches: [{ sourceRow: 5, subjectName: "과목 A", expected: 50, actual: 100, reason: "배점 불일치" }] } }) });
  assert.equal(view.button("가져오기 확정").props.disabled, true);
  view.button("가져오기 확정").props.onClick(); assert.equal(view.requests.length, 1);
});

test("import wizard: overwrite requires explicit consent and selection changes invalidate it", async () => {
  const view = mount("REGULAR"); view.ready(); view.button("미리보기").props.onClick();
  assert.equal(view.requests[0].body.get("examRound"), "2");
  await respond(view, 0, { preview: preview({ category: "REGULAR", existing: true }) });
  assert.equal(view.button("가져오기 확정").props.disabled, true);
  view.nodes((n) => n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); view.render();
  assert.equal(view.button("가져오기 확정").props.disabled, false);
  view.change("round", "3"); assert.equal(view.button("가져오기 확정"), undefined);
  view.button("미리보기").props.onClick();
  await respond(view, 1, { preview: preview({ category: "REGULAR", existing: true }) });
  assert.equal(view.nodes((n) => n.props.type === "checkbox")[0].props.checked, false);
  view.change("type", "type-a"); assert.equal(view.button("가져오기 확정"), undefined);
});

test("import wizard: reset aborts request; stale response cannot replace newer preview", async () => {
  const view = mount(); view.ready(); view.button("미리보기").props.onClick();
  view.render(); view.button("초기화").props.onClick(); view.render();
  assert.equal(view.requests[0].signal.aborted, true);
  view.ready(); view.button("미리보기").props.onClick();
  await respond(view, 1, { preview: preview() });
  await respond(view, 0, { preview: preview({ canConfirm: false }) });
  assert.equal(view.button("가져오기 확정").props.disabled, false);
});

test("import wizard: unmount aborts, releases files and ignores late writes", async () => {
  const view = mount(); view.ready(); view.button("미리보기").props.onClick();
  view.unmount(); assert.equal(view.requests[0].signal.aborted, true);
  assert.deepEqual(Object.values(view.refs[0].current as object), [null, null]);
  view.requests[0].resolve({ ok: true, json: async () => ({ preview: preview() }) });
  await settle(); assert.equal(view.lateWrites, 0);
});

test("import wizard: validates both files at 5MB and rejects empty/unsupported files", () => {
  const view = mount(); view.ready();
  for (const suffix of ["score", "analysis"]) {
    view.file(suffix, 5 * 1024 * 1024 + 1); assert.equal(view.button("미리보기").props.disabled, true);
    view.file(suffix, 5 * 1024 * 1024); assert.equal(view.button("미리보기").props.disabled, false);
    view.file(suffix, 0); assert.equal(view.button("미리보기").props.disabled, true);
    view.file(suffix, 10, "bad.csv"); assert.equal(view.button("미리보기").props.disabled, true);
    view.file(suffix, 10, "unsupported.xlsx"); assert.equal(view.button("미리보기").props.disabled, true);
    view.file(suffix);
  }
});

test("import wizard: failed confirm requires fresh preview and consent", async () => {
  const view = mount(); view.ready(); view.button("미리보기").props.onClick();
  await respond(view, 0, { preview: preview({ existing: true }) });
  view.nodes((n) => n.props.type === "checkbox")[0].props.onChange({ target: { checked: true } }); view.render();
  view.button("가져오기 확정").props.onClick();
  assert.equal(view.requests[1].body.get("overwrite"), "true");
  await respond(view, 1, { error: "저장 상태가 변경되었습니다. 다시 확인해 주세요." }, false);
  assert.equal(view.button("가져오기 확정"), undefined);
  assert.equal(view.button("미리보기").props.disabled, false);
  assert.equal(view.refreshes, 0);
});
