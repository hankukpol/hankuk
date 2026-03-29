"use client";

interface PassCutSnapshot {
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
  targetParticipantCount: number | null;
  coverageRate: number | null;
  stabilityScore: number | null;
  status:
    | "READY"
    | "COLLECTING_LOW_PARTICIPATION"
    | "COLLECTING_UNSTABLE"
    | "COLLECTING_MISSING_APPLICANT_COUNT"
    | "COLLECTING_INSUFFICIENT_SAMPLE";
  statusReason: string | null;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
}

interface PassCutHistoryRelease {
  releaseNumber: number;
  releasedAt: string;
  totalParticipantCount: number;
  snapshot: PassCutSnapshot | null;
}

interface PassCutHistoryTableProps {
  releases: PassCutHistoryRelease[];
  current: PassCutSnapshot;
  myScore?: number | null;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatScore(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(2);
}

function formatThreshold(snapshot: PassCutSnapshot | null, value: number | null): string {
  if (!snapshot) return "-";
  if (snapshot.status !== "READY") {
    return `미집계`;
  }
  return formatScore(value);
}

interface ColumnDef {
  key: string;
  title: string;
  subtitle: string;
  snapshot: PassCutSnapshot | null;
}

interface ScoreRowDef {
  label: string;
  getValue: (snapshot: PassCutSnapshot | null) => number | null;
  useThresholdFormat?: boolean;
}

function getDelta(columns: ColumnDef[], colIndex: number, getValue: (s: PassCutSnapshot | null) => number | null): number | null {
  if (colIndex < 1) return null;
  const curr = columns[colIndex].snapshot;
  const prev = columns[colIndex - 1].snapshot;
  if (!curr || !prev) return null;
  if (curr.status !== "READY" || prev.status !== "READY") return null;
  const currVal = getValue(curr);
  const prevVal = getValue(prev);
  if (currVal === null || prevVal === null) return null;
  const diff = currVal - prevVal;
  if (Math.abs(diff) < 0.005) return null;
  return Number(diff.toFixed(2));
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  // 컷 상승 = 나에게 불리 = 빨간색, 컷 하락 = 나에게 유리 = 파란색
  const isUp = delta > 0;
  return (
    <span className={`ml-1 text-[10px] font-medium ${isUp ? "text-red-500" : "text-blue-500"}`}>
      {isUp ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}
    </span>
  );
}

export default function PassCutHistoryTable({ releases, current, myScore }: PassCutHistoryTableProps) {
  const columns: ColumnDef[] = [
    ...releases.map((release) => ({
      key: `release-${release.releaseNumber}`,
      title: `${release.releaseNumber}차`,
      subtitle: formatDate(release.releasedAt),
      snapshot: release.snapshot,
    })),
    {
      key: "current",
      title: "현재",
      subtitle: "실시간",
      snapshot: current,
    },
  ];

  const scoreRows: ScoreRowDef[] = [
    { label: "1배수컷", getValue: (s) => s?.oneMultipleCutScore ?? null, useThresholdFormat: true },
    { label: "확실권", getValue: (s) => s?.sureMinScore ?? null, useThresholdFormat: true },
    { label: "유력권", getValue: (s) => s?.likelyMinScore ?? null, useThresholdFormat: true },
    { label: "가능권", getValue: (s) => s?.possibleMinScore ?? null, useThresholdFormat: true },
    { label: "평균점", getValue: (s) => s?.averageScore ?? null },
  ];

  const showMyScore = typeof myScore === "number" && Number.isFinite(myScore);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">합격컷 발표 현황</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[640px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="border border-slate-200 px-3 py-2 text-left">구분</th>
              {columns.map((column) => (
                <th key={column.key} className="border border-slate-200 px-3 py-2 text-center">
                  <p className="font-semibold text-slate-800">{column.title}</p>
                  <p className="mt-0.5 text-xs font-normal text-slate-500">{column.subtitle}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 내 점수 행 */}
            {showMyScore ? (
              <tr>
                <td className="border border-slate-200 bg-blue-50 px-3 py-2 font-semibold text-blue-700">내 점수</td>
                {columns.map((column) => (
                  <td key={`${column.key}-myscore`} className="border border-slate-200 bg-blue-50 px-3 py-2 text-center font-semibold text-blue-700">
                    {myScore.toFixed(2)}
                  </td>
                ))}
              </tr>
            ) : null}

            {/* 점수 행들 (1배수컷, 확실권, 유력권, 가능권, 평균점) */}
            {scoreRows.map((row) => (
              <tr key={row.label}>
                <td className="border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">{row.label}</td>
                {columns.map((column, colIndex) => {
                  const displayValue = row.useThresholdFormat
                    ? formatThreshold(column.snapshot, row.getValue(column.snapshot))
                    : formatScore(row.getValue(column.snapshot));
                  const delta = getDelta(columns, colIndex, row.getValue);
                  return (
                    <td key={`${column.key}-${row.label}`} className="border border-slate-200 px-3 py-2 text-center">
                      {displayValue}
                      <DeltaBadge delta={delta} />
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* 참여자 행 */}
            <tr>
              <td className="border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">참여자</td>
              {columns.map((column) => (
                <td key={`${column.key}-participant`} className="border border-slate-200 px-3 py-2 text-center">
                  {column.snapshot ? `${column.snapshot.participantCount.toLocaleString("ko-KR")}명` : "-"}
                </td>
              ))}
            </tr>

            {/* 응시인원 행 */}
            <tr>
              <td className="border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">응시인원</td>
              {columns.map((column) => (
                <td key={`${column.key}-applicant`} className="border border-slate-200 px-3 py-2 text-center">
                  {column.snapshot
                    ? column.snapshot.applicantCount === null
                      ? "미입력"
                      : `${column.snapshot.applicantCount.toLocaleString("ko-KR")}명`
                    : "-"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        미집계 항목은 참여 데이터가 충분하지 않은 상태입니다. 참여자가 늘어나면 자동으로 집계됩니다.
      </p>
    </section>
  );
}