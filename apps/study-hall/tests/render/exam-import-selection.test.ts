import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isExamDate } from "../../lib/exam-meta";

// Run real component initialization, effects and wrapper callbacks. Children
// remain opaque, so this checks the selected request, not browser appearance.
type Element = { type: string; key?: unknown; props: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
function mount(name: string, props: Record<string, unknown>) {
  const state: unknown[] = [];
  let cursor = 0;
  let tree: Element;
  const effects: (() => unknown)[] = [];
  const requests: string[] = [];
  const hooks = {
    useId: () => "tabs",
    useState(initial: unknown) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], (next: unknown) => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
    useRef: (value: unknown) => ({ current: value }),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => unknown) => effects.push(effect),
  };
  const loaded = { exports: {} as Record<string, (props: unknown) => Element> };
  const opaque = new Proxy({}, { get: (_target, key) => String(key) });
  const jsx = (type: string, attributes: Element["props"], key?: unknown) => ({ type, props: attributes, key });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, `../../components/exams/${name}.tsx`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: loaded, exports: loaded.exports, URLSearchParams,
    fetch: (url: string) => { requests.push(url); return new Promise(() => {}); },
    require: (module: string) => {
      if (module === "@/lib/exam-meta") return { isExamDate };
      if (module === "react") return hooks;
      if (module === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (module.endsWith("useActionCompleteModal")) return { useActionCompleteModal: () => ({}) };
      if (module.endsWith("useConfirmDialog")) return { useConfirmDialog: () => ({}) };
      return opaque;
    },
  });
  function render() { cursor = 0; tree = loaded.exports[name](props); }
  function nodes(type: string) {
    const result: Element[] = [];
    function visit(node: unknown) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as Element;
      if (element.type === type) result.push(element);
      visit(element.props.children);
    }
    visit(tree); return result;
  }
  render();
  return { render, nodes, requests, runEffects: () => { effects.splice(0).forEach((effect) => effect()); } };
}

const types = [
  { id: "default", name: "기본 시험", subjects: [{ id: "default-subject", isActive: true }] },
  { id: "imported", name: "가져온 시험", subjects: [{ id: "first-subject", isActive: true }, { id: "imported-subject", isActive: true }] },
];

for (const category of ["REGULAR", "MORNING"]) {
  test(`import selection: ${category} result reaches remounted manager and its first request`, () => {
    const wrapper = mount("ExamSecondaryTabs", { divisionSlug: "test", category, examTypes: types });
    const managerName = category === "REGULAR" ? "ExamScoreManager" : "MorningExamScoreManager";
    const originalKey = wrapper.nodes(managerName)[0].key;
    wrapper.nodes("AdminTabs")[0].props.onChange("import"); wrapper.render();
    wrapper.nodes("ExamImportWizard")[0].props.onImported({
      sessionId: "session", importedCount: 5, examTypeId: "imported", examDate: "2026-08-15",
      subjectId: "imported-subject",
    });
    wrapper.render();
    wrapper.nodes("ExamImportWizard")[0].props.onShowScores(); wrapper.render();
    assert.equal(wrapper.nodes("AdminTabs")[0].props.activeId, "input");
    const manager = wrapper.nodes(managerName)[0];
    assert.notEqual(manager.key, originalKey);
    assert.equal(manager.props.initialSelection.examTypeId, "imported");
    assert.equal(manager.props.initialSelection.examDate, "2026-08-15");
    const input = mount(managerName, manager.props);
    input.runEffects();
    if (category === "REGULAR") {
      assert.equal(manager.props.initialSelection.examRound, undefined);
      assert.equal(input.requests[0], "/api/test/exams?examTypeId=imported&examDate=2026-08-15");
    } else {
      assert.equal(manager.props.initialSelection.subjectId, "imported-subject");
      assert.equal(input.requests[0], "/api/test/morning-exams?examTypeId=imported&subjectId=imported-subject&date=2026-08-15");
    }
    assert.ok(input.nodes("input").some((node) => node.props.type === "date" && node.props.value === "2026-08-15"));
    // A repeated import, including overwrite of the same session, reloads again.
    wrapper.nodes("AdminTabs")[0].props.onChange("import"); wrapper.render();
    wrapper.nodes("ExamImportWizard")[0].props.onImported({ sessionId: "session", importedCount: 5, examTypeId: "imported", examDate: "2026-08-15" });
    wrapper.render(); assert.notEqual(wrapper.nodes(managerName)[0].key, manager.key);
  });
}

test("import selection: regular manager defaults to today with no round input", () => {
  const input = mount("ExamScoreManager", { divisionSlug: "test", initialExamTypes: types });
  input.runEffects();
  const dateInput = input.nodes("input").find((node) => node.props.type === "date")!;
  assert.equal(input.requests[0], `/api/test/exams?examTypeId=default&examDate=${dateInput.props.value}`);
  assert.equal(input.nodes("input").filter((node) => node.props.type === "date").length, 1);
  assert.ok(!input.requests[0].includes("examRound"));
});
