import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAisleColumns, isAisleColumn, buildSeatLabel, getSeatPositionKey, createDefaultSeatDraftLayout } from "../../lib/seat-layout";

test("aisle columns normalize numeric input, deduplicate, sort and discard invalid positions", () => {
  const input = Object.freeze(["5", 2, 2, 0, -1, 10, 1.5, "bad", null, undefined]);
  assert.deepEqual(normalizeAisleColumns(input, 9), [2, 5]);
  assert.deepEqual(normalizeAisleColumns([], 9), []);
  assert.deepEqual(normalizeAisleColumns([1, 3, 4], 3), [1, 3]);
  for (const value of [null, undefined, "5", {}]) assert.deepEqual(normalizeAisleColumns(value), [5]);
  const defaults = normalizeAisleColumns(null);
  defaults.push(1);
  assert.deepEqual(normalizeAisleColumns(null), [5]);
});

test("aisle detection respects an explicitly empty or custom configuration", () => {
  assert.equal(isAisleColumn(5), true);
  assert.equal(isAisleColumn(4), false);
  assert.equal(isAisleColumn(5, []), false);
  assert.equal(isAisleColumn(2, [2, 4]), true);
});

test("seat labels support extended rows and choose an unused suffix without mutating existing labels", () => {
  assert.equal(buildSeatLabel(1, 1), "A-01");
  assert.equal(buildSeatLabel(20, 6), "F-20");
  assert.equal(buildSeatLabel(1, 7), "R7-01");
  const used = new Set(["A-01", "A-01-2", "A-01-4"]);
  assert.equal(buildSeatLabel(1, 1, used), "A-01-3");
  assert.deepEqual(Array.from(used), ["A-01", "A-01-2", "A-01-4"]);
  assert.equal(buildSeatLabel(2, 1, used), "A-02");
});

test("position keys do not collide between swapped or multi-digit coordinates", () => {
  assert.equal(getSeatPositionKey(1, 11), "1:11");
  assert.notEqual(getSeatPositionKey(1, 11), getSeatPositionKey(11, 1));
});

test("default room creates 48 unique active seats and leaves the middle aisle empty", () => {
  const seats = createDefaultSeatDraftLayout();
  assert.equal(seats.length, 48);
  assert.deepEqual(seats[0], { label: "A-01", positionX: 1, positionY: 1, isActive: true });
  assert.deepEqual(seats.at(-1), { label: "F-09", positionX: 9, positionY: 6, isActive: true });
  assert.equal(new Set(seats.map((seat) => seat.label)).size, 48);
  assert.equal(new Set(seats.map((seat) => getSeatPositionKey(seat.positionX, seat.positionY))).size, 48);
  assert.equal(seats.some((seat) => seat.positionX === 5), false);
  assert.equal(seats.every((seat) => seat.isActive), true);
});

test("custom grids honor every aisle, row order and room dimensions", () => {
  assert.deepEqual(createDefaultSeatDraftLayout({ columns: 3, rows: 2, aisleColumns: [2] }), [
    { label: "A-01", positionX: 1, positionY: 1, isActive: true },
    { label: "A-03", positionX: 3, positionY: 1, isActive: true },
    { label: "B-01", positionX: 1, positionY: 2, isActive: true },
    { label: "B-03", positionX: 3, positionY: 2, isActive: true },
  ]);
  assert.equal(createDefaultSeatDraftLayout({ columns: 3, rows: 2, aisleColumns: [] }).length, 6);
  assert.equal(createDefaultSeatDraftLayout({ columns: 3, rows: 2, aisleColumns: [1, 2, 3] }).length, 0);
  const larger = createDefaultSeatDraftLayout({ columns: 20, rows: 20, aisleColumns: [] });
  assert.equal(larger.length, 400);
  assert.equal(larger.at(-1)?.label, "R20-20");
});

test("separate layout drafts do not share editable seat objects", () => {
  const first = createDefaultSeatDraftLayout();
  const second = createDefaultSeatDraftLayout();
  first[0].label = "changed";
  first[0].isActive = false;
  assert.equal(second[0].label, "A-01");
  assert.equal(second[0].isActive, true);
});
