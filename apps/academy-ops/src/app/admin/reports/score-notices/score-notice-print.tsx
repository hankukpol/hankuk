"use client";

import { Subject } from "@prisma/client";

type SubjectRow = {
  subject: Subject;
  displayName: string;
  scores: number[];
  thisMonthAvg: number | null;
};

type Props = {
  student: {
    examNumber: string;
    name: string;
    mobile: string;
  };
  cohortName: string;
  issuedAt: string;
  periodLabel: string;
  subjectRows: SubjectRow[];
  overallAvg: number | null;
  totalPossible: number;
  totalActual: number | null;
  rank: number | null;
  totalRanked: number;
  attendPresent: number;
  attendAbsent: number;
  attendLate: number;
};

function ScoreDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) return <span className="text-slate-400 text-xs">━</span>;
  if (delta > 0)
    return (
      <span className="text-green-600 text-xs font-semibold">
        ▲{delta.toFixed(1)}
      </span>
    );
  return (
    <span className="text-red-500 text-xs font-semibold">
      ▼{Math.abs(delta).toFixed(1)}
    </span>
  );
}

export function ScoreNoticePrint({
  student,
  cohortName,
  issuedAt,
  periodLabel,
  subjectRows,
  overallAvg,
  totalPossible,
  totalActual,
  rank,
  totalRanked,
  attendPresent,
  attendAbsent,
  attendLate,
}: Props) {
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .score-notice-doc {
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
        .comment-field {
          min-height: 56px;
          outline: none;
          border-bottom: 1px solid #d1d5db;
          padding: 4px 0;
          color: #111827;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .comment-field:focus {
          border-bottom-color: #C55A11;
        }
        .comment-field:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>

      <div
        className="score-notice-doc w-full max-w-[720px] rounded-2xl border border-[#111827]/15 bg-white shadow-lg"
        style={{ minHeight: "297mm", fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
      >
        <div className="px-14 py-14">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1F4D3A]">학원명 미설정</span>
            <span className="text-xs text-[#4B5563]">연락처는 관리자 설정을 확인하세요</span>
          </div>

          {/* Title */}
          <h1
            className="mb-8 text-center text-3xl font-bold text-[#111827]"
            style={{ letterSpacing: "0.6em" }}
          >
            성 적 통 지 표
          </h1>

          {/* Student info */}
          <div className="mb-6 border border-[#111827]/20">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[#111827]/10">
                  <th className="w-28 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                    학&nbsp;&nbsp;&nbsp;번
                  </th>
                  <td className="px-4 py-3 font-mono text-sm text-[#111827]">{student.examNumber}</td>
                  <th className="w-24 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                    성&nbsp;&nbsp;&nbsp;명
                  </th>
                  <td className="px-4 py-3 font-semibold text-[#111827]">{student.name}</td>
                </tr>
                <tr className="border-b border-[#111827]/10">
                  <th className="bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                    반&nbsp;&nbsp;&nbsp;명
                  </th>
                  <td className="px-4 py-3 text-[#111827]" colSpan={3}>
                    {cohortName}
                  </td>
                </tr>
                <tr>
                  <th className="bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                    발행일
                  </th>
                  <td className="px-4 py-3 text-[#111827]">{issuedAt}</td>
                  <th className="bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                    기&nbsp;&nbsp;&nbsp;간
                  </th>
                  <td className="px-4 py-3 text-[#111827]">{periodLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Score table */}
          <div className="mb-1 border border-[#111827]/20">
            <div className="bg-[#1F4D3A] px-4 py-2.5 text-sm font-semibold text-white">
              과목별 성적
            </div>
            {subjectRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#4B5563]">
                해당 월의 성적 데이터가 없습니다.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#111827]/10 bg-[#F7F4EF]">
                    <th className="px-4 py-2.5 text-left font-semibold text-[#111827]">과목</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-[#111827]">시험 횟수</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-[#111827]">이번 달 평균</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-[#111827]">최고</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-[#111827]">최저</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-[#111827]">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map((row) => {
                    const maxScore = row.scores.length > 0 ? Math.max(...row.scores) : null;
                    const minScore = row.scores.length > 0 ? Math.min(...row.scores) : null;
                    const isGood = row.thisMonthAvg !== null && row.thisMonthAvg >= 80;
                    const isWarn = row.thisMonthAvg !== null && row.thisMonthAvg < 60;
                    return (
                      <tr
                        key={row.subject}
                        className="border-b border-[#111827]/8 last:border-0 hover:bg-[#F7F4EF]/50"
                      >
                        <td className="px-4 py-3 font-medium text-[#111827]">{row.displayName}</td>
                        <td className="px-4 py-3 text-center text-[#4B5563]">{row.scores.length}회</td>
                        <td className="px-4 py-3 text-center">
                          {row.thisMonthAvg !== null ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 text-sm font-bold ${
                                isGood
                                  ? "bg-[#1F4D3A]/10 text-[#1F4D3A]"
                                  : isWarn
                                  ? "bg-[#C55A11]/10 text-[#C55A11]"
                                  : "text-[#111827]"
                              }`}
                            >
                              {row.thisMonthAvg.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-[#4B5563]/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-[#4B5563]">
                          {maxScore !== null ? maxScore.toFixed(0) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-[#4B5563]">
                          {minScore !== null ? minScore.toFixed(0) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-[#4B5563]">
                          {isWarn ? (
                            <span className="text-[#C55A11] font-semibold">주의</span>
                          ) : isGood ? (
                            <span className="text-[#1F4D3A]">우수</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Overall summary */}
          <div className="mb-6 border border-t-0 border-[#111827]/20 bg-[#F7F4EF] px-5 py-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#4B5563]">총점</span>
                <span className="font-bold text-[#111827]">
                  {totalActual !== null ? `${totalActual}점` : "—"}
                  {totalPossible > 0 ? ` / ${subjectRows.length * 100}점` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#4B5563]">평균</span>
                <span className="font-bold text-[#111827]">
                  {overallAvg !== null ? `${overallAvg.toFixed(1)}점` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#4B5563]">석차</span>
                <span className="font-bold text-[#111827]">
                  {rank !== null && totalRanked > 0
                    ? `${rank}위 / ${totalRanked}명`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Attendance */}
          <div className="mb-6 border border-[#111827]/20">
            <div className="border-b border-[#111827]/10 bg-[#1F4D3A] px-4 py-2.5 text-sm font-semibold text-white">
              출결 현황
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#111827]/10">
              <div className="px-6 py-4 text-center">
                <p className="text-xs font-medium text-[#4B5563]">출석</p>
                <p className="mt-1 text-2xl font-bold text-[#1F4D3A]">{attendPresent}</p>
                <p className="text-xs text-[#4B5563]">일</p>
              </div>
              <div className="px-6 py-4 text-center">
                <p className="text-xs font-medium text-[#4B5563]">결석</p>
                <p className={`mt-1 text-2xl font-bold ${attendAbsent > 0 ? "text-[#C55A11]" : "text-[#111827]"}`}>
                  {attendAbsent}
                </p>
                <p className="text-xs text-[#4B5563]">일</p>
              </div>
              <div className="px-6 py-4 text-center">
                <p className="text-xs font-medium text-[#4B5563]">지각/공결</p>
                <p className="mt-1 text-2xl font-bold text-[#111827]">{attendLate}</p>
                <p className="text-xs text-[#4B5563]">일</p>
              </div>
            </div>
          </div>

          {/* Teacher comment */}
          <div className="mb-6 border border-[#111827]/20">
            <div className="border-b border-[#111827]/10 bg-[#F7F4EF] px-4 py-2.5 text-sm font-semibold text-[#111827]">
              담임 코멘트
            </div>
            <div className="px-4 py-4">
              <div
                contentEditable
                suppressContentEditableWarning
                className="comment-field w-full"
                data-placeholder="내용을 입력하세요..."
              />
              <div className="mt-3 border-b border-[#111827]/10" />
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" style={{ minHeight: "32px" }} />

          {/* Footer: signature area */}
          <div className="mt-8 flex items-end justify-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-[#111827]">학원장</span>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#C55A11] text-[10px] font-semibold text-[#C55A11]">
                  (인)
                </div>
              </div>
              <p className="text-xs text-[#4B5563]">학원 주소는 관리자 설정을 확인하세요</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
