import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { getStudentHistory } from "@/lib/students/service";
import { getStudentCumulativeAnalysis, getStudentDetailAnalysis, getStudentCounselingBriefing, getStudentMonthlyBreakdown } from "@/lib/analytics/analysis";
import { CounselingBriefing, type MonthlyScoreEntry } from "./analysis/counseling-briefing";
import { MonthlySummary, type MonthlySummaryRow } from "./analysis/monthly-summary";
import { getCounselingProfile } from "@/lib/counseling/service";
import { getStudentTimeline } from "@/lib/students/timeline";
import { StudentScoreHistoryManager } from "@/components/students/student-score-history-manager";
import { StudentCumulativeAnalysis } from "@/components/students/student-cumulative-analysis";
import { StudentTimeline } from "@/components/students/student-timeline";
import { CounselingPanel } from "@/components/counseling/counseling-panel";
import {
  StudentEnrollmentsPanel,
  type StudentEnrollmentRow,
} from "@/components/students/student-enrollments-panel";
import {
  StudentPaymentHistory,
  type PaymentHistoryRow,
} from "./student-payment-history";
import { StudentPointHistory, type PointHistoryRow } from "./student-point-history";
import { AttendanceHistorySection } from "./student-attendance-history";
import {
  StudentAdminMemos,
  type AdminMemoRow,
} from "./student-admin-memos";
import { StudentScoreChart, type ScoreChartPoint } from "./student-score-chart";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_SUBJECTS, EXAM_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { BarComparisonChart, PercentileLineChart, RadarComparisonChart, TrendLineChart } from "@/components/analytics/charts";
import { SubjectScoreHeatmap } from "@/components/analytics/subject-score-heatmap";
import { SubjectHeatmap } from "@/components/analytics/subject-heatmap";
import { CounselingBriefingCard } from "@/components/students/counseling-briefing-card";
import { AbsenceRiskBanner } from "@/components/students/absence-risk-banner";
import { StudentAttendanceCalendar } from "@/components/students/student-attendance-calendar";
import { ConsentToggle } from "./consent-toggle";
import { SuspendButton } from "./suspend-button";
import { ToggleActiveButton } from "./toggle-active-button";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { WrongNotesAdminView } from "./wrong-notes-admin-view";
import { PercentileChart, type PercentileSessionData } from "./analysis/percentile-chart";
import { CounselingScoreSummary } from "@/components/students/counseling-score-summary";

export const dynamic = "force-dynamic";

const TABS = [
  "history",
  "score-chart",
  "cumulative",
  "analysis",
  "timeline",
  "counseling",
  "enrollments",
  "payments",
  "points",
  "attendance",
  "wrong-notes",
  "memos",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  history: "성적 이력",
  "score-chart": "성적 차트",
  cumulative: "누적 분석",
  analysis: "기간별 분석",
  timeline: "타임라인",
  counseling: "면담",
  enrollments: "수업",
  payments: "수납",
  points: "포인트",
  attendance: "출결 이력",
  "wrong-notes": "오답노트",
  memos: "메모",
};

type PageProps = {
  params: { examNumber: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentHubPage({ params, searchParams }: PageProps) {
  const rawTab = readParam(searchParams, "tab");
  const requestedTab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "history";

  const [context, student] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getStudentHistory(params.examNumber),
  ]);
  if (!student) notFound();
  const canEdit = roleAtLeast(context.adminUser.role, AdminRole.TEACHER);
  const canManageSuspension = roleAtLeast(context.adminUser.role, AdminRole.COUNSELOR);
  const canAccessBillingTabs = roleAtLeast(context.adminUser.role, AdminRole.COUNSELOR);
  const tab: Tab =
    !canAccessBillingTabs && (requestedTab === "payments" || requestedTab === "enrollments")
      ? "history"
      : requestedTab;

  // 수강 등록 상태 조회 (휴원/복교 버튼 표시 여부 결정)
  let suspendStatus: "active" | "suspended" | "none" = "none";
  if (canManageSuspension) {
    const enrollmentCounts = await getPrisma().courseEnrollment.groupBy({
      by: ["status"],
      where: {
        examNumber: params.examNumber,
        status: { in: ["ACTIVE", "SUSPENDED"] },
      },
      _count: true,
    });
    const hasActive = enrollmentCounts.some((e) => e.status === "ACTIVE");
    const hasSuspended = enrollmentCounts.some((e) => e.status === "SUSPENDED");
    if (hasSuspended) suspendStatus = "suspended";
    else if (hasActive) suspendStatus = "active";
  }

  let cumulativeData = null;
  let analysisData = null;
  let monthlyAnalysisData: {
    monthlyRows: MonthlySummaryRow[];
    counselingRows: MonthlyScoreEntry[];
    currentEnrollment: { cohortName: string; status: string; endDate: string | null } | null;
    hasOverduePayment: boolean;
    lastScoreDate: string | null;
  } | null = null;
  let timelineData = null;
  let counselingProfile = null;
  let briefingData = null;
  let studentEnrollments: StudentEnrollmentRow[] | null = null;
  let studentPayments: PaymentHistoryRow[] | null = null;
  let scoreChartPoints: ScoreChartPoint[] | null = null;
  let studentPoints: PointHistoryRow[] | null = null;
  let studentMemos: AdminMemoRow[] | null = null;
  let attendanceLogs: {
    id: string;
    attendDate: Date;
    attendType: import("@prisma/client").AttendType;
    classroom: { name: string; generation: number | null } | null;
  }[] = [];
  type WrongNoteBookmarkWithQuestion = {
    id: number;
    memo: string | null;
    createdAt: Date;
    question: {
      id: number;
      questionNo: number;
      correctAnswer: string;
      correctRate: number | null;
      difficulty: string | null;
      questionSession: {
        subject: import("@prisma/client").Subject;
        examType: string;
        examDate: Date;
      };
    };
  };
  let wrongNotesData: WrongNoteBookmarkWithQuestion[] = [];

  if (tab === "score-chart") {
    // student.scores는 이미 로드됨 — AttendType이 ABSENT이 아닌 것만 차트에 표시
    scoreChartPoints = student.scores
      .filter((s) => s.attendType !== "ABSENT" && s.finalScore !== null)
      .map((s) => ({
        sessionId: s.session.id,
        week: s.session.week,
        subject: s.session.subject,
        subjectLabel:
          (
            {
              CONSTITUTIONAL_LAW: "헌법",
              CRIMINAL_LAW: "형법",
              CRIMINAL_PROCEDURE: "형소법",
              POLICE_SCIENCE: "경찰학",
              CRIMINOLOGY: "범죄학",
              CUMULATIVE: "누적",
            } as Record<string, string>
          )[s.session.subject] ?? s.session.subject,
        examDate: s.session.examDate.toISOString(),
        finalScore: s.finalScore,
      }));
  } else if (tab === "cumulative") {
    cumulativeData = await getStudentCumulativeAnalysis(params.examNumber);
  } else if (tab === "analysis") {
    const periodId = Number(readParam(searchParams, "periodId")) || undefined;
    const recent = Number(readParam(searchParams, "recent")) || undefined;

    // Load analysis data and monthly breakdown in parallel
    const [detailResult, activePeriodResult] = await Promise.all([
      getStudentDetailAnalysis({ examNumber: params.examNumber, periodId, recent }),
      getPrisma().examPeriod.findFirst({
        where: {
          isActive: true,
          sessions: { some: { examType: student.examType } },
        },
        orderBy: { startDate: "desc" },
        select: { id: true },
      }),
    ]);
    analysisData = detailResult;

    if (activePeriodResult?.id) {
      const [monthlyRows, currentEnrollmentRaw, overdueCount, lastSession] = await Promise.all([
        getStudentMonthlyBreakdown({ examNumber: params.examNumber, periodId: activePeriodResult.id }),
        getPrisma().courseEnrollment.findFirst({
          where: { examNumber: params.examNumber, status: { in: ["ACTIVE", "SUSPENDED"] } },
          orderBy: { createdAt: "desc" },
          include: {
            cohort: { select: { name: true } },
            product: { select: { name: true } },
          },
        }),
        getPrisma().installment.count({
          where: {
            payment: { examNumber: params.examNumber },
            dueDate: { lt: new Date() },
            paidAt: null,
          },
        }),
        getPrisma().examSession.findFirst({
          where: {
            examType: student.examType,
            isCancelled: false,
            scores: { some: { examNumber: params.examNumber, attendType: { not: "ABSENT" } } },
          },
          orderBy: { examDate: "desc" },
          select: { examDate: true },
        }),
      ]);

      const last6Monthly = monthlyRows.slice(-6);

      // Build per-month subject averages from student.scores (already loaded)
      const subjectLabelMap: Record<string, string> = {
        CONSTITUTIONAL_LAW: "헌법",
        CRIMINAL_LAW: "형법",
        CRIMINAL_PROCEDURE: "형소법",
        POLICE_SCIENCE: "경찰학",
        CRIMINOLOGY: "범죄학",
        CUMULATIVE: "누적",
      };

      const monthSubjectMap = new Map<string, Map<string, number[]>>();
      for (const score of student.scores) {
        if (score.attendType === "ABSENT") continue;
        const val = score.finalScore ?? score.rawScore ?? null;
        if (val === null) continue;
        const d = score.session.examDate;
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const subjectLabel = subjectLabelMap[score.session.subject] ?? score.session.subject;
        const subMap = monthSubjectMap.get(mk) ?? new Map<string, number[]>();
        const existing = subMap.get(subjectLabel) ?? [];
        existing.push(val);
        subMap.set(subjectLabel, existing);
        monthSubjectMap.set(mk, subMap);
      }

      const toMonthlySummaryRow = (row: typeof last6Monthly[number]): MonthlySummaryRow => ({
        month: `${row.year}-${String(row.month).padStart(2, "0")}`,
        monthLabel: row.monthLabel,
        sessionCount: row.sessionCount,
        attendedCount: row.attendedCount,
        absentCount: row.absentCount,
        excusedCount: row.excusedCount,
        studentAverage: row.studentAverage,
        cohortAverage: row.cohortAverage,
        studentRank: row.studentRank,
        totalParticipants: row.totalParticipants,
        changeFromPrevMonth: row.changeFromPrevMonth,
        participationRate:
          row.sessionCount > 0 ? Math.round((row.attendedCount / row.sessionCount) * 100) : 0,
      });

      const toCounselingRow = (row: typeof last6Monthly[number]): MonthlyScoreEntry => {
        const mk = `${row.year}-${String(row.month).padStart(2, "0")}`;
        const subMap = monthSubjectMap.get(mk);
        const subjectScores: Record<string, number | null> = {};
        if (subMap) {
          for (const [subject, scores] of Array.from(subMap.entries())) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            subjectScores[subject] = Math.round(avg * 10) / 10;
          }
        }
        return {
          month: mk,
          monthLabel: row.monthLabel,
          avg: row.studentAverage,
          participationRate:
            row.sessionCount > 0 ? Math.round((row.attendedCount / row.sessionCount) * 100) : 0,
          subjectScores,
          attendedCount: row.attendedCount,
          sessionCount: row.sessionCount,
          changeFromPrev: row.changeFromPrevMonth,
        };
      };

      monthlyAnalysisData = {
        monthlyRows: last6Monthly.map(toMonthlySummaryRow),
        counselingRows: last6Monthly.map(toCounselingRow),
        currentEnrollment: currentEnrollmentRaw
          ? {
              cohortName: currentEnrollmentRaw.cohort?.name ?? currentEnrollmentRaw.product?.name ?? "수강",
              status: currentEnrollmentRaw.status,
              endDate: currentEnrollmentRaw.endDate ? currentEnrollmentRaw.endDate.toISOString() : null,
            }
          : null,
        hasOverduePayment: overdueCount > 0,
        lastScoreDate: lastSession ? lastSession.examDate.toISOString() : null,
      };
    }
  } else if (tab === "timeline") {
    if (!canEdit) redirect(`/admin/students/${params.examNumber}?tab=history`);
    timelineData = await getStudentTimeline({ examNumber: params.examNumber });
  } else if (tab === "counseling") {
    if (!canEdit) redirect(`/admin/students/${params.examNumber}?tab=history`);
    [counselingProfile, briefingData] = await Promise.all([
      getCounselingProfile(params.examNumber),
      getStudentCounselingBriefing(params.examNumber),
    ]);
  } else if (tab === "enrollments") {
    const rows = await getPrisma().courseEnrollment.findMany({
      where: { examNumber: params.examNumber },
      include: {
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        staff: { select: { name: true } },
        leaveRecords: { orderBy: { leaveDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    studentEnrollments = rows.map((e) => ({
      id: e.id,
      courseType: e.courseType,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate ? e.endDate.toISOString() : null,
      regularFee: e.regularFee,
      discountAmount: e.discountAmount,
      finalFee: e.finalFee,
      status: e.status,
      isRe: e.isRe,
      createdAt: e.createdAt.toISOString(),
      cohort: e.cohort
        ? { name: e.cohort.name, examCategory: e.cohort.examCategory as string }
        : null,
      product: e.product,
      specialLecture: e.specialLecture,
      staff: e.staff,
      leaveRecords: e.leaveRecords.map((l) => ({
        id: l.id,
        leaveDate: l.leaveDate.toISOString(),
        returnDate: l.returnDate ? l.returnDate.toISOString() : null,
        reason: l.reason,
      })),
    }));
  } else if (tab === "payments") {
    const rows = await getPrisma().payment.findMany({
      where: { examNumber: params.examNumber },
      include: {
        items: true,
        processor: { select: { name: true } },
        refunds: { select: { amount: true, refundType: true, processedAt: true } },
      },
      orderBy: { processedAt: "desc" },
    });
    studentPayments = rows.map((p) => ({
      id: p.id,
      category: p.category,
      method: p.method,
      status: p.status,
      grossAmount: p.grossAmount,
      discountAmount: p.discountAmount,
      couponAmount: p.couponAmount,
      pointAmount: p.pointAmount,
      netAmount: p.netAmount,
      note: p.note,
      processedAt: p.processedAt.toISOString(),
      processor: p.processor,
      items: p.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        itemType: item.itemType,
        amount: item.amount,
        quantity: item.quantity,
      })),
      refunds: p.refunds.map((r) => ({
        amount: r.amount,
        refundType: r.refundType as string,
        processedAt: r.processedAt.toISOString(),
      })),
    }));
  } else if (tab === "points") {
    const rows = await getPrisma().pointLog.findMany({
      where: { examNumber: params.examNumber },
      include: { period: { select: { name: true } } },
      orderBy: { grantedAt: "desc" },
    });
    studentPoints = rows.map((p) => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      reason: p.reason,
      grantedAt: p.grantedAt.toISOString(),
      grantedBy: p.grantedBy,
      period: p.period ? { name: p.period.name } : null,
    }));
  } else if (tab === "attendance") {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    attendanceLogs = await getPrisma()
      .classroomAttendanceLog.findMany({
        where: {
          examNumber: params.examNumber,
          attendDate: { gte: sixMonthsAgo },
        },
        include: {
          classroom: { select: { name: true, generation: true } },
        },
        orderBy: { attendDate: "desc" },
        take: 200,
      })
      .catch(() => []);
  } else if (tab === "wrong-notes") {
    const bookmarks = await getPrisma().wrongNoteBookmark.findMany({
      where: { examNumber: params.examNumber },
      include: {
        question: {
          select: {
            id: true,
            questionNo: true,
            correctAnswer: true,
            correctRate: true,
            difficulty: true,
            questionSession: {
              select: {
                subject: true,
                examType: true,
                examDate: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    wrongNotesData = bookmarks;
  } else if (tab === "memos") {
    const viewerId = context.adminUser.id;
    const rows = await getPrisma().adminMemo.findMany({
      where: {
        relatedStudentExamNumber: params.examNumber,
        OR: [
          { scope: "TEAM" },
          { ownerId: viewerId },
          { assigneeId: viewerId },
        ],
      },
      include: {
        owner: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });
    studentMemos = rows.map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content,
      color: m.color,
      scope: m.scope,
      status: m.status,
      isPinned: m.isPinned,
      dueAt: m.dueAt ? m.dueAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      owner: m.owner,
      assignee: m.assignee,
    }));
  }

  const canViewPayments = roleAtLeast(context.adminUser.role, AdminRole.COUNSELOR);
  const visibleTabs: Tab[] = [
    "history",
    "score-chart",
    "cumulative",
    "analysis",
    ...(canEdit ? (["timeline", "counseling"] as Tab[]) : []),
    ...(canViewPayments ? (["enrollments", "payments"] as Tab[]) : []),
    "points",
    "attendance",
    "wrong-notes",
    ...(canEdit ? (["memos"] as Tab[]) : []),
  ];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "학사 관리", href: "/admin/students" },
          { label: "전체 명단", href: "/admin/students" },
          { label: `${student.name} (${student.examNumber})` },
        ]}
      />
      {/* 헤더 */}
      <div>
        <Link href="/admin/students" className="text-sm text-slate transition hover:text-ember">
          ← 수강생 목록
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">
          {student.name}
          <span className="ml-3 text-xl font-normal text-slate">{student.examNumber}</span>
        </h1>
        <p className="mt-2 text-sm text-slate">
          {EXAM_TYPE_LABEL[student.examType]}
          {student.className ? ` · ${student.className}반` : ""}
          {student.generation ? ` · ${student.generation}기` : ""}
          {!student.isActive && (
            <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
              비활성
            </span>
          )}
          {suspendStatus === "suspended" && (
            <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              휴원 중
            </span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/students/${params.examNumber}/score-report`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 px-3 py-1.5 text-xs font-semibold text-forest transition hover:border-forest/50"
          >
            성적통지표
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/progress`}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-3 py-1.5 text-xs font-semibold text-forest transition hover:bg-forest/10"
          >
            종합 리포트
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/score-trend`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 px-3 py-1.5 text-xs font-semibold text-ember transition hover:border-ember/50"
          >
            아침모의고사 추이
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/scores`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-semibold text-ember transition hover:border-ember/50 hover:bg-ember/10"
          >
            통합 성적
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/contact-info`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
          >
            연락처 정보
          </Link>
          {canManageSuspension && (
            <Link
              href={`/admin/students/${params.examNumber}/parent-info`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
            >
              보호자 정보
            </Link>
          )}
          <Link
            href={`/admin/students/${params.examNumber}/documents`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
          >
            공식 서류
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/points`}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:border-amber-400"
          >
            포인트 관리
          </Link>
          <Link
            href={`/admin/students/${params.examNumber}/attendance`}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-400"
          >
            출결 캘린더
          </Link>
          {canEdit && (
            <Link
              href={`/admin/students/${params.examNumber}/memos`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
            >
              메모 스레드
            </Link>
          )}
          {canManageSuspension && (
            <Link
              href={`/admin/students/${params.examNumber}/notifications`}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:bg-sky-100"
            >
              알림 내역
            </Link>
          )}
          <Link
            href={`/admin/students/compare?a=${params.examNumber}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-3 py-1.5 text-xs font-semibold text-forest transition hover:border-forest/40 hover:bg-forest/10"
          >
            다른 학생과 비교 →
          </Link>
          {canManageSuspension && (
            <Link
              href={`/admin/students/${params.examNumber}/leave`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100"
            >
              휴원 관리
            </Link>
          )}
          {canManageSuspension && (
            <SuspendButton examNumber={params.examNumber} suspendStatus={suspendStatus} />
          )}
          {canManageSuspension && (
            <ToggleActiveButton examNumber={params.examNumber} isActive={student.isActive} />
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="mt-8 flex gap-1 border-b border-ink/10">
        {visibleTabs.map((t) => (
          <Link
            key={t}
            href={`/admin/students/${params.examNumber}?tab=${t}`}
            className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === t
                ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="mt-6">
        {/* 성적 이력 */}
        {tab === "history" && (
          <div className="space-y-6">
            <AbsenceRiskBanner
              scores={student.scores.map((score) => ({
                attendType: score.attendType,
                session: { examDate: score.session.examDate.toISOString() },
              }))}
            />
            <StudentAttendanceCalendar
              scores={student.scores.map((score) => ({
                attendType: score.attendType,
                session: {
                  examDate: score.session.examDate.toISOString(),
                  subject: score.session.subject,
                  week: score.session.week,
                  finalScore: score.finalScore,
                },
              }))}
            />
            {/* 개인정보 동의 현황 */}
            <section className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="text-base font-semibold text-ink">개인정보 동의 현황</h2>
              <div className="mt-4 space-y-4">
                {/* 필수 동의 */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">개인정보 수집·이용 동의</p>
                    <p className="mt-0.5 text-xs text-slate">필수 동의</p>
                  </div>
                  <div className="text-right">
                    {student.registeredAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                        ✓ 동의 완료 ({formatDate(student.registeredAt)})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        ⚠ 미동의 (등록 시 서명 필요)
                      </span>
                    )}
                  </div>
                </div>

                {/* 마케팅 SMS 동의 */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">마케팅 SMS 수신 동의</p>
                    <p className="mt-0.5 text-xs text-slate">선택 동의</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {student.notificationConsent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                        ✓ 동의{student.consentedAt ? ` (${formatDate(student.consentedAt)})` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        ☐ 미동의
                      </span>
                    )}
                    {canEdit && (
                      <ConsentToggle
                        examNumber={student.examNumber}
                        currentConsent={student.notificationConsent}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <StudentScoreHistoryManager
              canEdit={canEdit}
              initialStudent={{
                examNumber: student.examNumber,
                name: student.name,
                className: student.className,
                generation: student.generation,
                examType: student.examType,
                currentStatus: student.currentStatus,
                scores: student.scores.map((score) => ({
                  id: score.id,
                  rawScore: score.rawScore,
                  oxScore: score.oxScore,
                  finalScore: score.finalScore,
                  attendType: score.attendType,
                  note: score.note,
                  sourceType: score.sourceType,
                  session: {
                    id: score.session.id,
                    week: score.session.week,
                    subject: score.session.subject,
                    examDate: score.session.examDate.toISOString(),
                    period: { name: score.session.period.name },
                  },
                })),
              }}
            />
          </div>
        )}

        {/* 누적 분석 */}
        {tab === "cumulative" &&
          (cumulativeData ? (
            <StudentCumulativeAnalysis data={cumulativeData} />
          ) : (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              아직 성적 데이터가 없습니다.
            </div>
          ))}

        {/* 기간별 분석 */}
        {tab === "analysis" &&
          (!analysisData ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              분석할 성적이 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 면담 브리핑 카드 */}
              {monthlyAnalysisData && (
                <CounselingBriefing
                  examNumber={params.examNumber}
                  studentName={student.name}
                  monthlyScores={monthlyAnalysisData.counselingRows}
                  currentEnrollment={monthlyAnalysisData.currentEnrollment}
                  hasOverduePayment={monthlyAnalysisData.hasOverduePayment}
                  lastScoreDate={monthlyAnalysisData.lastScoreDate}
                />
              )}

              {/* 월별 성적 요약 */}
              {monthlyAnalysisData && monthlyAnalysisData.monthlyRows.length > 0 && (
                <MonthlySummary rows={monthlyAnalysisData.monthlyRows} />
              )}

              {/* 백분위 추이 차트 */}
              {(() => {
                const percentileSessions: PercentileSessionData[] = analysisData.trendData
                  .filter(
                    (row) =>
                      row.studentScore !== null &&
                      row.studentRank !== null &&
                      row.participantCount > 0 &&
                      row.percentile !== null,
                  )
                  .map((row) => ({
                    sessionLabel: row.label,
                    examDate: row.examDate instanceof Date
                      ? row.examDate.toISOString()
                      : String(row.examDate),
                    rank: row.studentRank!,
                    totalStudents: row.participantCount,
                    avgScore: row.studentScore!,
                    // Convert from "lower is better" to "higher is better" (upper percentile)
                    percentile: Math.round((1 - row.studentRank! / row.participantCount) * 100),
                  }));
                if (percentileSessions.length === 0) return null;
                return (
                  <PercentileChart
                    sessions={percentileSessions}
                    studentName={student.name}
                  />
                );
              })()}

              <form className="flex flex-wrap gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
                <input type="hidden" name="tab" value="analysis" />
                <select
                  name="periodId"
                  defaultValue={
                    analysisData.selectedPeriod?.id ? String(analysisData.selectedPeriod.id) : ""
                  }
                  className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  {analysisData.availablePeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
                <select
                  name="recent"
                  defaultValue={analysisData.recentCount ? String(analysisData.recentCount) : ""}
                  className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  <option value="">전체 회차</option>
                  <option value="5">최근 5회</option>
                  <option value="10">최근 10회</option>
                  <option value="20">최근 20회</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
                >
                  적용
                </button>
              </form>

              {analysisData.selectedPeriod && (
                <>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                      <h2 className="text-xl font-semibold">과목별 레이더</h2>
                      <div className="mt-4">
                        <RadarComparisonChart data={analysisData.radarData ?? []} />
                      </div>
                    </section>
                    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                      <h2 className="text-xl font-semibold">과목 평균 비교</h2>
                      <div className="mt-4">
                        <BarComparisonChart
                          data={analysisData.subjectSummary.map((row) => ({
                            subject: row.subject,
                            studentAverage: row.studentAverage ?? 0,
                            cohortAverage: row.cohortAverage ?? 0,
                            top10Average: row.top10Average ?? 0,
                          }))}
                          xKey="subject"
                          bars={[
                            { dataKey: "studentAverage", color: "#EA580C", name: "개인 평균" },
                            { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                            { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                          ]}
                        />
                      </div>
                    </section>
                  </div>

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">회차별 추이</h2>
                    <div className="mt-4">
                      <TrendLineChart
                        data={analysisData.trendData.map((row) => ({
                          label: row.label,
                          studentScore: row.studentScore,
                          cohortAverage: row.cohortAverage,
                          top10Average: row.top10Average,
                          top30Average: row.top30Average,
                        }))}
                        xKey="label"
                        lines={[
                          { dataKey: "studentScore", color: "#EA580C", name: "개인 점수" },
                          { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                          { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                          { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                        ]}
                      />
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">백분위 추이 <span className="text-sm font-normal text-slate">(낮을수록 상위권)</span></h2>
                    <p className="mt-1 text-sm text-slate">
                      점선: 상위 10% / 30% / 50% 기준선
                    </p>
                    <div className="mt-4">
                      <PercentileLineChart
                        data={analysisData.trendData.map((row) => ({
                          label: row.label,
                          percentile: row.percentile,
                          studentRank: row.studentRank,
                          participantCount: row.participantCount,
                        }))}
                      />
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">과목별 비교 테이블</h2>
                    <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">과목</th>
                            <th className="px-4 py-3 font-semibold">개인 평균</th>
                            <th className="px-4 py-3 font-semibold">목표</th>
                            <th className="px-4 py-3 font-semibold">전체 평균</th>
                            <th className="px-4 py-3 font-semibold">최고점</th>
                            <th className="px-4 py-3 font-semibold">상위 10%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {analysisData.subjectSummary.map((row) => (
                            <tr key={row.subject}>
                              <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                              <td className="px-4 py-3">{row.studentAverage ?? "-"}</td>
                              <td className="px-4 py-3">{row.targetScore ?? "-"}</td>
                              <td className="px-4 py-3">{row.cohortAverage ?? "-"}</td>
                              <td className="px-4 py-3">{row.highestScore ?? "-"}</td>
                              <td className="px-4 py-3">{row.top10Average ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <SubjectScoreHeatmap data={analysisData.subjectHeatmap} />

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">과목 × 주차 성적 히트맵</h2>
                    <p className="mt-2 text-sm text-slate">
                      각 과목의 주차별 평균 점수를 색상으로 표시합니다.
                    </p>
                    <div className="mt-4">
                      <SubjectHeatmap
                        examNumber={params.examNumber}
                        periodId={analysisData.selectedPeriod.id}
                      />
                    </div>
                  </section>

                  {analysisData.monthlyBreakdown.length > 0 && (
                    <section className="rounded-[28px] border border-ink/10 bg-white overflow-hidden p-6">
                      <h2 className="text-xl font-semibold">월별 성적 요약</h2>
                      <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                        <table className="min-w-full divide-y divide-ink/10 text-sm">
                          <thead className="bg-mist/80 text-left">
                            <tr>
                              <th className="px-4 py-3 font-semibold">월</th>
                              <th className="px-4 py-3 font-semibold">응시</th>
                              <th className="px-4 py-3 font-semibold">무단결시</th>
                              <th className="px-4 py-3 font-semibold">사유결시</th>
                              <th className="px-4 py-3 font-semibold">개인평균</th>
                              <th className="px-4 py-3 font-semibold">석차</th>
                              <th className="px-4 py-3 font-semibold">전체평균</th>
                              <th className="px-4 py-3 font-semibold">전월비</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink/10">
                            {analysisData.monthlyBreakdown.map((row) => (
                              <tr key={`${row.year}-${row.month}`}>
                                <td className="px-4 py-3 font-medium">{row.monthLabel}</td>
                                <td className="px-4 py-3">
                                  {row.attendedCount}/{row.sessionCount}
                                </td>
                                <td className="px-4 py-3">
                                  {row.absentCount > 0 ? (
                                    <span className="text-ember font-medium">{row.absentCount}회</span>
                                  ) : (
                                    <span className="text-slate">0회</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {row.excusedCount > 0 ? (
                                    <span className="font-medium">{row.excusedCount}회</span>
                                  ) : (
                                    <span className="text-slate">0회</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {row.studentAverage !== null ? row.studentAverage.toFixed(1) : <span className="text-slate">-</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {row.studentRank !== null ? (
                                    `${row.studentRank}위 / ${row.totalParticipants}명`
                                  ) : (
                                    <span className="text-slate">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {row.cohortAverage !== null ? row.cohortAverage.toFixed(1) : <span className="text-slate">-</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {row.changeFromPrevMonth === null ? (
                                    <span className="text-slate">-</span>
                                  ) : (
                                    <span
                                      className={
                                        row.changeFromPrevMonth > 0
                                          ? "text-forest font-medium"
                                          : row.changeFromPrevMonth < 0
                                            ? "text-ember"
                                            : "text-slate"
                                      }
                                    >
                                      {row.changeFromPrevMonth > 0 ? "+" : ""}
                                      {row.changeFromPrevMonth.toFixed(1)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                    <h2 className="text-xl font-semibold">오답 상위 문항</h2>
                    <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                      <table className="min-w-full divide-y divide-ink/10 text-sm">
                        <thead className="bg-mist/80 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold">시험일</th>
                            <th className="px-4 py-3 font-semibold">과목</th>
                            <th className="px-4 py-3 font-semibold">문항</th>
                            <th className="px-4 py-3 font-semibold">정답</th>
                            <th className="px-4 py-3 font-semibold">학생 답안</th>
                            <th className="px-4 py-3 font-semibold">정답률</th>
                            <th className="px-4 py-3 font-semibold">난이도</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/10">
                          {analysisData.wrongQuestionRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate">
                                오답 문항 데이터가 없습니다.
                              </td>
                            </tr>
                          ) : null}
                          {analysisData.wrongQuestionRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                              <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                              <td className="px-4 py-3">{row.questionNo}</td>
                              <td className="px-4 py-3">{row.correctAnswer}</td>
                              <td className="px-4 py-3">{row.answer}</td>
                              <td className="px-4 py-3">
                                {row.correctRate !== null && row.correctRate !== undefined
                                  ? `${row.correctRate.toFixed(1)}%`
                                  : "-"}
                              </td>
                              <td className="px-4 py-3">{row.difficulty ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          ))}

        {/* 면담 */}
        {tab === "timeline" && timelineData && (
          <StudentTimeline examNumber={params.examNumber} initialData={timelineData} />
        )}

        {tab === "counseling" && counselingProfile && (
          <div className="space-y-6">
            {briefingData && (
              <CounselingScoreSummary
                examNumber={params.examNumber}
                briefing={briefingData}
              />
            )}
            {briefingData && <CounselingBriefingCard briefing={briefingData} />}
            <CounselingPanel
              examNumber={counselingProfile.student.examNumber}
              defaultCounselorName={context.adminUser.name}
              targetScores={counselingProfile.student.targetScores}
              subjects={EXAM_TYPE_SUBJECTS[counselingProfile.student.examType]}
              records={counselingProfile.counselingRecords.map((record) => ({
                id: record.id,
                examNumber: record.examNumber,
                counselorName: record.counselorName,
                content: record.content,
                recommendation: record.recommendation,
                counseledAt: record.counseledAt.toISOString(),
                nextSchedule: record.nextSchedule ? record.nextSchedule.toISOString() : null,
              }))}
            />
          </div>
        )}

        {/* 수업 탭 */}
        {tab === "enrollments" && (
          <StudentEnrollmentsPanel
            examNumber={params.examNumber}
            enrollments={studentEnrollments ?? []}
          />
        )}

        {/* 성적 차트 탭 */}
        {tab === "score-chart" && (
          <StudentScoreChart scores={scoreChartPoints ?? []} />
        )}

        {/* 수납 탭 */}
        {tab === "payments" && (
          <StudentPaymentHistory
            examNumber={params.examNumber}
            payments={studentPayments ?? []}
          />
        )}

        {/* 포인트 탭 */}
        {tab === "points" && (
          <StudentPointHistory points={studentPoints ?? []} />
        )}

        {/* 출결 이력 탭 */}
        {tab === "attendance" && (
          <AttendanceHistorySection logs={attendanceLogs} />
        )}

        {/* 오답노트 탭 */}
        {tab === "wrong-notes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate">요약 보기입니다. 상세 페이지에서 필터·정렬을 사용할 수 있습니다.</p>
              <Link
                href={`/admin/students/${params.examNumber}/wrong-notes`}
                className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
              >
                전체 오답노트 →
              </Link>
            </div>
            <WrongNotesAdminView examNumber={params.examNumber} wrongNotes={wrongNotesData} />
          </div>
        )}

        {/* 메모 탭 */}
        {tab === "memos" && (
          <StudentAdminMemos
            examNumber={params.examNumber}
            initialMemos={studentMemos ?? []}
            currentAdminId={context.adminUser.id}
            currentAdminName={context.adminUser.name}
          />
        )}
      </div>
    </div>
  );
}

