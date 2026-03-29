import Link from "next/link";
import { AdminRole, AttendType, ExamType } from "@prisma/client";
import { applyAcademyScope } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import {
  applyScoreSessionAcademyScope,
  resolveVisibleScoreSessionAcademyId,
} from "@/lib/scores/session-admin";
import { getScoreSubjectLabel } from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

function nowKST() {
  return new Date();
}

function startOfDayOffset(base: Date, offsetDays: number) {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function formatDate(date: Date) {
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}(${weekdays[date.getDay()]})`;
}

export default async function ScoresHubPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const academyId = await resolveVisibleScoreSessionAcademyId();
  const now = nowKST();
  const todayStart = startOfDayOffset(now, 0);
  const weekAgo = startOfDayOffset(now, -7);
  const monthAgo = startOfDayOffset(now, -30);

  const weekSessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: weekAgo, lt: todayStart },
      isCancelled: false,
    },
    academyId,
  );

  const recentSessionBaseWhere = applyScoreSessionAcademyScope({ isCancelled: false }, academyId);
  const missingSessionWhere = applyScoreSessionAcademyScope(
    {
      examDate: { gte: monthAgo, lt: todayStart },
      isCancelled: false,
      scores: { none: {} },
    },
    academyId,
  );

  const monthlyScoreWhere =
    academyId === null
      ? { createdAt: { gte: monthAgo } }
      : { createdAt: { gte: monthAgo }, session: { period: { academyId } } };

  const subjectCatalogPromise =
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });

  const [weekSessionCount, monthScoreCount, recentSessionCounts, activePeriodCount, recentSessionRows, missingSessions, subjectCatalog] =
    await Promise.all([
      prisma.examSession.count({ where: weekSessionWhere }),
      prisma.score.count({ where: monthlyScoreWhere }),
      prisma.examSession.findMany({
        where: applyScoreSessionAcademyScope(
          {
            examDate: { gte: monthAgo, lt: todayStart },
            isCancelled: false,
          },
          academyId,
        ),
        select: {
          id: true,
          _count: { select: { scores: true } },
        },
      }),
      prisma.examPeriod.count({ where: applyAcademyScope({ isActive: true }, academyId) }),
      prisma.examSession.findMany({
        where: recentSessionBaseWhere,
        orderBy: [{ examDate: "desc" }, { id: "desc" }],
        take: 10,
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          isLocked: true,
          period: { select: { name: true, isActive: true } },
          scores: { select: { finalScore: true, attendType: true } },
        },
      }),
      prisma.examSession.findMany({
        where: missingSessionWhere,
        orderBy: { examDate: "desc" },
        take: 20,
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          period: { select: { name: true, isActive: true } },
        },
      }),
      subjectCatalogPromise,
    ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  const missingEntryCount = recentSessionCounts.filter((session) => session._count.scores === 0).length;

  const recentRows = recentSessionRows.map((session) => {
    const validScores = session.scores.filter(
      (score) => score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE,
    );
    const scoreValues = validScores
      .map((score) => score.finalScore)
      .filter((value): value is number => value !== null && value !== undefined);
    const avgScore =
      scoreValues.length > 0
        ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
        : null;

    return {
      id: session.id,
      examType: session.examType,
      week: session.week,
      subject: getScoreSubjectLabel(
        session.subject,
        session.displaySubjectName,
        subjectLabelMap,
      ),
      examDate: session.examDate,
      isLocked: session.isLocked,
      periodName: session.period.name,
      periodIsActive: session.period.isActive,
      totalScores: session.scores.length,
      avgScore,
    };
  });

  const quickLinks = [
    {
      href: "/admin/scores/input",
      title: "성적 입력",
      description: "XLS, HTML, 붙여넣기 입력을 같은 회차 선택 흐름으로 처리합니다.",
      accent: "border-ember/30 hover:border-ember/30",
    },
    {
      href: "/admin/scores/bulk",
      title: "성적 일괄 입력",
      description: "텍스트 형태로 학생별 점수를 빠르게 한 번에 입력합니다.",
      accent: "border-forest/30 hover:border-forest/30",
    },
    {
      href: "/admin/scores/edit",
      title: "성적 수정",
      description: "기존 점수를 조회하고 수정하거나 삭제합니다.",
      accent: "border-ember/30 hover:border-ember/30",
    },
    {
      href: "/admin/scores/bulk-import",
      title: "CSV 일괄 입력",
      description: "CSV 파일을 불러와 학생별 성적을 일괄 등록합니다.",
      accent: "border-forest/30 hover:border-forest/30",
    },
    {
      href: "/admin/scores/import",
      title: "과목 CSV 가져오기",
      description: "과목별 CSV를 회차별 성적으로 안전하게 반영합니다.",
      accent: "border-ember/30 hover:border-ember/30",
    },
    {
      href: "/admin/scores/percentile",
      title: "백분위 분석",
      description: "점수 분포와 구간별 비율을 기준으로 백분위를 확인합니다.",
      accent: "border-ink/20 hover:border-ink/30",
    },
    {
      href: "/admin/exams/morning/scores",
      title: "아침 모의고사 현황",
      description: "기간별 회차 성적 현황과 점수 분포를 바로 확인합니다.",
      accent: "border-forest/30 hover:border-forest/30",
    },
    {
      href: "/admin/periods",
      title: "시험 기간 관리",
      description: "기수, 기간, 회차 생성과 활성 상태를 함께 관리합니다.",
      accent: "border-ink/20 hover:border-ink/30",
    },
    {
      href: "/admin/scores/sessions",
      title: "회차 목록",
      description: "잠금 상태와 미입력 회차를 확인하고 바로 이동합니다.",
      accent: "border-ink/20 hover:border-ink/30",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">성적 허브</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        아침 모의고사 성적 입력, 수정, 분석 화면으로 빠르게 이동하는 운영 허브입니다. 현재 선택된 지점 기준 KPI와 최근 회차 상황을 함께 보여줍니다.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">현황 요약</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">최근 7일 응시 회차</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{weekSessionCount}</p>
            <p className="mt-1 text-xs text-slate">최근 일주일 동안 진행된 회차 수</p>
          </article>

          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-forest">최근 30일 성적 입력</p>
            <p className="mt-3 text-3xl font-semibold text-forest">{monthScoreCount}</p>
            <p className="mt-1 text-xs text-slate">현재 지점 기준 성적 등록 건수</p>
          </article>

          <article className={missingEntryCount > 0 ? "rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-panel" : "rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"}>
            <p className={missingEntryCount > 0 ? "text-xs font-semibold uppercase tracking-[0.18em] text-amber-700" : "text-xs font-semibold uppercase tracking-[0.18em] text-slate"}>
              미입력 회차
            </p>
            <p className={missingEntryCount > 0 ? "mt-3 text-3xl font-semibold text-amber-700" : "mt-3 text-3xl font-semibold text-ink"}>{missingEntryCount}</p>
            <p className="mt-1 text-xs text-slate">최근 30일 기준 성적이 비어 있는 회차</p>
          </article>

          <article className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">활성 기간</p>
            <p className="mt-3 text-3xl font-semibold text-ember">{activePeriodCount}</p>
            <p className="mt-1 text-xs text-slate">현재 지점에서 활성화된 시험 기간 수</p>
          </article>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">빠른 이동</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel transition hover:shadow-md ${item.accent}`}
            >
              <p className="font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {missingSessions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">미입력 회차 알림 (최근 30일)</h2>
          <div className="rounded-[28px] border border-amber-200 bg-amber-50/60 shadow-panel">
            <div className="flex items-start gap-3 border-b border-amber-200 px-6 py-4">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-amber-800">
                아래 {missingSessions.length}개 회차는 아직 성적이 입력되지 않았습니다. <Link href="/admin/scores/input" className="font-semibold underline hover:text-amber-900">성적 입력</Link>에서 바로 처리할 수 있습니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-amber-200/60">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">날짜</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">기간</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">직렬</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">주차</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">과목</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">바로가기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/40">
                  {missingSessions.map((session) => (
                    <tr key={session.id} className="transition hover:bg-amber-100/40">
                      <td className="px-6 py-3 text-slate">{formatDate(session.examDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-ink">
                          {session.period.name}
                          {session.period.isActive && <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">현재</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={session.examType === ExamType.GONGCHAE ? "inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest" : "inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember"}>
                          {EXAM_TYPE_LABEL[session.examType]}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">{session.week}주차</span></td>
                      <td className="px-4 py-3 font-medium text-ink">{getScoreSubjectLabel(session.subject, session.displaySubjectName, subjectLabelMap)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/scores/input?sessionId=${session.id}`} className="inline-flex items-center rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100">
                          입력
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">최근 회차 현황 (최신 10건)</h2>
          <Link href="/admin/exams/morning/scores" className="text-xs font-semibold text-forest transition hover:underline">
            전체 보기
          </Link>
        </div>

        {recentRows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            등록된 회차가 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">날짜</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">기간</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">직렬</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">주차</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">과목</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">입력 수</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">평균</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {recentRows.map((row) => (
                    <tr key={row.id} className="transition hover:bg-mist/60">
                      <td className="px-6 py-3 text-slate">{formatDate(row.examDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-ink">
                          {row.periodName}
                          {row.periodIsActive && <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">현재</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={row.examType === ExamType.GONGCHAE ? "inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest" : "inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember"}>
                          {EXAM_TYPE_LABEL[row.examType]}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">{row.week}주차</span></td>
                      <td className="px-4 py-3 font-medium text-ink">{row.subject}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {row.totalScores > 0 ? row.totalScores : <span className="font-semibold text-amber-600">미입력</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                        {row.avgScore !== null ? <span>{row.avgScore}점</span> : <span className="font-normal text-ink/25">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/admin/scores/sessions/${row.id}`} className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink">
                            상세
                          </Link>
                          {row.totalScores === 0 ? (
                            <Link href={`/admin/scores/input?sessionId=${row.id}`} className="inline-flex items-center rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20">
                              입력
                            </Link>
                          ) : (
                            <Link href={`/admin/scores/edit?sessionId=${row.id}`} className="inline-flex items-center rounded-full border border-forest/30 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10">
                              수정
                            </Link>
                          )}
                          {row.isLocked && <span className="inline-flex items-center rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate">잠금</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
