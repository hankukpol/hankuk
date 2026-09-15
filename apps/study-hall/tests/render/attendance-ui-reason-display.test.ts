import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { PhoneCheckSeatMap } from "../../components/phones/PhoneCheckSeatMap";
import { PhoneCheckTable } from "../../components/phones/PhoneCheckTable";
import { PhoneSubmissionManager } from "../../components/phones/PhoneSubmissionManager";
import { OutstandingPhoneReturns } from "../../components/phones/OutstandingPhoneReturns";
import { StudentDetailTabs } from "../../components/students/StudentDetailTabs";
import { AttendanceCalendar } from "../../components/student-view/AttendanceCalendar";
import { toast } from "../../lib/sonner";

// This repository's tsx runtime preserves the classic JSX factory for source files
// that intentionally rely on Next's automatic React injection.
Object.defineProperty(globalThis, "React", {
  value: React,
  configurable: true,
  writable: true,
});

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string) => {
    window: {
      document: Document;
      navigator: Navigator;
      close(): void;
    };
  };
};
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime") as {
  AppRouterContext: React.Context<unknown>;
};

const router = {
  back() {},
  forward() {},
  prefetch() {},
  push() {},
  refresh() {},
  replace() {},
};

function renderWithRouter(element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: router }, element),
  );
}

function parse(html: string) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

function findRowByText(document: Document, text: string) {
  const row = Array.from(document.querySelectorAll("tr")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  assert.ok(row, `row containing ${text}`);
  return row;
}

const weeklyAttendance = {
  dates: [
    { date: "2026-09-14", label: "9. 14. (월)", shortLabel: "월", isToday: true, isOperatingDay: true },
    { date: "2026-09-15", label: "9. 15. (화)", shortLabel: "화", isToday: false, isOperatingDay: true },
  ],
  rows: [
    {
      periodId: "p1",
      periodName: "1교시",
      label: null,
      startTime: "09:00",
      endTime: "10:00",
      isMandatory: true,
      cells: [
        { date: "2026-09-14", status: "EXCUSED", label: "사유", reason: "수업: 형법 기본이론" },
        { date: "2026-09-15", status: "EXCUSED", label: "사유", reason: "병원 진료" },
      ],
    },
  ],
};

test("student attendance calendar derives class and ordinary excused labels and tones from reason", () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(AttendanceCalendar, { weeklyAttendance } as never),
    ),
  );

  for (const [reason, label, tone] of [
    ["수업: 형법 기본이론", "수업", "--admin-attendance-class"],
    ["병원 진료", "사유결석", "text-attend-excused"],
  ] as const) {
    const cells = Array.from(document.querySelectorAll("td")).filter((cell) =>
      cell.getAttribute("title") === reason || cell.querySelector(`[title="${reason}"]`),
    );
    assert.ok(cells.length >= 1, `${reason} cell rendered`);
    for (const cell of cells) {
      assert.match(cell.textContent ?? "", new RegExp(label));
      assert.match(cell.innerHTML, new RegExp(tone));
    }
  }
});

test("student detail separates class from ordinary excused in weekly cells and history", () => {
  const html = renderWithRouter(
    React.createElement(StudentDetailTabs, {
      divisionSlug: "police",
      studentId: "s1",
      studentName: "검증학생",
      studentNumber: "10001",
      canManageScoreTargets: false,
      canEdit: false,
      attendanceManagementEnabled: true,
      leaveManagementEnabled: false,
      interviewManagementEnabled: false,
      pointManagementEnabled: false,
      examManagementEnabled: false,
      paymentManagementEnabled: false,
      activeTab: "attendance",
      attendanceSummary: {
        monthlyAttendanceRate: 100,
        monthlyAttendedCount: 1,
        monthlyExpectedCount: 1,
        weeklyAttendedCount: 1,
        weeklyExpectedCount: 1,
      },
      weeklyAttendance,
      attendanceHistory: [
        {
          id: "class",
          studentId: "s1",
          date: "2026-09-14",
          periodId: "p1",
          periodName: "1교시",
          periodLabel: null,
          status: "EXCUSED",
          reason: "수업: 형법 기본이론",
          recordedByName: "관리자",
          createdAt: "2026-09-14T00:00:00.000Z",
          updatedAt: "2026-09-14T00:00:00.000Z",
        },
        {
          id: "excused",
          studentId: "s1",
          date: "2026-09-13",
          periodId: "p1",
          periodName: "1교시",
          periodLabel: null,
          status: "EXCUSED",
          reason: "병원 진료",
          recordedByName: "관리자",
          createdAt: "2026-09-13T00:00:00.000Z",
          updatedAt: "2026-09-13T00:00:00.000Z",
        },
      ],
      leavePermissions: [],
      pointRecords: [],
      examResults: [],
      scoreTargets: [],
      availableScoreTargetExamTypes: [],
      paymentRecords: [],
      paymentCategories: [],
      tuitionPlans: [],
      pointRules: [],
      interviews: [],
    } as never),
  );
  const document = parse(html);

  const classRows = Array.from(document.querySelectorAll("tr")).filter((row) =>
    row.textContent?.includes("수업: 형법 기본이론"),
  );
  assert.ok(classRows.length >= 2, "weekly and history class rows rendered");
  for (const row of classRows) {
    assert.match(row.textContent ?? "", /수업/);
    assert.match(row.innerHTML, /--admin-attendance-class/);
  }

  const excusedRows = Array.from(document.querySelectorAll("tr")).filter((row) =>
    row.textContent?.includes("병원 진료"),
  );
  assert.ok(excusedRows.length >= 2, "weekly and history excused rows rendered");
  for (const row of excusedRows) {
    assert.match(row.textContent ?? "", /사유결석/);
    assert.match(row.innerHTML, /text-attend-excused/);
  }
  assert.ok(Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "수업"));
});

const phoneStudent = {
  id: "s1",
  name: "검증학생",
  studentNumber: "10001",
  seatLabel: "1",
  seatDisplay: "자습실 / 1",
  studyRoomName: "자습실",
  studyTrack: null,
};
const classAttendance = {
  studentId: "s1",
  status: "EXCUSED",
  reason: "수업: 형법 기본이론",
  checkable: false,
};

test("phone table and seat map show class tone while keeping class students out of checking", () => {
  const tableDocument = parse(renderToStaticMarkup(React.createElement(PhoneCheckTable, {
    students: [phoneStudent],
    periodState: { s1: { status: null, rentalNote: "" } },
    attendanceByStudentId: new Map([["s1", classAttendance]]),
    attendanceIntegrationEnabled: true,
    onStatusChange() {},
    onRentalNoteChange() {},
    onOpenBulkRental() {},
  } as never)));
  const tableRow = findRowByText(tableDocument, "검증학생");
  const tableClassBadge = Array.from(tableRow.querySelectorAll("span")).find((span) => span.textContent === "수업");
  assert.ok(tableClassBadge);
  assert.match(tableClassBadge.className, /--admin-attendance-class/);
  assert.match(tableRow.textContent ?? "", /체크 없음/);

  const seatDocument = parse(renderToStaticMarkup(React.createElement(PhoneCheckSeatMap, {
    divisionSlug: "police",
    rooms: [{ id: "room", name: "자습실", isActive: true }],
    initialSeatLayout: {
      room: { id: "room", name: "자습실", isActive: true },
      rows: 1,
      columns: 1,
      aisleColumns: [],
      seats: [{
        id: "seat",
        studyRoomId: "room",
        label: "1",
        positionX: 1,
        positionY: 1,
        isActive: true,
        assignedStudent: phoneStudent,
      }],
    },
    students: [phoneStudent],
    periodState: { s1: { status: null, rentalNote: "" } },
    attendanceByStudentId: new Map([["s1", classAttendance]]),
    attendanceIntegrationEnabled: true,
    onStatusChange() {},
    onRentalNoteChange() {},
    onOpenBulkRental() {},
  } as never)));
  const seat = seatDocument.querySelector(".phone-seat-card");
  assert.ok(seat);
  const seatClassBadge = Array.from(seat.querySelectorAll("span")).find((span) => span.textContent === "수업");
  assert.ok(seatClassBadge);
  assert.match(seatClassBadge.className, /--admin-attendance-class/);
  assert.match(seat.textContent ?? "", /체크 없음/);
});

async function collectRoomChangeErrors(fetchImpl: typeof fetch) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
  const globalKeys = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const descriptors = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousFetch = globalThis.fetch;
  const previousToastError = toast.error;
  const messages: string[] = [];

  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  globalThis.fetch = fetchImpl;
  toast.error = (message) => {
    messages.push(String(message));
    return 1;
  };

  const container = dom.window.document.querySelector("#root");
  assert.ok(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(React.createElement(PhoneCheckSeatMap, {
        divisionSlug: "police",
        rooms: [
          { id: "room", name: "자습실", isActive: true },
          { id: "room-2", name: "제2자습실", isActive: true },
        ],
        initialSeatLayout: {
          room: { id: "room", name: "자습실", isActive: true },
          rows: 1,
          columns: 1,
          aisleColumns: [],
          seats: [],
        },
        students: [],
        periodState: {},
        attendanceByStudentId: new Map(),
        attendanceIntegrationEnabled: true,
        onStatusChange() {},
        onRentalNoteChange() {},
        onOpenBulkRental() {},
      } as never));
    });

    const roomButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("제2자습실"),
    );
    assert.ok(roomButton);
    await act(async () => {
      roomButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    toast.error = previousToastError;
    for (const key of globalKeys) {
      const descriptor = descriptors.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }

  return messages;
}

test("phone seat room switch reports HTTP and network failures", async () => {
  const httpErrors = await collectRoomChangeErrors(async () => new Response(
    JSON.stringify({ error: "좌석 조회 권한이 없습니다." }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  ));
  assert.deepEqual(httpErrors, ["좌석 조회 권한이 없습니다."]);

  const networkErrors = await collectRoomChangeErrors(async () => {
    throw new TypeError("network unavailable");
  });
  assert.deepEqual(networkErrors, ["좌석 배치를 불러오지 못했습니다."]);
});

const rentedClassRecord = {
  id: "phone-1",
  divisionId: "police",
  studentId: "s1",
  studentName: "검증학생",
  studentNumber: "10001",
  periodId: "p1",
  periodName: "1교시",
  date: "2026-09-14",
  status: "RENTED",
  rentalNote: "인강 수강",
  attendanceStatus: "EXCUSED",
  attendanceReason: "수업: 형법 기본이론",
  attendanceCheckable: false,
  recordedById: "admin",
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

test("phone history and outstanding return keep the class reason and return action visible", () => {
  const historyDocument = parse(renderToStaticMarkup(React.createElement(PhoneSubmissionManager, {
    divisionSlug: "police",
    initialRecords: [rentedClassRecord],
    pointsEnabled: false,
  } as never)));
  const historyRow = findRowByText(historyDocument, "검증학생");
  const historyClassBadge = Array.from(historyRow.querySelectorAll("span")).find((span) => span.textContent === "수업");
  assert.ok(historyClassBadge);
  assert.match(historyClassBadge.className, /--admin-attendance-class/);

  const outstandingDocument = parse(renderWithRouter(React.createElement(OutstandingPhoneReturns, {
    divisionSlug: "police",
    records: [rentedClassRecord],
  } as never)));
  assert.match(outstandingDocument.body.textContent ?? "", /수업/);
  assert.match(outstandingDocument.body.textContent ?? "", /형법 기본이론/);
  assert.ok(Array.from(outstandingDocument.querySelectorAll("button")).some((button) =>
    button.textContent?.includes("반납 기록"),
  ));
});
