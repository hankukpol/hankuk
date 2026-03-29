import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const val = searchParams?.[key];
  return Array.isArray(val) ? val[0] : val;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// Warning level categories — ordered from most to least severe
type RiskLevel = "DANGER" | "WARNING" | "DROPOUT_IMMINENT" | "LOW_ATTENDANCE";

type RiskStudent = {
  examNumber: string;
  name: string;
  mobile: string | null;
  cohortId: string | null;
  cohortName: string | null;
  consecutiveAbsences: number;
  totalAbsenceCount: number;
  lastAbsenceDate: string | null;
  avgScore: number | null;
  riskLevel: RiskLevel;
  counselingCount: number;
  attendanceRate: number | null; // percentage 0-100, null if no sessions yet
  absencesToDropout: number | null; // 8 - totalAbsenceCount, null if not near threshold
};

const RISK_CONFIG: Record<
  RiskLevel,
  {
    label: string;
    labelDetail: string;
    badge: string;
    dot: string;
    kpiBorder: string;
    kpiBg: string;
    kpiText: string;
    kpiSubText: string;
  }
> = {
  DANGER: {
    label: "위험 (1경고)",
    labelDetail: "4회+ 연속 결석",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
    kpiBorder: "border-red-200",
    kpiBg: "bg-red-50",
    kpiText: "text-red-700",
    kpiSubText: "즉시 면담 권장",
  },
  WARNING: {
    label: "경고 (2경고)",
    labelDetail: "2~3회 연속 결석",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    kpiBorder: "border-amber-200",
    kpiBg: "bg-amber-50",
    kpiText: "text-amber-700",
    kpiSubText: "모니터링 필요",
  },
  DROPOUT_IMMINENT: {
    label: "탈락 임박",
    labelDetail: "이달 결석 5회+ (8회 탈락 기준 3회 이내)",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
    kpiBorder: "border-purple-200",
    kpiBg: "bg-purple-50",
    kpiText: "text-purple-700",
    kpiSubText: "8회 탈락 기준 임박",
  },
  LOW_ATTENDANCE: {
    label: "저출석률",
    labelDetail: "이달 출석률 70% 미만",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    kpiBorder: "border-sky-200",
    kpiBg: "bg-sky-50",
    kpiText: "text-sky-700",
    kpiSubText: "출석률 70% 미만",
  },
};

/**
 * Compute consecutive absences from the most recent sessions backward.
 */
function computeConsecutiveAbsences(
  sessionDates: Date[],
  absentDates: Set<string>,
): number {
  const sorted = [...sessionDates].sort((a, b) => b.getTime() - a.getTime());
  let count = 0;
  for (const d of sorted) {
    const key = d.toISOString().slice(0, 10);
    if (absentDates.has(key)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Valid warning level filter values
const VALID_LEVEL_FILTERS = ["ALL", "DANGER", "WARNING", "DROPOUT_IMMINENT", "LOW_ATTENDANCE"] as const;
type LevelFilter = (typeof VALID_LEVEL_FILTERS)[number];

export default async function AttendanceRiskPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const selectedCohortId = readParam(searchParams, "cohortId");
  const rawLevelFilter = readParam(searchParams, "level") ?? "ALL";
  const selectedLevel: LevelFilter = (VALID_LEVEL_FILTERS as readonly string[]).includes(rawLevelFilter)
    ? (rawLevelFilter as LevelFilter)
    : "ALL";

  const prisma = getPrisma();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const currentMonthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // 활성 기수 목록 (필터 드롭다운용)
  const activeCohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    select: { id: true, name: true, examCategory: true },
    orderBy: { startDate: "desc" },
  });

  // 활성 수강 등록 조회
  const activeEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: "ACTIVE",
      courseType: "COMPREHENSIVE",
      ...(selectedCohortId ? { cohortId: selectedCohortId } : {}),
    },
    select: {
      id: true,
      examNumber: true,
      cohortId: true,
      cohort: { select: { id: true, name: true } },
      student: { select: { examNumber: true, name: true, phone: true } },
    },
  });

  const totalActive = activeEnrollments.length;

  // 학생별 첫 번째 등록으로 중복 제거 (enrollmentId도 보존)
  const enrollmentByExamNumber = new Map<
    string,
    typeof activeEnrollments[0]
  >();
  for (const e of activeEnrollments) {
    if (!enrollmentByExamNumber.has(e.examNumber)) {
      enrollmentByExamNumber.set(e.examNumber, e);
    }
  }
  const uniqueExamNumbers = [...enrollmentByExamNumber.keys()];

  if (uniqueExamNumbers.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "알림", href: "/admin" },
            { label: "출결 위험 알림" },
          ]}
        />
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">활성 수강생 없음</p>
          <p className="mt-1 text-xs text-slate">현재 활성 종합반 수강생이 없습니다.</p>
        </div>
      </div>
    );
  }

  // 이번 달 Score.attendType=ABSENT 기록 (결석 일자, 학번)
  const absentScores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: "ABSENT",
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: {
      examNumber: true,
      session: { select: { examDate: true } },
    },
  });

  // 이번 달 전체 Score 기록 (출석률 계산용 — 출석/결석 모두)
  const allMonthlyScores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
        isCancelled: false,
      },
    },
    select: {
      examNumber: true,
      attendType: true,
    },
  });

  // 학생별 이번달 총 시험 수 / 결석 수 (출석률 계산)
  const monthlySessionCount = new Map<string, { total: number; absent: number }>();
  for (const s of allMonthlyScores) {
    const prev = monthlySessionCount.get(s.examNumber) ?? { total: 0, absent: 0 };
    prev.total += 1;
    if (s.attendType === "ABSENT") prev.absent += 1;
    monthlySessionCount.set(s.examNumber, prev);
  }

  // 모든 이번달 시험 세션 목록 (student별 consecutive 계산용)
  const allSessionsThisMonth = await prisma.examSession.findMany({
    where: {
      examDate: { gte: monthStart, lte: monthEnd },
      isCancelled: false,
    },
    select: { examDate: true },
  });
  const allSessionDates = allSessionsThisMonth.map((s) => s.examDate);
  const totalSessionsThisMonth = allSessionsThisMonth.length;

  // 오늘 결석 학생 수
  const todayAbsentScores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: "ABSENT",
      session: {
        examDate: { gte: todayStart, lte: todayEnd },
      },
    },
    select: { examNumber: true },
  });
  const todayAbsentCount = new Set(todayAbsentScores.map((s) => s.examNumber)).size;

  // 학생별 결석 집계 (날짜 집합 + 마지막 결석일)
  const absenceMap = new Map<string, { dates: Set<string>; lastDate: Date | null }>();
  for (const score of absentScores) {
    const prev = absenceMap.get(score.examNumber) ?? {
      dates: new Set<string>(),
      lastDate: null,
    };
    const d = score.session.examDate;
    const dateKey = d.toISOString().slice(0, 10);
    prev.dates.add(dateKey);
    if (prev.lastDate === null || d > prev.lastDate) {
      prev.lastDate = d;
    }
    absenceMap.set(score.examNumber, prev);
  }

  // 이번 달 평균 점수
  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: uniqueExamNumbers },
      attendType: { not: "ABSENT" },
      finalScore: { not: null },
      session: {
        examDate: { gte: monthStart, lte: monthEnd },
      },
    },
    select: { examNumber: true, finalScore: true },
  });

  const scoreMap = new Map<string, { sum: number; count: number }>();
  for (const s of scores) {
    const prev = scoreMap.get(s.examNumber) ?? { sum: 0, count: 0 };
    scoreMap.set(s.examNumber, {
      sum: prev.sum + (s.finalScore ?? 0),
      count: prev.count + 1,
    });
  }

  // 학생별 면담 횟수 (전체 누적)
  const counselingCounts = await prisma.counselingRecord.groupBy({
    by: ["examNumber"],
    where: { examNumber: { in: uniqueExamNumbers } },
    _count: { id: true },
  });
  const counselingMap = new Map(
    counselingCounts.map((c) => [c.examNumber, c._count.id]),
  );

  // ── 위험도 분류 ────────────────────────────────────────────────────────────────
  // 1. DANGER: 4회+ 연속 결석 (1경고 수준)
  // 2. WARNING: 2~3회 연속 결석 (2경고 수준)
  // 3. DROPOUT_IMMINENT: 이달 결석 5~7회 (8회 탈락 기준 3회 이내), 연속결석 미해당자
  // 4. LOW_ATTENDANCE: 이달 출석률 < 70%, 위 세 그룹 미해당자

  const danger: RiskStudent[] = [];
  const warningGroup: RiskStudent[] = [];
  const dropoutImminent: RiskStudent[] = [];
  const lowAttendance: RiskStudent[] = [];

  // Dropout threshold: 8 absences this month = dropout
  const DROPOUT_THRESHOLD = 8;
  const NEAR_DROPOUT_THRESHOLD = DROPOUT_THRESHOLD - 3; // 5+

  for (const [examNumber, enrollment] of enrollmentByExamNumber) {
    const absenceInfo = absenceMap.get(examNumber);
    const totalAbsenceCount = absenceInfo?.dates.size ?? 0;
    const consecutiveAbsences = absenceInfo
      ? computeConsecutiveAbsences(allSessionDates, absenceInfo.dates)
      : 0;

    const scoreInfo = scoreMap.get(examNumber);
    const avgScore =
      scoreInfo && scoreInfo.count > 0
        ? Math.round((scoreInfo.sum / scoreInfo.count) * 10) / 10
        : null;

    const sessionInfo = monthlySessionCount.get(examNumber);
    const attendanceRate =
      sessionInfo && sessionInfo.total > 0
        ? Math.round(((sessionInfo.total - sessionInfo.absent) / sessionInfo.total) * 1000) / 10
        : totalSessionsThisMonth > 0
          ? null // hasn't participated yet
          : null;

    const absencesToDropout =
      totalAbsenceCount >= NEAR_DROPOUT_THRESHOLD
        ? DROPOUT_THRESHOLD - totalAbsenceCount
        : null;

    const baseItem = {
      examNumber,
      name: enrollment.student.name,
      mobile: enrollment.student.phone ?? null,
      cohortId: enrollment.cohortId ?? null,
      cohortName: enrollment.cohort?.name ?? null,
      consecutiveAbsences,
      totalAbsenceCount,
      lastAbsenceDate: absenceInfo?.lastDate
        ? absenceInfo.lastDate.toISOString()
        : null,
      avgScore,
      counselingCount: counselingMap.get(examNumber) ?? 0,
      attendanceRate,
      absencesToDropout,
    };

    if (consecutiveAbsences >= 4) {
      danger.push({ ...baseItem, riskLevel: "DANGER" });
    } else if (consecutiveAbsences >= 2) {
      warningGroup.push({ ...baseItem, riskLevel: "WARNING" });
    } else if (totalAbsenceCount >= NEAR_DROPOUT_THRESHOLD) {
      // Near-dropout but not in consecutive-absence groups
      dropoutImminent.push({ ...baseItem, riskLevel: "DROPOUT_IMMINENT" });
    } else if (attendanceRate !== null && attendanceRate < 70) {
      lowAttendance.push({ ...baseItem, riskLevel: "LOW_ATTENDANCE" });
    }
  }

  danger.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
  warningGroup.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);
  dropoutImminent.sort((a, b) => b.totalAbsenceCount - a.totalAbsenceCount);
  lowAttendance.sort((a, b) => (a.attendanceRate ?? 100) - (b.attendanceRate ?? 100));

  const lowAttendanceCount = uniqueExamNumbers.filter((en) => {
    const si = monthlySessionCount.get(en);
    if (!si || si.total === 0) return false;
    const rate = ((si.total - si.absent) / si.total) * 100;
    return rate < 70;
  }).length;

  // Apply level filter to sections
  const allSections: Array<{ level: RiskLevel; students: RiskStudent[] }> = [
    { level: "DANGER" as const, students: danger },
    { level: "WARNING" as const, students: warningGroup },
    { level: "DROPOUT_IMMINENT" as const, students: dropoutImminent },
    { level: "LOW_ATTENDANCE" as const, students: lowAttendance },
  ];
  const visibleSections = allSections.filter(({ level, students }) => {
    if (selectedLevel !== "ALL" && level !== selectedLevel) return false;
    return students.length > 0;
  });

  const totalRiskCount =
    danger.length + warningGroup.length + dropoutImminent.length + lowAttendance.length;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "알림", href: "/admin" },
          { label: "출결 위험 알림" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">출결 위험 알림</h1>
          <p className="mt-1 text-sm text-slate">
            {currentMonthLabel} 기준 · 활성 종합반 수강생 {totalActive}명 대상 ·
            연속 결석 · 출석률 · 탈락 임박 기준 위험도 분류
          </p>
        </div>

        {/* 필터 폼 */}
        <form method="GET" className="flex flex-wrap items-center gap-2">
          {/* 위험도 필터 */}
          <select
            name="level"
            defaultValue={selectedLevel}
            className="rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
          >
            <option value="ALL">전체 위험도</option>
            <option value="DANGER">위험 (1경고)</option>
            <option value="WARNING">경고 (2경고)</option>
            <option value="DROPOUT_IMMINENT">탈락 임박</option>
            <option value="LOW_ATTENDANCE">저출석률</option>
          </select>

          {/* 기수 필터 */}
          <select
            id="cohortId"
            name="cohortId"
            defaultValue={selectedCohortId ?? ""}
            className="rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
          >
            <option value="">전체 기수</option>
            {activeCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
          >
            적용
          </button>
          {(selectedCohortId || selectedLevel !== "ALL") && (
            <Link
              href="/admin/alerts/attendance-risk"
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
            >
              초기화
            </Link>
          )}
        </form>
      </div>

      {/* 5개 KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-medium text-red-600">위험 · 1경고</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{danger.length}명</p>
          <p className="mt-1 text-[10px] text-slate">4회+ 연속 결석</p>
        </div>
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-medium text-amber-600">경고 · 2경고</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{warningGroup.length}명</p>
          <p className="mt-1 text-[10px] text-slate">2~3회 연속 결석</p>
        </div>
        <div className="rounded-[24px] border border-purple-200 bg-purple-50 p-5">
          <p className="text-xs font-medium text-purple-600">탈락 임박</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">{dropoutImminent.length}명</p>
          <p className="mt-1 text-[10px] text-slate">이달 결석 5회+</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-medium text-sky-600">저출석률</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">{lowAttendanceCount}명</p>
          <p className="mt-1 text-[10px] text-slate">이달 출석률 70% 미만</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-mist p-5">
          <p className="text-xs font-medium text-slate">오늘 결석</p>
          <p className="mt-1 text-2xl font-bold text-ink">{todayAbsentCount}명</p>
          <p className="mt-1 text-[10px] text-slate">오늘 기준</p>
        </div>
      </div>

      {/* 위험도 기준 안내 */}
      <div className="mt-5 rounded-[20px] border border-ink/8 bg-mist/60 px-5 py-4">
        <p className="text-xs font-semibold text-slate uppercase tracking-wider">위험도 기준</p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <strong className="text-red-700">위험·1경고</strong>: 최근 연속 결석 4회 이상
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <strong className="text-amber-700">경고·2경고</strong>: 최근 연속 결석 2~3회
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500" />
            <strong className="text-purple-700">탈락 임박</strong>: 이달 결석 5회 이상 (8회 탈락 기준 3회 이내)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
            <strong className="text-sky-700">저출석률</strong>: 이달 출석률 70% 미만
          </span>
        </div>
      </div>

      {totalRiskCount === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">위험 학생 없음</p>
          <p className="mt-1 text-xs text-slate">
            {currentMonthLabel} 기준 출결 위험 수강생이 없습니다.
          </p>
        </div>
      ) : visibleSections.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm font-medium text-ink">선택한 위험도에 해당하는 학생 없음</p>
          <p className="mt-1 text-xs text-slate">다른 위험도 필터를 선택하세요.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {visibleSections.map(({ level, students }) => {
            const cfg = RISK_CONFIG[level];
            return (
              <section key={level}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                  <h2 className="text-base font-semibold text-ink">
                    {cfg.label}
                    <span className="ml-1.5 text-xs font-normal text-slate">
                      — {cfg.labelDetail}
                    </span>
                    <span className="ml-2 text-sm font-normal text-slate">
                      {students.length}명
                    </span>
                  </h2>
                </div>

                <div className="overflow-x-auto overflow-hidden rounded-[24px] border border-ink/10 bg-white">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-mist/60 text-left">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          이름 / 학번
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          기수
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          연속 결석
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          이달 결석
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          출석률
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          탈락까지
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          마지막 결석
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          이달 평균
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          면담
                        </th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wider text-slate">
                          조치
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {students.map((s) => {
                        const enrollId = enrollmentByExamNumber.get(s.examNumber)?.id;
                        return (
                          <tr
                            key={s.examNumber}
                            className="transition hover:bg-mist/40"
                          >
                            {/* 이름 / 학번 */}
                            <td className="px-5 py-4">
                              <Link
                                href={`/admin/students/${s.examNumber}`}
                                className="font-semibold text-ink transition hover:text-ember"
                              >
                                {s.name}
                              </Link>
                              <p className="text-xs text-slate">{s.examNumber}</p>
                              {s.mobile && (
                                <p className="text-xs text-slate">{s.mobile}</p>
                              )}
                            </td>
                            {/* 기수 */}
                            <td className="px-5 py-4">
                              {s.cohortName ? (
                                <span className="text-sm text-ink">{s.cohortName}</span>
                              ) : (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            {/* 연속 결석 */}
                            <td className="px-5 py-4">
                              {s.consecutiveAbsences >= 2 ? (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}
                                >
                                  {s.consecutiveAbsences}회 연속
                                </span>
                              ) : (
                                <span className="text-xs text-slate">-</span>
                              )}
                            </td>
                            {/* 이달 결석 */}
                            <td className="px-5 py-4 text-sm">
                              <span
                                className={
                                  s.totalAbsenceCount >= 6
                                    ? "font-semibold text-red-600"
                                    : s.totalAbsenceCount >= 4
                                      ? "font-semibold text-amber-600"
                                      : "text-slate"
                                }
                              >
                                {s.totalAbsenceCount}회
                              </span>
                            </td>
                            {/* 출석률 */}
                            <td className="px-5 py-4">
                              {s.attendanceRate !== null ? (
                                <span
                                  className={
                                    s.attendanceRate < 60
                                      ? "font-semibold text-red-600"
                                      : s.attendanceRate < 70
                                        ? "font-semibold text-amber-600"
                                        : "text-ink"
                                  }
                                >
                                  {s.attendanceRate.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-xs text-slate">-</span>
                              )}
                            </td>
                            {/* 탈락까지 */}
                            <td className="px-5 py-4">
                              {s.absencesToDropout !== null ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    s.absencesToDropout <= 1
                                      ? "bg-red-100 text-red-700"
                                      : s.absencesToDropout <= 2
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-purple-100 text-purple-700"
                                  }`}
                                >
                                  {s.absencesToDropout <= 0
                                    ? "탈락"
                                    : `${s.absencesToDropout}회 남음`}
                                </span>
                              ) : (
                                <span className="text-xs text-slate">-</span>
                              )}
                            </td>
                            {/* 마지막 결석 */}
                            <td className="px-5 py-4 text-slate text-xs">
                              {fmtDate(s.lastAbsenceDate)}
                            </td>
                            {/* 이달 평균 점수 */}
                            <td className="px-5 py-4">
                              {s.avgScore !== null ? (
                                <span
                                  className={
                                    s.avgScore < 60
                                      ? "font-semibold text-red-600"
                                      : s.avgScore < 70
                                        ? "font-semibold text-amber-600"
                                        : "text-ink"
                                  }
                                >
                                  {s.avgScore.toFixed(1)}점
                                </span>
                              ) : (
                                <span className="text-slate">-</span>
                              )}
                            </td>
                            {/* 면담 횟수 */}
                            <td className="px-5 py-4">
                              <span
                                className={`text-sm font-semibold ${
                                  s.counselingCount > 0 ? "text-forest" : "text-slate"
                                }`}
                              >
                                {s.counselingCount}회
                              </span>
                            </td>
                            {/* 조치 */}
                            <td className="px-5 py-4">
                              <div className="flex flex-col items-start gap-1.5">
                                <Link
                                  href={`/admin/counseling/new?examNumber=${s.examNumber}`}
                                  className="inline-flex items-center rounded-full bg-forest/10 px-3 py-1 text-xs font-medium text-forest transition hover:bg-forest/20"
                                >
                                  면담 신청
                                </Link>
                                <Link
                                  href={`/admin/notifications/send?examNumber=${s.examNumber}`}
                                  className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-medium text-ember transition hover:bg-ember/10"
                                >
                                  경고 발송
                                </Link>
                                {enrollId && (
                                  <Link
                                    href={`/admin/enrollments/${enrollId}`}
                                    className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-medium text-slate transition hover:border-purple-300 hover:text-purple-700"
                                  >
                                    수강 일시정지
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
