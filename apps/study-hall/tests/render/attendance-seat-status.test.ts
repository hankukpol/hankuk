import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { AttendanceOptionValue } from "../../lib/attendance-meta";
import type { AttendanceSeatView as SeatComponent } from "../../components/attendance/AttendanceSeatView";

const root = path.resolve(__dirname, "../..");
const localRequire = createRequire(path.join(root, "package.json"));
const loaded = { exports: {} as { AttendanceSeatView: typeof SeatComponent } };
const filename = path.join(root, "components/attendance/AttendanceSeatView.tsx");
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: loaded, exports: loaded.exports,
  require(name: string) {
    // Modal geometry and icons are unrelated to the seat's status label.
    if (name === "lucide-react" || name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    if (name === "@/lib/sonner") return { toast: {} };
    return localRequire(name.startsWith("@/") ? path.join(root, name.slice(2)) : name);
  },
}, { filename });

const student = { id: "s1", name: "검증학생", studentNumber: "10001", seatLabel: "1", seatDisplay: "자습실 / 1", studyTrack: null };
const periods = Array.from({ length: 5 }, (_, index) => ({ id: `p${index + 1}`, name: `${index + 1}교시`, startTime: "09:00", endTime: "10:00" }));
type Cell = { status: AttendanceOptionValue; reason: string };
const cell = (status: AttendanceOptionValue, reason = ""): Cell => ({ status, reason });
const classCell = cell("EXCUSED", "수업: 기본이론");

function seatBadge(cells: Record<string, Cell>, selectedPeriodId: string | null = "p1", selectedPeriods = periods) {
  const html = renderToStaticMarkup(React.createElement(loaded.exports.AttendanceSeatView, {
    divisionSlug: "police", rooms: [], students: [student], periods: selectedPeriods, selectedPeriodId,
    initialSeatLayout: { room: null, rows: 1, columns: 1, aisleColumns: [], seats: [{
      id: "seat1", studyRoomId: "room1", label: "1", positionX: 1, positionY: 1, isActive: true,
      assignedStudent: { ...student, status: "ACTIVE", studyRoomName: "자습실", courseEndDate: null },
    }] },
    matrix: { s1: cells }, onUpdateCell() {}, onSaveStudent: async () => {},
  }));
  const seat = html.match(/<button\b[\s\S]*?<\/button>/)?.[0];
  assert.ok(seat, "rendered a seat button");
  assert.ok(seat.includes("검증학생"), "rendered the assigned student's seat");
  const labels = Array.from(seat.matchAll(/<span\b[^>]*>([^<]*)<\/span>/g), (match) => match[1]);
  assert.equal(labels.length, 2, "seat number and the selected period status");
  return labels[1];
}

test("seat shows saved basic-theory classes even with a later unprocessed period", () => {
  assert.equal(seatBadge({ p1: classCell, p2: classCell, p3: classCell, p4: classCell }), "수업");
});

for (const [status, label] of [
  ["PRESENT", "출석"], ["TARDY", "지각"], ["ABSENT", "결석"],
  ["EXCUSED", "사유결석"], ["HOLIDAY", "휴무"], ["HALF_HOLIDAY", "반휴"],
] as const) {
  test(`seat retains ${label} when remaining periods have no record`, () => {
    assert.equal(seatBadge({ p1: cell(status, "확인된 사유") }), label);
  });
}

test("seat reads only the selected period without borrowing another period status", () => {
  const cells = { p1: classCell, p2: cell("ABSENT"), p3: cell(""), p4: cell("EXCUSED", "병원 진료"), p5: cell("PRESENT") };
  assert.equal(seatBadge(cells, "p1"), "수업");
  assert.equal(seatBadge(cells, "p2"), "결석");
  assert.equal(seatBadge(cells, "p3"), "미처리");
  assert.equal(seatBadge(cells, "p4"), "사유결석");
  assert.equal(seatBadge(cells, "p5"), "출석");
});

test("seat keeps empty, missing and removed periods unprocessed", () => {
  assert.equal(seatBadge({}), "미처리");
  assert.equal(seatBadge({ p1: cell("") }), "미처리");
  assert.equal(seatBadge({ p1: classCell }, "p2"), "미처리");
  assert.equal(seatBadge({ p1: classCell }, "p1", [periods[1]]), "미처리");
  assert.equal(seatBadge({}, null, []), "미처리");
  assert.equal(seatBadge({ p1: cell("NOT_APPLICABLE") }), "해당없음");
});
