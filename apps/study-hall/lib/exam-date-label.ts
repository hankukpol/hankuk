/** Display the date-backed legacy score key as a date without changing stored scores. */
export function formatExamDateLabel(label: string): string {
  const match = /^(.*\s)(\d{4})(\d{2})(\d{2})회$/.exec(label);
  if (!match) return label;
  const date = `${match[2]}-${match[3]}-${match[4]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? `${match[1]}${date}` : label;
}
