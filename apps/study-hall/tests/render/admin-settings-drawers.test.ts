import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { DivisionStaffAccount } from "../../lib/services/division-staff.service";
import type { ExamScheduleItem } from "../../lib/services/exam-schedule.service";
import type { ExamTypeItem } from "../../lib/services/exam.service";

const require = createRequire(import.meta.url);

test("admin setting drawers preserve drafts, form submission and list updates", async (t) => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost/police/admin/staff", pretendToBeVisual: true });
  const React = require("react") as typeof import("react");
  dom.window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  let staff: DivisionStaffAccount[] = [{ id: "assistant", userId: "user", email: "qa@example.test", name: "테스트 조교", role: "ASSISTANT", isActive: true, createdAt: "" }];
  const schedule: ExamScheduleItem = { id: "schedule", divisionId: "division", name: "필기 시험", type: "WRITTEN", examDate: "2026-10-10", description: "", isActive: true, dDayValue: 26, dDayLabel: "D-26", createdById: "qa", createdAt: "", updatedAt: "" };
  const template: ExamTypeItem = { id: "template", divisionId: "division", name: "정기 시험", category: "REGULAR", studyTrack: null, isActive: true, displayOrder: 0, createdAt: "", updatedAt: "", subjects: [{ id: "subject", examTypeId: "template", name: "과목", totalItems: 20, pointsPerItem: 5, maxScore: 100, displayOrder: 0, isActive: true }] };
  const writes: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const room = { id: "room", divisionId: "division", name: "자습실 A", columns: 3, rows: 2, aisleColumns: [], isActive: true, displayOrder: 0, seatsCount: 6, assignedStudentsCount: 0, createdAt: "", updatedAt: "" };
  const layout = { room, columns: 3, rows: 2, aisleColumns: [], seats: [] };
  let fail = false;
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, React, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    fetch: async (url: string, init?: RequestInit) => {
      if (url.includes("/seats?")) return new Response(JSON.stringify({ layout }));
      if (!init?.method || init.method === "GET") return new Response(JSON.stringify(url.includes("exam-types") ? { examTypes: [template] } : { staff }));
      const body = JSON.parse(String(init.body ?? "{}"));
      writes.push({ url, method: init.method, body });
      if (fail) return new Response(JSON.stringify({ error: "저장 실패 테스트" }), { status: 400 });
      if (url.includes("exam-schedules")) return new Response(JSON.stringify({ schedule: { ...schedule, ...body } }));
      if (url.includes("exam-types")) return new Response(JSON.stringify({ examType: { ...template, ...body } }));
      if (!url.endsWith("password")) staff = staff.map((member) => ({ ...member, ...body }));
      return new Response(JSON.stringify({ staff: staff[0] }));
    },
  };
  const descriptors = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
  const { Simulate } = require("react-dom/test-utils") as typeof import("react-dom/test-utils");
  const { StaffManager } = await import("../../components/admin/StaffManager");
  const { ExamScheduleManager } = await import("../../components/exam-schedules/ExamScheduleManager");
  const { ExamTypeManager } = await import("../../components/exams/ExamTypeManager");
  const { SeatEditor } = await import("../../components/seats/SeatEditor");
  const { StudentForm } = await import("../../components/students/StudentForm");
  const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
  const { act } = React;
  const root = createRoot(document.getElementById("root")!);
  const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); }); };
  const button = (name: string, parent: ParentNode = document) => {
    const node = Array.from(parent.querySelectorAll<HTMLButtonElement>("button")).find((node) => (node.getAttribute("aria-label") ?? node.textContent?.trim()) === name);
    assert.ok(node, "button " + name); return node;
  };
  const click = async (node: HTMLElement) => { await act(async () => node.click()); await tick(); };
  const change = async (node: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => { node.value = value; Simulate.change(node); });
  };
  const drawer = () => Array.from(document.querySelectorAll<HTMLElement>(".admin-drawer")).at(-1)!;
  const submit = async (name: string) => {
    const save = button(name, drawer());
    assert.equal(save.form, drawer().querySelector("form"));
    assert.equal(drawer().querySelector(".admin-dialog-body")?.contains(save), false);
    await click(save);
  };
  try {
    await t.test("staff list filters and a drawer update keep API payloads scoped", async () => {
      await act(async () => root.render(React.createElement(StaffManager, { divisionSlug: "police", initialStaff: staff })));
      assert.equal(document.querySelector("form"), null);
      await change(document.querySelector<HTMLInputElement>('input[type="search"]')!, "없음");
      assert.ok(document.body.textContent?.includes("검색 조건에 맞는 직원이 없습니다."));
      await click(button("필터 초기화"));
      await click(button("테스트 조교 수정"));
      await change(drawer().querySelector<HTMLInputElement>("input")!, "변경한 조교");
      await submit("변경 저장");
      assert.deepEqual(writes.at(-1), { url: "/api/police/admin/staff/assistant", method: "PATCH", body: { name: "변경한 조교", role: "ASSISTANT", isActive: true } });
      assert.equal(document.querySelector(".admin-drawer"), null);
      assert.ok(document.querySelector("tbody")?.textContent?.includes("변경한 조교"));
    });
    await t.test("failed staff save preserves input; delete and discard require confirmation", async () => {
      await click(button("변경한 조교 수정"));
      await change(drawer().querySelector<HTMLInputElement>("input")!, "보존할 초안");
      fail = true;
      await submit("변경 저장");
      assert.ok(drawer().textContent?.includes("저장 실패 테스트"));
      const before = writes.length;
      await click(button("계정 삭제"));
      await click(button("취소", document.querySelector(".admin-dialog")!));
      assert.equal(writes.length, before);
      await click(button("취소", drawer()));
      await click(button("계속 편집"));
      assert.equal(drawer().querySelector<HTMLInputElement>("input")?.value, "보존할 초안");
      await click(button("취소", drawer()));
      await click(button("변경 폐기"));
      fail = false;
    });
    await t.test("nested password drawer keeps the account draft and clears secrets on dismissal", async () => {
      await click(button("변경한 조교 수정"));
      await change(drawer().querySelector<HTMLInputElement>("input")!, "계정 초안");
      await click(button("비밀번호 재설정"));
      await change(drawer().querySelector<HTMLInputElement>('input[type="password"]')!, "temporary-test-password");
      const before = writes.length;
      await click(button("취소", drawer()));
      await click(button("변경 폐기"));
      assert.equal(writes.length, before);
      assert.equal(drawer().querySelector<HTMLInputElement>("input")?.value, "계정 초안");
      await click(button("비밀번호 재설정"));
      assert.equal(drawer().querySelector<HTMLInputElement>("input")?.value, "");
      await click(button("취소", drawer()));
      await click(button("취소", drawer()));
      await click(button("변경 폐기"));
    });
    await t.test("schedule edit submits from the footer and updates the visible row", async () => {
      await act(async () => root.render(React.createElement(ExamScheduleManager, { divisionSlug: "police", initialSchedules: [schedule] })));
      assert.equal(document.querySelector("form"), null);
      await click(button("필기 시험"));
      const input = drawer().querySelector<HTMLInputElement>("input")!;
      await change(input, "변경한 시험 일정");
      fail = true;
      await submit("저장");
      assert.equal(input.value, "변경한 시험 일정");
      fail = false;
      await submit("저장");
      assert.equal(writes.at(-1)?.url, "/api/police/exam-schedules/schedule");
      assert.ok(document.querySelector("tbody")?.textContent?.includes("변경한 시험 일정"));
      assert.equal(document.querySelector(".admin-drawer"), null);
    });
    await t.test("template copy opens a drawer and strips source subject IDs", async () => {
      await act(async () => root.render(React.createElement(ExamTypeManager, { divisionSlug: "police", initialExamTypes: [template], studyTrackOptions: [] })));
      await tick();
      assert.equal(document.querySelector("form"), null);
      assert.ok(document.querySelector("table"));
      await click(button("정기 시험 복사"));
      await submit("복사본 저장");
      assert.equal(writes.at(-1)?.method, "POST");
      const body = writes.at(-1)!.body;
      assert.equal(body.name, "정기 시험 복사본");
      assert.equal((body.subjects as Array<{ id?: string }>)[0].id, undefined);
      assert.equal(document.querySelector(".admin-drawer"), null);
    });
    await t.test("student form reports draft state to its enclosing drawer", async () => {
      let state = { isDirty: false, isSaving: false };
      const onStateChange = (next: typeof state) => { state = next; };
      await act(async () => root.render(React.createElement(AppRouterContext.Provider, { value: { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} } }, React.createElement(StudentForm, { divisionSlug: "police", mode: "create", onStateChange }))));
      await tick();
      assert.equal(state.isDirty, false);
      const input = document.querySelector<HTMLInputElement>('form input:not([type="checkbox"]):not([type="date"])')!;
      await change(input, "테스트 학생");
      assert.equal(state.isDirty, true);
      assert.equal(state.isSaving, false);
      await change(input, "");
      assert.equal(state.isDirty, false);
    });
    await t.test("room editor discard restores room dimensions without writing seats", async () => {
      await act(async () => root.render(React.createElement(AppRouterContext.Provider, { value: { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} } }, React.createElement(SeatEditor, { divisionSlug: "police", initialRooms: [room], initialLayout: layout, students: [] }))));
      await tick();
      await click(button("자습실 A"));
      const width = drawer().querySelector<HTMLInputElement>('input[type="number"]')!;
      assert.equal(width.value, "3");
      await change(width, "4");
      const before = writes.length;
      await click(button("취소", drawer()));
      await click(button("계속 편집"));
      assert.equal(width.value, "4");
      await click(button("취소", drawer()));
      await click(button("변경 폐기"));
      await click(button("자습실 A"));
      assert.equal(drawer().querySelector<HTMLInputElement>('input[type="number"]')?.value, "3");
      assert.equal(writes.length, before);
      await click(button("취소", drawer()));
      await click(button("자습실 A"));
      const restoredWidth = drawer().querySelector<HTMLInputElement>('input[type="number"]')!;
      await change(restoredWidth, "4");
      await change(restoredWidth, "3");
      await click(button("취소", drawer()));
      assert.equal(document.querySelector(".admin-dialog"), null);
      await click(button("자습실 A"));
      assert.ok(document.querySelector(".admin-drawer"), "reverted room edits must not leave a dirty seat layout");
      await click(button("취소", drawer()));
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Array.from(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
