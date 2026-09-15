import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("seat workspaces share interaction appearance without changing their geometry", () => {
  for (const file of ["components/attendance/AttendanceSeatView.tsx", "components/phones/PhoneCheckSeatMap.tsx", "components/seats/SeatStatusBoard.tsx"]) {
    const code = source(file);
    assert.match(code, /admin-seat-card/);
    assert.match(code, /data-selected=\{isSelected\}/);
    assert.match(code, /min-h-\[108px\]/);
    assert.doesNotMatch(code, /hover:opacity-|\bring-\d/);
  }
  const board = source("components/seats/SeatStatusBoard.tsx");
  assert.match(board, /data-drop-target=\{isDropTarget\}/);
  assert.match(board, /onDragStart=/);
  assert.match(board, /setPendingMove\(\{ fromSeat, toSeat: seat \}\)/);
});

test("assigned seat inline colors resolve the same shared hover and selected tokens", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.admin-seat-card:hover:not\(:disabled\)\s*\{[^}]*--admin-seat-assigned-surface: var\(--admin-accent-hover\)/);
  assert.match(css, /\.admin-seat-card\[data-selected="true"\]\s*\{[^}]*--admin-seat-assigned-line: var\(--admin-text\)/);
  assert.match(source("components/seats/SeatStatusBoard.tsx"), /backgroundColor: "var\(--admin-seat-assigned-surface\)"/);
  assert.match(source("components/seats/SeatStatusBoard.tsx"), /borderColor: "var\(--admin-seat-assigned-line\)"/);
});
