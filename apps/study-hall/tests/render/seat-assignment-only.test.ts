import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { SeatStatusBoard } from "../../components/seats/SeatStatusBoard";

const root = path.resolve(__dirname, "../..");
const localRequire = createRequire(path.join(root, "package.json"));
const filename = path.join(root, "components/seats/SeatStatusBoard.tsx");
const loaded = { exports: {} as { SeatStatusBoard: typeof SeatStatusBoard } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: loaded, exports: loaded.exports,
  require(name: string) {
    if (name === "lucide-react" || name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    if (name === "@/lib/sonner") return { toast: {} };
    return localRequire(name.startsWith("@/") ? path.join(root, name.slice(2)) : name);
  },
}, { filename });

test("seat assignment renders occupancy without attendance, including students on leave", () => {
  const html = renderToStaticMarkup(React.createElement(loaded.exports.SeatStatusBoard, {
    divisionSlug: "police", initialRooms: [], initialStudents: [],
    paymentEnabled: false, pointsEnabled: false, studentManagementEnabled: false,
    initialLayout: {
      room: null, rows: 1, columns: 3, aisleColumns: [],
      seats: (["ACTIVE", "ON_LEAVE", null] as const).map((status, index) => ({
        id: `seat-${index}`, studyRoomId: "room", label: String(index + 1),
        positionX: index + 1, positionY: 1, isActive: true,
        assignedStudent: status ? {
          id: `student-${index}`, name: `배정학생${index}`, studentNumber: `1000${index}`,
          status, studyTrack: null, studyRoomName: "자습실", courseEndDate: null,
        } : null,
      })),
    },
  }));
  const text = html.replace(/<[^>]*>/g, "");
  assert.match(text, /전체 좌석3석/);
  assert.match(text, /배정 학생2명/);
  assert.match(text, /공석1석/);
  assert.match(text, /배정학생0/);
  assert.match(text, /배정학생1/);
  assert.doesNotMatch(text, /출석률|출석|공결|사유결석|미처리|수업|오늘 종합|교시별/);
  assert.match(html, /admin\/settings\/seats/);
});
