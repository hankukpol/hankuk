export type CheckCell = { status: string | null; note: string };
export type CheckCells = Record<string, CheckCell>;
export type CheckDraft = { version: 1; savedAt: number; changes: Record<string, { before: CheckCell; after: CheckCell }> };
const MAX_DRAFT_AGE = 24 * 60 * 60 * 1000;

export function sameCheckCell(left?: CheckCell, right?: CheckCell) {
  return left?.status === right?.status && left?.note === right?.note;
}

export function makeCheckDraft(values: CheckCells, baseline: CheckCells, now = Date.now()): CheckDraft {
  const changes: CheckDraft["changes"] = {};
  for (const [key, after] of Object.entries(values)) {
    const before = baseline[key];
    if (before && !sameCheckCell(before, after)) changes[key] = { before, after };
  }
  return { version: 1, savedAt: now, changes };
}

export function parseCheckDraft(raw: string | null, now = Date.now()): CheckDraft | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const draft = JSON.parse(raw) as CheckDraft;
    if (draft.version !== 1 || !Number.isFinite(draft.savedAt) || now - draft.savedAt > MAX_DRAFT_AGE || draft.savedAt > now + 60_000) return null;
    if (!draft.changes || Array.isArray(draft.changes) || typeof draft.changes !== "object") return null;
    const isCell = (cell: CheckCell) => cell && (cell.status === null || typeof cell.status === "string") && typeof cell.note === "string" && cell.note.length <= 2_000;
    if (Object.entries(draft.changes).some(([key, change]) => key.length > 300 || !change || !isCell(change.before) || !isCell(change.after))) return null;
    return draft;
  } catch { return null; }
}

// Restore only cells whose server baseline is unchanged. A completed-but-timed-out
// write already matching the draft is not restored as another pending change.
export function restoreCheckDraft(draft: CheckDraft, baseline: CheckCells) {
  const patch: CheckCells = {};
  let conflicts = 0;
  for (const [key, { before, after }] of Object.entries(draft.changes)) {
    if (sameCheckCell(baseline[key], after)) continue;
    if (sameCheckCell(baseline[key], before)) patch[key] = after;
    else conflicts += 1;
  }
  return { patch, conflicts };
}

// Server acknowledgements never replace input made after the request started.
export function reconcileCheckCells(current: CheckCells, sent: CheckCells, server: CheckCells): CheckCells {
  return Object.fromEntries(Object.entries(server).map(([key, value]) => [
    key, current[key] && !sameCheckCell(current[key], sent[key]) ? current[key] : value,
  ]));
}
