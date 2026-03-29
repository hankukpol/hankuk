import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintScoreReportButton } from "./print-score-report-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { examNumber: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string
): string | undefined {
  const v = searchParams?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function formatKorDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatIssuedAt(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// 과목 레이블 맵
const SUBJECT_LABEL: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형사소송법",
  POLICE_SCIENCE: "경찰학",
  CRIMINOLOGY: "범죄학",
  CUMULATIVE: "누적",
};

const EXAM_TYPE_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

export default async function ScoreReportPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { examNumber } = params;
  const cohortIdParam = readParam(searchParams, "cohortId");
  const typeParam = readParam(searchParams, "type"); // MORNING, EVENING 등 (ExamType이 아님 — 선택사항)

  const prisma = getPrisma();

  // 학생 기본 정보
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
      generation: true,
      className: true,
    },
  });

  if (!student) notFound();

  // Score 조회: 세션 기준
  const scores = await prisma.score.findMany({
    where: { examNumber },
    include: {
      session: {
        include: {
          period: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ session: { examDate: "asc" } }],
  });

  // cohortId 필터 (ExamPeriod.id로 필터링)
  const cohortIdNum = cohortIdParam ? parseInt(cohortIdParam, 10) : null;
  const filtered = cohortIdNum
    ? scores.filter((s) => s.session.period.id === cohortIdNum)
    : scores;

  // typeParam 필터 (없으면 전체)
  const filteredByType = typeParam
    ? filtered.filter((s) => s.session.subject === typeParam)
    : filtered;

  // 기간 목록 (드롭다운용)
  const periods = await prisma.examPeriod.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });

  // 과목 목록 결정
  const subjectSet = new Set(filteredByType.map((s) => s.session.subject));
  const GONGCHAE_SUBJECTS = [
    "CONSTITUTIONAL_LAW",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
  ];
  const GYEONGCHAE_SUBJECTS = [
    "CRIMINOLOGY",
    "CRIMINAL_LAW",
    "CRIMINAL_PROCEDURE",
    "POLICE_SCIENCE",
  ];
  const defaultSubjects =
    student.examType === "GONGCHAE" ? GONGCHAE_SUBJECTS : GYEONGCHAE_SUBJECTS;

  // 실제 데이터에 있는 과목만 포함
  const subjects = defaultSubjects.filter(
    (sub) => subjectSet.has(sub as (typeof filteredByType)[0]["session"]["subject"]) || filteredByType.some((s) => s.session.subject === sub)
  );

  // 회차별 그룹핑 (examDate 기준)
  type SessionRow = {
    sessionId: number;
    week: number;
    examDate: Date;
    scores: Record<string, number | null>;
    totalScore: number | null;
    attend: string;
  };

  const sessionMap = new Map<number, SessionRow>();

  for (const s of filteredByType) {
    const sid = s.session.id;
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, {
        sessionId: sid,
        week: s.session.week,
        examDate: s.session.examDate,
        scores: {},
        totalScore: null,
        attend: s.attendType,
      });
    }
    const row = sessionMap.get(sid)!;
    if (s.attendType === AttendType.ABSENT) {
      row.attend = "ABSENT";
    }
    if (s.finalScore !== null) {
      row.scores[s.session.subject] = s.finalScore;
    }
  }

  // 총점 계산 (CUMULATIVE 제외)
  for (const [, row] of sessionMap) {
    const subScores = subjects
      .filter((sub) => sub !== "CUMULATIVE")
      .map((sub) => row.scores[sub])
      .filter((v): v is number => v !== null && v !== undefined);

    if (subScores.length === subjects.filter((s) => s !== "CUMULATIVE").length) {
      row.totalScore = subScores.reduce((a, b) => a + b, 0);
    }
  }

  const sessionRows = Array.from(sessionMap.values()).sort(
    (a, b) => a.examDate.getTime() - b.examDate.getTime()
  );

  // 과목별 평균 계산
  const subjectAverages: Record<string, number | null> = {};
  for (const sub of subjects) {
    const vals = sessionRows
      .map((r) => r.scores[sub])
      .filter((v): v is number => v !== null && v !== undefined);
    subjectAverages[sub] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  // 총점 평균
  const totalScores = sessionRows
    .map((r) => r.totalScore)
    .filter((v): v is number => v !== null);
  const totalAvg =
    totalScores.length > 0
      ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
      : null;

  // 석차 계산을 위한 회차별 전체 점수 조회 (상위권 기준용)
  // 간략히: 해당 학생의 순위 계산만 진행
  const issuedAt = formatIssuedAt(new Date());
  const selectedPeriod = periods.find((p) => p.id === cohortIdNum);

  // 헤더에 표시할 과목명 (CUMULATIVE 포함 여부)
  const displaySubjects = subjects.filter((s) => s !== "CUMULATIVE");

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          .report-wrapper {
            padding: 0 !important;
            background: white !important;
          }
          .report-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            border: none !important;
          }
        }
      `}</style>

      {/* 상단 툴바 */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← {student.name}
          </Link>
          <span className="text-lg font-bold text-[#111827]">성적통지표</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 기간 필터 */}
          <form className="flex items-center gap-2">
            <select
              name="cohortId"
              defaultValue={cohortIdParam ?? ""}
              className="rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm text-[#111827] focus:outline-none"
            >
              <option value="">전체 기간</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
            >
              적용
            </button>
          </form>
          <PrintScoreReportButton />
        </div>
      </div>

      {/* 통지표 미리보기 */}
      <div className="report-wrapper flex justify-center p-6">
        <div
          className="report-paper w-full max-w-[900px] overflow-hidden rounded-[16px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ minHeight: "200mm" }}
        >
          {/* ── 헤더 ── */}
          <div
            className="px-10 pb-5 pt-7"
            style={{ backgroundColor: "#1F4D3A" }}
          >
            <div className="flex items-end justify-between">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.3em]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  ACADEMY OPS
                </p>
                <p className="mt-1 text-2xl font-bold tracking-[0.15em] text-white">
                  성 적 통 지 표
                </p>
                <p
                  className="mt-0.5 text-[11px] tracking-widest"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  SCORE REPORT
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                  발급일: {issuedAt}
                </p>
                {selectedPeriod && (
                  <p className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                    기간: {selectedPeriod.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── 학생 정보 밴드 ── */}
          <div
            className="flex flex-wrap items-center gap-6 px-10 py-3 text-sm"
            style={{ backgroundColor: "#C55A11", color: "white" }}
          >
            <span className="font-semibold">{student.name}</span>
            <span>학번: {student.examNumber}</span>
            {student.examType && (
              <span>{EXAM_TYPE_LABEL[student.examType] ?? student.examType}</span>
            )}
            {student.phone && <span>{student.phone}</span>}
          </div>

          {/* ── 본문 ── */}
          <div className="px-10 py-6">
            {sessionRows.length === 0 ? (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-[#111827]/10 py-16 text-sm text-[#4B5563]">
                해당 기간의 성적 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#F7F4EF" }}>
                      <th className="border border-[#111827]/10 px-3 py-2.5 text-center text-xs font-semibold text-[#4B5563]">
                        회차
                      </th>
                      <th className="border border-[#111827]/10 px-3 py-2.5 text-center text-xs font-semibold text-[#4B5563]">
                        시험일
                      </th>
                      {displaySubjects.map((sub) => (
                        <th
                          key={sub}
                          className="border border-[#111827]/10 px-3 py-2.5 text-center text-xs font-semibold text-[#4B5563]"
                        >
                          {SUBJECT_LABEL[sub] ?? sub}
                        </th>
                      ))}
                      <th className="border border-[#111827]/10 px-3 py-2.5 text-center text-xs font-semibold text-[#1F4D3A]">
                        총점
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows.map((row, idx) => {
                      const isAbsent = row.attend === "ABSENT";
                      return (
                        <tr
                          key={row.sessionId}
                          className={idx % 2 === 0 ? "bg-white" : "bg-[#F7F4EF]/40"}
                        >
                          <td className="border border-[#111827]/10 px-3 py-2 text-center text-[#111827]">
                            {row.week}
                          </td>
                          <td className="border border-[#111827]/10 px-3 py-2 text-center text-[#4B5563] tabular-nums">
                            {formatKorDate(row.examDate)}
                          </td>
                          {displaySubjects.map((sub) => (
                            <td
                              key={sub}
                              className="border border-[#111827]/10 px-3 py-2 text-center tabular-nums"
                              style={{
                                color: isAbsent
                                  ? "#9CA3AF"
                                  : row.scores[sub] === undefined || row.scores[sub] === null
                                    ? "#9CA3AF"
                                    : "#111827",
                              }}
                            >
                              {isAbsent
                                ? "결"
                                : row.scores[sub] !== null && row.scores[sub] !== undefined
                                  ? (row.scores[sub] as number).toFixed(0)
                                  : "—"}
                            </td>
                          ))}
                          <td
                            className="border border-[#111827]/10 px-3 py-2 text-center font-semibold tabular-nums"
                            style={{
                              color: isAbsent
                                ? "#9CA3AF"
                                : row.totalScore !== null
                                  ? "#1F4D3A"
                                  : "#9CA3AF",
                            }}
                          >
                            {isAbsent
                              ? "결"
                              : row.totalScore !== null
                                ? row.totalScore.toFixed(0)
                                : "—"}
                          </td>
                        </tr>
                      );
                    })}

                    {/* 평균 행 */}
                    <tr style={{ backgroundColor: "#1F4D3A", color: "white" }}>
                      <td
                        className="border border-[#1F4D3A]/20 px-3 py-2.5 text-center text-xs font-bold"
                        colSpan={2}
                      >
                        과목별 평균
                      </td>
                      {displaySubjects.map((sub) => (
                        <td
                          key={sub}
                          className="border border-[#1F4D3A]/20 px-3 py-2.5 text-center text-xs font-bold tabular-nums"
                        >
                          {subjectAverages[sub] !== null && subjectAverages[sub] !== undefined
                            ? (subjectAverages[sub] as number).toFixed(1)
                            : "—"}
                        </td>
                      ))}
                      <td className="border border-[#1F4D3A]/20 px-3 py-2.5 text-center text-xs font-bold tabular-nums">
                        {totalAvg !== null ? totalAvg.toFixed(1) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 통계 요약 */}
            {sessionRows.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-4">
                <div className="rounded-2xl border border-[#111827]/10 bg-[#F7F4EF] px-5 py-3.5 text-sm">
                  <p className="text-xs text-[#4B5563]">총 회차</p>
                  <p className="mt-0.5 text-xl font-bold text-[#111827]">
                    {sessionRows.length}
                    <span className="ml-1 text-sm font-normal text-[#4B5563]">회</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-[#111827]/10 bg-[#F7F4EF] px-5 py-3.5 text-sm">
                  <p className="text-xs text-[#4B5563]">응시 횟수</p>
                  <p className="mt-0.5 text-xl font-bold text-[#1F4D3A]">
                    {sessionRows.filter((r) => r.attend !== "ABSENT").length}
                    <span className="ml-1 text-sm font-normal text-[#4B5563]">회</span>
                  </p>
                </div>
                <div className="rounded-2xl border border-[#111827]/10 bg-[#F7F4EF] px-5 py-3.5 text-sm">
                  <p className="text-xs text-[#4B5563]">결시 횟수</p>
                  <p className="mt-0.5 text-xl font-bold text-[#C55A11]">
                    {sessionRows.filter((r) => r.attend === "ABSENT").length}
                    <span className="ml-1 text-sm font-normal text-[#4B5563]">회</span>
                  </p>
                </div>
                {totalAvg !== null && (
                  <div className="rounded-2xl border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-5 py-3.5 text-sm">
                    <p className="text-xs text-[#4B5563]">총점 평균</p>
                    <p className="mt-0.5 text-xl font-bold text-[#1F4D3A]">
                      {totalAvg.toFixed(1)}
                      <span className="ml-1 text-sm font-normal text-[#4B5563]">점</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 학원 정보 + 직인 */}
            <div className="mt-8 flex items-end justify-between border-t border-[#111827]/10 pt-5">
              <div className="text-xs text-[#4B5563]">
                <p className="font-semibold text-sm text-[#111827]">학원명 미설정</p>
                <p className="mt-0.5">학원 주소는 관리자 설정을 확인하세요</p>
                <p className="mt-0.5">대표전화: 연락처는 관리자 설정을 확인하세요</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-[#4B5563]">학원장</p>
                <div
                  className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 text-center"
                  style={{ borderColor: "#C55A11", color: "#C55A11" }}
                >
                  <span className="text-[9px] font-semibold leading-tight">한국경찰</span>
                  <span className="text-[9px] font-semibold leading-tight">학원</span>
                  <span className="mt-0.5 text-[8px]">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 화면 전용 안내 */}
      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A4 가로(Landscape)로 선택하세요.
      </p>
    </div>
  );
}
