import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(__dirname, "../..");
const localRequire = createRequire(path.join(root, "package.json"));
type Element = {
  type: unknown;
  props: Record<string, unknown> & {
    onChange: (event: { target: { value: string } }) => void;
    onClick: () => void;
    onFocus: () => void;
    onBlur: () => void;
    rows: Array<{ name: string }>;
    students: Array<{ name: string }>;
  };
};
type HookSlot = { value?: unknown; deps?: unknown[]; cleanup?: void | (() => void) };
type ResponseStub = { ok: boolean; json: () => Promise<unknown> };

// Run the real component body and event handlers with deterministic hook lifetimes.
// Child components are opaque; these tests check state/requests, not browser layout.
function mount(file: string, exportName: string, initialProps: Record<string, unknown>) {
  const slots: HookSlot[] = [];
  let cursor = 0;
  let props = initialProps;
  let tree: Element;
  let mounted = true;
  let lateWrites = 0;
  const effects: Array<() => void> = [];
  const requests: Array<{
    url: string;
    signal?: AbortSignal;
    resolve: (response: ResponseStub) => void;
    reject: (reason: Error) => void;
  }> = [];
  const errors: string[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useState(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, (next: unknown) => {
        if (!mounted) lateWrites++;
        slots[i].value = typeof next === "function" ? next(slots[i].value) : next;
      }];
    },
    useRef(initial: unknown) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: { current: initial } };
      return slots[i].value;
    },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: effect() };
        });
      }
    },
    useCallback(callback: unknown, deps: unknown[]) { return hooks.useMemo(() => callback, deps); },
    useDeferredValue(value: unknown) { return value; },
  };
  const loadedModule = { exports: {} as Record<string, (props: Record<string, unknown>) => Element> };
  const opaque = new Proxy({}, { get: (_target, key) => String(key) });
  const context: Record<string, unknown> = {
    module: loadedModule, exports: loadedModule.exports, AbortController, Error,
    fetch: (url: string, options?: { signal?: AbortSignal }) => new Promise<ResponseStub>((resolve, reject) => {
      requests.push({ url, signal: options?.signal, resolve, reject });
    }),
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    require: (name: string) => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return localRequire(name);
      if (name === "@/lib/sonner") return { toast: { error: (message: string) => errors.push(message) } };
      if (name === "next/dynamic") return { __esModule: true, default: () => "DynamicComponent" };
      if (name.startsWith("@/lib/")) return localRequire(path.join(root, name.slice(2)));
      if (name === "lucide-react" || name.startsWith("@/components/")) return opaque;
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  context.window = context;
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context, { filename: file });
  const render = (nextProps = props) => {
    props = nextProps;
    cursor = 0;
    tree = loadedModule.exports[exportName](props);
    while (effects.length) effects.shift()!();
    return tree;
  };
  const nodes = (predicate: (node: Element) => boolean) => {
    const result: Element[] = [];
    const visit = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as Element;
      if (predicate(element)) result.push(element);
      for (const value of Object.values(element.props)) visit(value);
    };
    visit(tree);
    return result;
  };
  render();
  return {
    render, nodes, requests, errors, timers,
    get lateWrites() { return lateWrites; },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
    flushTimers() { const callbacks = Array.from(timers.values()); timers.clear(); callbacks.forEach((fn) => fn()); },
  };
}

const rankingCases = [
  ["components/study-time/AdminStudyRankingManager.tsx", "AdminStudyRankingManager"],
  ["components/study-time/StudentStudyRankingPanel.tsx", "StudentStudyRankingPanel"],
] as const;
const initialRanking = { month: "2026-09", rows: [], studentCount: 0, myRank: null };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const response = (data: unknown) => ({ ok: true, json: async () => data });

for (const [file, name] of rankingCases) {
  test(`${name}: latest month wins and superseded failures stay silent`, async () => {
    const view = mount(file, name, { divisionSlug: "police", initialRanking });
    const change = (month: string) => view.nodes((n) => n.type === "input")[0].props.onChange({ target: { value: month } });
    change("2026-08"); view.render();
    change("2026-07"); view.render();
    assert.equal(view.requests.length, 2);
    const row = (studentId: string) => ({ studentId, studentName: studentId, maskedName: studentId, rank: 1 });
    view.requests[1].resolve(response({ ranking: { ...initialRanking, rows: [row("latest")] } }));
    await settle(); view.render();
    view.requests[0].resolve(response({ ranking: { ...initialRanking, rows: [row("stale")] } }));
    await settle(); view.render();
    assert.equal(view.nodes((n) => n.type === "StudyRankingTable")[0].props.rows[0].name, "latest");
    assert.equal(view.requests[0].signal?.aborted, true);
    change("2026-06"); view.render();
    change("2026-05"); view.render();
    view.requests[2].reject(new Error("stale failure"));
    await settle(); view.render();
    assert.deepEqual(view.errors, []);
    assert.equal(view.nodes((n) => n.type === "LoaderCircle").length, 1);
    view.requests[3].reject(new Error("current failure"));
    await settle(); view.render();
    assert.deepEqual(view.errors, ["current failure"]);
    view.unmount();
  });

  test(`${name}: unmount aborts reads and ignores even a late body completion`, async () => {
    const view = mount(file, name, { divisionSlug: "police", initialRanking });
    view.nodes((n) => n.type === "input")[0].props.onChange({ target: { value: "2026-08" } });
    let resolveBody!: (data: unknown) => void;
    view.requests[0].resolve({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) });
    await settle();
    view.unmount();
    resolveBody({ ranking: initialRanking });
    await settle();
    assert.equal(view.requests[0].signal?.aborted, true);
    assert.equal(view.lateWrites, 0);
    assert.deepEqual(view.errors, []);
  });
}

test("student search: refocus cancels delayed close, unmount clears the timer", () => {
  const view = mount("components/ui/StudentSearchCombobox.tsx", "StudentSearchCombobox", {
    students: [{ id: "1", name: "김학생", studentNumber: "P001" }], value: "1", onChange: () => {},
  });
  const input = () => view.nodes((n) => n.type === "input")[0];
  input().props.onFocus(); view.render();
  input().props.onBlur();
  input().props.onFocus(); view.render();
  view.flushTimers(); view.render();
  assert.equal(view.nodes((n) => n.type === "ul").length, 1);
  input().props.onBlur();
  assert.equal(view.timers.size, 1);
  view.unmount();
  assert.equal(view.timers.size, 0);
  view.flushTimers();
  assert.equal(view.lateWrites, 0);
});

test("study time: month/student changes cancel reads, errors settle loading", async () => {
  const props = { divisionSlug: "police", studentId: "s1" };
  const view = mount("components/study-time/StudyTimeStats.tsx", "StudyTimeStats", props);
  view.nodes((n) => n.type === "input")[0].props.onChange({ target: { value: "2026-08" } });
  view.render();
  assert.equal(view.requests[0].signal?.aborted, true);
  view.requests[1].resolve(response({ stats: { totalMinutes: 123, byDate: [], byPeriod: [] } }));
  await settle(); view.render();
  view.requests[0].resolve(response({ stats: { totalMinutes: 999, byDate: [], byPeriod: [] } }));
  await settle(); view.render();
  const text = view.nodes(() => true).map((n) => n.props.children).flat().filter((n) => typeof n === "string");
  assert.ok(text.includes("2시간 3분"));
  view.render({ ...props, studentId: "s2" });
  assert.equal(view.requests.length, 3);
  view.requests[2].reject(new Error("offline"));
  await settle(); view.render();
  assert.deepEqual(view.errors, ["데이터를 불러오는 데 실패했습니다."]);
  view.unmount();
  assert.equal(view.lateWrites, 0);
});

function phoneFixture(size = 400) {
  let reads = 0;
  const students = Array.from({ length: size }, (_, i) => ({
    id: String(i), name: `학생${i}`, studentNumber: `P${i}`, seatLabel: String(size - i),
    studyRoomName: "자습실", studyTrack: null,
  }));
  const periods = Array.from({ length: 4 }, (_, i) => ({
    periodId: `p${i}`, periodName: `${i + 1}교시`, startTime: "09:00", endTime: "10:00",
    records: [], attendanceUnprocessedCount: 0, attendanceBlockedCount: 0,
    attendance: students.map((student, index) => ({
      get studentId() { reads++; return student.id; },
      checkable: index % 3 !== 0, status: index % 3 !== 0 ? "PRESENT" : "ABSENT",
    })),
  }));
  return {
    snapshot: { attendanceIntegrationEnabled: true, students, periods },
    get reads() { return reads; },
    props: {
      divisionSlug: "police", initialDate: "2020-01-01", initialActivePeriodId: "p0",
      initialSnapshot: { attendanceIntegrationEnabled: true, students, periods },
    },
  };
}

test("phone render builds its attendance lookup once and reuses it on rerender", (t) => {
  const fixture = phoneFixture();
  const view = mount("components/phones/PhoneCheckForm.tsx", "PhoneCheckForm", fixture.props);
  const reads = fixture.reads;
  assert.ok(reads <= 400 * 10, `attendance identifiers read ${reads} times`);
  view.render();
  assert.equal(fixture.reads, reads);
  t.diagnostic(`400 students / 4 periods: ${reads} attendance identifier reads, zero on unchanged rerender`);
  view.unmount();
});

test("phone render preserves students and each attendance restriction", () => {
  const fixture = phoneFixture(3);
  const view = mount("components/phones/PhoneCheckForm.tsx", "PhoneCheckForm", fixture.props);
  const table = view.nodes((node) => node.type === "PhoneCheckTable")[0];
  // Fixture seats are numbered 3, 2, 1; the existing display order is by seat.
  assert.deepEqual(Array.from(table.props.students, (student) => student.name), ["학생2", "학생1", "학생0"]);
  assert.equal(table.props.attendanceIntegrationEnabled, true);
  const cells = table.props.attendanceByStudentId as Map<string, { status: string; checkable: boolean }>;
  assert.equal(cells.get("0")?.checkable, false);
  assert.equal(cells.get("0")?.status, "ABSENT");
  assert.equal(cells.get("1")?.checkable, true);
  assert.equal(cells.get("2")?.status, "PRESENT");
  assert.equal(cells.get("missing"), undefined);
  view.unmount();
});

test("phone date lookup ignores stale responses and completion after unmount", async () => {
  const fixture = phoneFixture(2);
  const view = mount("components/phones/PhoneCheckForm.tsx", "PhoneCheckForm", fixture.props);
  const change = (date: string) => view.nodes((n) => n.type === "input" && n.props.type === "date")[0].props.onChange({ target: { value: date } });
  change("2020-01-02"); view.render();
  change("2020-01-03"); view.render();
  const snapshot = (name: string) => ({
    ...fixture.snapshot, students: fixture.snapshot.students.map((student) => ({ ...student, name })),
  });
  view.requests[1].resolve(response({ snapshot: snapshot("latest") }));
  await settle(); view.render();
  view.requests[0].resolve(response({ snapshot: snapshot("stale") }));
  await settle(); view.render();
  assert.equal(view.nodes((n) => n.type === "PhoneCheckTable")[0].props.students[0].name, "latest");
  change("2020-01-04"); view.render();
  view.unmount();
  view.requests[2].resolve(response({ snapshot: snapshot("unmounted") }));
  await settle();
  assert.equal(view.requests[2].signal?.aborted, true);
  assert.equal(view.lateWrites, 0);
});

test("study time summaries preserve empty data, zero days and rounded chart heights", async () => {
  for (const { minutes, expected, heights } of [
    { minutes: [], expected: ["0분", "0일"], heights: [] },
    { minutes: [0, 0], expected: ["0분", "0일"], heights: ["2px", "2px"] },
    { minutes: [0, 61, 121, 7, 0], expected: ["3시간 9분", "3일", "1시간 3분"], heights: ["2px", "40px", "80px", "5px", "2px"] },
  ]) {
    const props = { divisionSlug: "police", studentId: "s1" };
    const after = mount("components/study-time/StudyTimeStats.tsx", "StudyTimeStats", props);
    const stats = {
      totalMinutes: minutes.reduce((sum, value) => sum + value, 0),
      byDate: minutes.map((value, i) => ({ date: `2026-09-0${i + 1}`, minutes: value })),
      byPeriod: [0, 45, 120].map((avgMinutes, i) => ({ periodId: String(i), periodName: `${i}교시`, avgMinutes })),
    };
    after.requests[0].resolve(response({ stats }));
    await settle();
    after.render();
    const text = after.nodes(() => true).map((node) => node.props.children).flat();
    for (const label of expected) assert.ok(text.includes(label), label);
    const bars = after.nodes((node) => typeof node.props.title === "string" && node.props.title.startsWith("2026-09-"));
    assert.deepEqual(bars.map((node) => (node.props.style as { height: string }).height), heights);
    after.unmount();
  }
});

test("student search preserves case matching, ordering, selection and the all-students option", () => {
  let selection = "";
  const props = {
    students: [
      { id: "2", name: "김학생", studentNumber: "p002", studyTrack: "공채" },
      { id: "1", name: "이학생", studentNumber: "P001", studyTrack: null },
    ], value: "2", showStudyTrack: true, allStudentsLabel: "전체",
    onChange: (id: string) => { selection = id; },
  };
  const view = mount("components/ui/StudentSearchCombobox.tsx", "StudentSearchCombobox", props);
  const input = () => view.nodes((n) => n.type === "input")[0];
  assert.equal(input().props.value, "p002 · 김학생 · 공채");
  input().props.onFocus(); view.render();
  input().props.onChange({ target: { value: "P00" } }); view.render();
  const buttons = view.nodes((n) => n.type === "button");
  assert.equal(buttons.length, 3);
  buttons[2].props.onClick();
  assert.equal(selection, "1");
  view.render({ ...props, value: selection });
  assert.equal(input().props.value, "P001 · 이학생");
  input().props.onFocus(); view.render();
  view.nodes((n) => n.type === "button")[0].props.onClick();
  assert.equal(selection, "");
  view.render({ ...props, value: selection });
  assert.equal(input().props.value, "전체");
  view.unmount();
});
