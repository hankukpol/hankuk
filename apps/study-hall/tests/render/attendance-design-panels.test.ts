import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminTabs } from "../../components/ui/AdminTabs";
import { MobileCheckForm } from "../../components/attendance/MobileCheckForm";
import { AdminAttendanceBoard } from "../../components/attendance/AdminAttendanceBoard";

Object.defineProperty(globalThis, "React", { value: React, configurable: true });
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const render = (element: React.ReactElement) => renderToStaticMarkup(
  React.createElement(AppRouterContext.Provider, { value: {} }, element),
);
const periods = ["p1", "p2"].map((id, i) => ({
  id, name: `${i + 1}교시`, label: null, startTime: "09:00", endTime: "10:00",
  isMandatory: true, isActive: true,
}));
const student = { id: "s1", name: "검증학생", studentNumber: "90001", seatLabel: null,
  seatDisplay: null, studyRoomName: null, studyTrack: null };

test("mobile attendance tabs resolve to the visible period panel even with no students", () => {
  for (const students of [[], [student]]) {
    const html = render(React.createElement(MobileCheckForm, {
      divisionSlug: "police", initialDate: "2026-09-14", initialPeriods: periods,
      initialPeriodId: "p2", initialStudents: students, initialRecords: [],
    }));
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    for (const tab of doc.querySelectorAll('[role="tab"]')) {
      const panel = doc.getElementById(tab.getAttribute("aria-controls"));
      assert.ok(panel);
      assert.equal(panel.getAttribute("role"), "tabpanel");
      assert.equal(panel.getAttribute("aria-labelledby"), "attendance-period-p2");
    }
    dom.window.close();
  }
});

test("shared panel support preserves default per-tab panel identifiers", () => {
  const props = { items: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    activeId: "a", onChange() {}, label: "검증", idPrefix: "sample" };
  assert.match(renderToStaticMarkup(React.createElement(AdminTabs, props)), /aria-controls="sample-panel-b"/);
  const html = renderToStaticMarkup(React.createElement(AdminTabs, { ...props, panelId: "shared" }));
  assert.equal((html.match(/aria-controls="shared"/g) || []).length, 2);
});

test("desktop attendance reason uses the standard input without compact padding overrides", () => {
  const html = render(React.createElement(AdminAttendanceBoard, {
    divisionSlug: "police", initialDate: "2026-09-14", initialPeriods: periods,
    initialStudents: [student], initialRecords: [{ studentId: "s1", periodId: "p1", status: "EXCUSED", reason: "병원" }],
    initialStats: { attendanceRate: 0, totals: {} },
  }));
  const dom = new JSDOM(html);
  const input = dom.window.document.querySelector('[aria-label="검증학생 1교시 사유"]');
  assert.ok(input);
  assert.match(input.className, /admin-input/);
  assert.doesNotMatch(input.className, /h-7|px-2|py-1/);
  assert.equal(input.value, "병원");
  dom.window.close();
});
