export const DEFAULT_SEAT_LAYOUT_COLUMNS = 9;
export const DEFAULT_SEAT_LAYOUT_ROWS = 6;
export const DEFAULT_SEAT_AISLE_COLUMNS = [5] as const;

const rowLetters = ["A", "B", "C", "D", "E", "F"];

export type SeatDraftLayoutItem = {
  id?: string;
  label: string;
  positionX: number;
  positionY: number;
  isActive: boolean;
};

export type SeatGridConfig = {
  columns: number;
  rows: number;
  aisleColumns: number[];
};

export function getSeatPositionKey(positionX: number, positionY: number) {
  return `${positionX}:${positionY}`;
}

export function normalizeAisleColumns(input: unknown, columns = DEFAULT_SEAT_LAYOUT_COLUMNS) {
  if (!Array.isArray(input)) {
    return [...DEFAULT_SEAT_AISLE_COLUMNS];
  }

  return Array.from(
    new Set(
      input
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= columns),
    ),
  ).sort((left, right) => left - right);
}

export function isAisleColumn(positionX: number, aisleColumns: number[] = [...DEFAULT_SEAT_AISLE_COLUMNS]) {
  return aisleColumns.includes(positionX);
}

export function buildSeatLabel(positionX: number, positionY: number, usedLabels?: Set<string>) {
  const rowLabel = rowLetters[positionY - 1] ?? `R${positionY}`;
  const baseLabel = `${rowLabel}-${String(positionX).padStart(2, "0")}`;

  if (!usedLabels?.has(baseLabel)) {
    return baseLabel;
  }

  let index = 2;

  while (usedLabels.has(`${baseLabel}-${index}`)) {
    index += 1;
  }

  return `${baseLabel}-${index}`;
}

export function createDefaultSeatDraftLayout(
  config: Partial<SeatGridConfig> = {},
) {
  const columns = config.columns ?? DEFAULT_SEAT_LAYOUT_COLUMNS;
  const rows = config.rows ?? DEFAULT_SEAT_LAYOUT_ROWS;
  const aisleColumns = normalizeAisleColumns(config.aisleColumns, columns);
  const usedLabels = new Set<string>();
  const seats: SeatDraftLayoutItem[] = [];

  for (let positionY = 1; positionY <= rows; positionY += 1) {
    for (let positionX = 1; positionX <= columns; positionX += 1) {
      if (isAisleColumn(positionX, aisleColumns)) {
        continue;
      }

      const label = buildSeatLabel(positionX, positionY, usedLabels);
      usedLabels.add(label);

      seats.push({
        label,
        positionX,
        positionY,
        isActive: true,
      });
    }
  }

  return seats;
}
