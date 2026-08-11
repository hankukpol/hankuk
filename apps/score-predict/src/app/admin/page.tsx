import Link from "next/link";
import { ExamType, Prisma } from "@prisma/client";
import DashboardSetupChecklist from "@/components/admin/DashboardSetupChecklist";
import DashboardSubmissionTrendChart from "@/components/admin/DashboardSubmissionTrendChart";
import {
  resolveAdminSiteFeatureState,
  type AdminSiteFeatureKey,
} from "@/lib/admin-site-features.shared";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { getExamOperationWarnings, resolveExamOperationStage } from "@/lib/exam-operation-stage";
import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

type DashboardQuickAction = {
  href: string;
  num: string;
  title: string;
  desc: string;
  color: string;
  hoverBg: string;
  feature?: AdminSiteFeatureKey;
};

type DashboardChecklistItem = {
  label: string;
  completed: boolean;
  href: string;
  feature?: AdminSiteFeatureKey;
};

type DashboardSystemStatusItem = {
  label: string;
  ok: boolean;
  value: string;
  feature?: AdminSiteFeatureKey;
};

type ActiveExamSummary = {
  id: number;
  year: number;
  round: number;
  name: string;
  examDate: Date;
};

type RegionBreakdownItem = {
  name: string;
  publicCount: number;
  careerCount: number;
  careerRescueCount: number;
  careerAcademicCount: number;
  careerEmtCount: number;
  total: number;
};

const statCardStyles = [
  { label: "text-service-600" },
  { label: "text-rose-600" },
  { label: "text-amber-600" },
  { label: "text-cyan-600" },
  { label: "text-emerald-600" },
  { label: "text-violet-600" },
];

const quickActions: DashboardQuickAction[] = [
  {
    href: "/admin/exams",
    num: "1",
    title: "시험 생성/활성화",
    desc: "새 시험을 만들고 현재 운영 시험을 전환합니다.",
    color: "text-service-600",
    hoverBg: "hover:border-service-300",
    feature: "exams",
  },
  {
    href: "/admin/answers",
    num: "2",
    title: "정답 입력/검수",
    desc: "OMR 정답 또는 CSV 업로드로 정답표를 반영합니다.",
    color: "text-cyan-600",
    hoverBg: "hover:border-cyan-300",
    feature: "answers",
  },
  {
    href: "/admin/regions",
    num: "3",
    title: "모집인원 관리",
    desc: "지역별 공개/경력 모집인원과 수험번호 범위를 설정합니다.",
    color: "text-emerald-600",
    hoverBg: "hover:border-emerald-300",
    feature: "regions",
  },
  {
    href: "/admin/pre-registrations",
    num: "4",
    title: "사전등록 관리",
    desc: "사전등록 목록과 추첨, CSV 내보내기 작업을 처리합니다.",
    color: "text-sky-600",
    hoverBg: "hover:border-sky-300",
    feature: "preRegistrations",
  },
  {
    href: "/admin/stats",
    num: "5",
    title: "참여 통계",
    desc: "유형, 직렬, 지역별 참여 현황을 확인합니다.",
    color: "text-amber-600",
    hoverBg: "hover:border-amber-300",
    feature: "stats",
  },
  {
    href: "/admin/site",
    num: "6",
    title: "사이트 설정",
    desc: "메인 문구와 운영 모드를 관리자 화면에서 조정합니다.",
    color: "text-violet-600",
    hoverBg: "hover:border-violet-300",
  },
  {
    href: "/admin/users",
    num: "7",
    title: "사용자 관리",
    desc: "권한 조정과 비밀번호 초기화를 처리합니다.",
    color: "text-indigo-600",
    hoverBg: "hover:border-indigo-300",
    feature: "users",
  },
];

function formatRelativeTime(date: Date | null): string {
  if (!date) return "-";

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default async function AdminDashboardPage() {
  const tenantType = await getServerTenantType();
  const siteSettings = await getSiteSettingsUncached();
  const featureState = resolveAdminSiteFeatureState(siteSettings);

  let activeExam: ActiveExamSummary | null = null;
  let totalExams = 0;
  let activeExamCount = 0;
  let latestReleaseNumber: number | null = null;
  let totalSubmissions = 0;
  let totalUsers = 0;
  let todaySubmissions = 0;
  let publicCount = 0;
  let careerCount = 0;
  let careerRescueCount = 0;
  let careerAcademicCount = 0;
  let careerEmtCount = 0;
  let publicAnswerKeyCount = 0;
  let careerAnswerKeyCount = 0;
  let careerRescueAnswerKeyCount = 0;
  let careerAcademicAnswerKeyCount = 0;
  let careerEmtAnswerKeyCount = 0;
  let regionsConfigured = 0;
  let regionsTotal = 0;
  let isMaintenanceMode = false;
  let lastSubmissionAt: Date | null = null;
  let submissionTrend: Array<{ date: string; count: number }> = [];
  let regionBreakdown: RegionBreakdownItem[] = [];
  let hasStatsError = false;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tenantExamTypes: ExamType[] =
      tenantType === "police"
        ? [ExamType.PUBLIC, ExamType.CAREER]
        : [ExamType.PUBLIC, ExamType.CAREER_RESCUE, ExamType.CAREER_ACADEMIC, ExamType.CAREER_EMT];

    const [dbActiveExam, dbActiveExamCount, dbTotalExams, dbTotalUsers] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.exam.findFirst({
          where: { isActive: true },
          orderBy: [{ examDate: "desc" }, { id: "desc" }],
          select: { id: true, year: true, round: true, name: true, examDate: true },
        }),
        tx.exam.count({ where: { isActive: true } }),
        tx.exam.count(),
        tx.user.count(),
      ])
    );

    activeExam = dbActiveExam;
    activeExamCount = dbActiveExamCount;
    totalExams = dbTotalExams;
    totalUsers = dbTotalUsers;

    if (dbActiveExam) {
      const [
        dbTotalSubmissions,
        dbTodaySubmissions,
        dbExamTypeCounts,
        dbPublicAnswerKeys,
        dbCareerAnswerKeys,
        dbCareerRescueAnswerKeys,
        dbCareerAcademicAnswerKeys,
        dbCareerEmtAnswerKeys,
        dbRegionsConfigured,
        dbRegionsTotal,
        dbLastSubmission,
        dbLatestRelease,
      ] = await Promise.all([
        prisma.submission.count({
          where: { examId: dbActiveExam.id, examType: { in: tenantExamTypes } },
        }),
        prisma.submission.count({
          where: {
            examId: dbActiveExam.id,
            examType: { in: tenantExamTypes },
            createdAt: { gte: todayStart },
          },
        }),
        prisma.submission.groupBy({
          by: ["examType"],
          where: { examId: dbActiveExam.id, examType: { in: tenantExamTypes } },
          _count: true,
        }),
        prisma.answerKey.count({
          where: { examId: dbActiveExam.id, subject: { examType: "PUBLIC" } },
        }),
        prisma.answerKey.count({
          where: { examId: dbActiveExam.id, subject: { examType: "CAREER" } },
        }),
        prisma.answerKey.count({
          where: { examId: dbActiveExam.id, subject: { examType: "CAREER_RESCUE" } },
        }),
        prisma.answerKey.count({
          where: { examId: dbActiveExam.id, subject: { examType: "CAREER_ACADEMIC" } },
        }),
        prisma.answerKey.count({
          where: { examId: dbActiveExam.id, subject: { examType: "CAREER_EMT" } },
        }),
        prisma.examRegionQuota.count({
          where:
            tenantType === "police"
              ? { examId: dbActiveExam.id, recruitCount: { gt: 0 } }
              : { examId: dbActiveExam.id, recruitPublicMale: { gt: 0 } },
        }),
        prisma.examRegionQuota.count({ where: { examId: dbActiveExam.id } }),
        prisma.submission.findFirst({
          where: { examId: dbActiveExam.id, examType: { in: tenantExamTypes } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.passCutRelease.findFirst({
          where: { examId: dbActiveExam.id },
          orderBy: [{ releaseNumber: "desc" }, { releasedAt: "desc" }],
          select: { releaseNumber: true },
        }),
      ]);

      totalSubmissions = dbTotalSubmissions;
      todaySubmissions = dbTodaySubmissions;
      for (const row of dbExamTypeCounts) {
        if (row.examType === "PUBLIC") publicCount = row._count;
        if (row.examType === "CAREER") careerCount = row._count;
        if (row.examType === "CAREER_RESCUE") careerRescueCount = row._count;
        if (row.examType === "CAREER_ACADEMIC") careerAcademicCount = row._count;
        if (row.examType === "CAREER_EMT") careerEmtCount = row._count;
      }

      publicAnswerKeyCount = dbPublicAnswerKeys;
      careerAnswerKeyCount = dbCareerAnswerKeys;
      careerRescueAnswerKeyCount = dbCareerRescueAnswerKeys;
      careerAcademicAnswerKeyCount = dbCareerAcademicAnswerKeys;
      careerEmtAnswerKeyCount = dbCareerEmtAnswerKeys;
      regionsConfigured = dbRegionsConfigured;
      regionsTotal = dbRegionsTotal;
      lastSubmissionAt = dbLastSubmission?.createdAt ?? null;
      latestReleaseNumber = dbLatestRelease?.releaseNumber ?? null;

      const trendRaw = await prisma.$queryRaw<
        Array<{ date: string; count: bigint | number }>
      >`
        SELECT
          TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Submission"
        WHERE "examId" = ${dbActiveExam.id}
          AND "examType"::text IN (${Prisma.join(tenantExamTypes)})
        GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ORDER BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      `;

      submissionTrend = trendRaw
        .map((item) => ({ date: item.date, count: Number(item.count) }))
        .filter((item) => Number.isFinite(item.count))
        .slice(-10);

      const regionRaw = await prisma.$queryRaw<
        Array<{
          name: string;
          publicCount: bigint | number;
          careerCount: bigint | number;
          careerRescueCount: bigint | number;
          careerAcademicCount: bigint | number;
          careerEmtCount: bigint | number;
          total: bigint | number;
        }>
      >`
        SELECT
          r."name",
          SUM(CASE WHEN s."examType" = 'PUBLIC' THEN 1 ELSE 0 END)::bigint AS "publicCount",
          SUM(CASE WHEN s."examType" = 'CAREER' THEN 1 ELSE 0 END)::bigint AS "careerCount",
          SUM(CASE WHEN s."examType" = 'CAREER_RESCUE' THEN 1 ELSE 0 END)::bigint AS "careerRescueCount",
          SUM(CASE WHEN s."examType" = 'CAREER_ACADEMIC' THEN 1 ELSE 0 END)::bigint AS "careerAcademicCount",
          SUM(CASE WHEN s."examType" = 'CAREER_EMT' THEN 1 ELSE 0 END)::bigint AS "careerEmtCount",
          COUNT(*)::bigint AS "total"
        FROM "Submission" s
        JOIN "Region" r ON s."regionId" = r."id"
        WHERE s."examId" = ${dbActiveExam.id}
          AND s."examType"::text IN (${Prisma.join(tenantExamTypes)})
        GROUP BY r."id", r."name"
        ORDER BY "total" DESC
        LIMIT 5
      `;

      regionBreakdown = regionRaw.map((row) => ({
        name: row.name,
        publicCount: Number(row.publicCount),
        careerCount: Number(row.careerCount),
        careerRescueCount: Number(row.careerRescueCount),
        careerAcademicCount: Number(row.careerAcademicCount),
        careerEmtCount: Number(row.careerEmtCount),
        total: Number(row.total),
      }));
    }

    const maintenanceSetting = await prisma.siteSetting.findUnique({
      where: { key: "maintenanceMode" },
    });
    isMaintenanceMode = maintenanceSetting?.value === "true";
  } catch (error) {
    console.error("관리자 대시보드 통계 조회 중 오류:", error);
    hasStatsError = true;
  }

  const preRegistrationEnabled =
    tenantType === "police" && Boolean(siteSettings["site.preRegistrationEnabled"] ?? true);
  const answerInputEnabled = Boolean(siteSettings["site.answerInputEnabled"] ?? false);
  const resultEnabled = Boolean(siteSettings["site.tabResultEnabled"] ?? true);
  const operationStage = resolveExamOperationStage({
    preRegistrationEnabled,
    answerInputEnabled,
    latestReleaseNumber,
  });
  const operationWarnings = getExamOperationWarnings({
    examDate: activeExam?.examDate ?? null,
    preRegistrationEnabled,
    answerInputEnabled,
    resultEnabled,
    latestReleaseNumber,
  });
  if (activeExamCount !== 1) {
    operationWarnings.unshift(`활성 시험이 ${activeExamCount}개입니다. 정확히 1개여야 합니다.`);
  }

  const careerAnswerChecklistItems: DashboardChecklistItem[] =
    tenantType === "police"
      ? [
          {
            label: "정답 입력 (경행경채)",
            completed: careerAnswerKeyCount >= 100,
            href: "/admin/answers",
            feature: "answers",
          },
        ]
      : [
          {
            label: "정답 입력 (구조 경채)",
            completed: careerRescueAnswerKeyCount >= 65,
            href: "/admin/answers",
            feature: "answers",
          },
          {
            label: "정답 입력 (학과 경채)",
            completed: careerAcademicAnswerKeyCount >= 65,
            href: "/admin/answers",
            feature: "answers",
          },
          {
            label: "정답 입력 (구급 경채)",
            completed: careerEmtAnswerKeyCount >= 65,
            href: "/admin/answers",
            feature: "answers",
          },
        ];

  const baseChecklistItems: DashboardChecklistItem[] = activeExam
    ? [
          {
            label: "시험 생성 완료",
            completed: true,
            href: "/admin/exams",
            feature: "exams",
          },
          {
            label: "정답 입력 (공채)",
            completed: publicAnswerKeyCount >= (tenantType === "police" ? 100 : 75),
            href: "/admin/answers",
            feature: "answers",
          },
          ...careerAnswerChecklistItems,
          {
            label: "모집인원 설정",
            completed: regionsConfigured > 0 && regionsConfigured === regionsTotal,
            href: "/admin/regions",
            feature: "regions",
          },
          {
            label: "운영 시작 (점검 모드 해제)",
            completed: !isMaintenanceMode,
            href: "/admin/site",
          },
        ]
    : [
          {
            label: "시험 생성",
            completed: false,
            href: "/admin/exams",
            feature: "exams",
          },
        ];

  const checklistItems = baseChecklistItems.filter(
    (item) => !item.feature || featureState[item.feature]
  );
  const tenantChecklistItems = checklistItems.map((item) => ({
    ...item,
    href: withTenantPrefix(item.href, tenantType),
  }));

  const totalPercent =
    totalSubmissions > 0 ? Math.round((publicCount / totalSubmissions) * 100) : 0;
  const careerTotal =
    tenantType === "police"
      ? careerCount
      : careerRescueCount + careerAcademicCount + careerEmtCount;
  const publicAnswerKeyRequired = tenantType === "police" ? 100 : 75;
  const answerKeyStatus =
    publicAnswerKeyCount >= publicAnswerKeyRequired &&
    (tenantType === "police"
      ? careerAnswerKeyCount >= 100
      : careerRescueAnswerKeyCount >= 65 &&
        careerAcademicAnswerKeyCount >= 65 &&
        careerEmtAnswerKeyCount >= 65)
      ? "등록 완료"
      : publicAnswerKeyCount +
            (tenantType === "police"
              ? careerAnswerKeyCount
              : careerRescueAnswerKeyCount + careerAcademicAnswerKeyCount + careerEmtAnswerKeyCount) >
          0
        ? "일부 등록"
        : "미등록";

  const stats = [
    {
      label: "활성 시험",
      value: activeExam ? `${activeExam.year}년 ${activeExam.round}차` : "없음",
      sub: activeExam?.name ?? "활성화된 시험이 없습니다.",
    },
    {
      label: "총 제출 수",
      value: totalSubmissions.toLocaleString(),
      sub: `회원 수 ${totalUsers.toLocaleString()}`,
    },
    {
      label: "오늘 제출",
      value: todaySubmissions.toLocaleString(),
      sub: new Date().toLocaleDateString("ko-KR"),
    },
    {
      label: "공채 / 경채",
      value: totalSubmissions > 0 ? `${totalPercent}% / ${100 - totalPercent}%` : "-",
      sub:
        tenantType === "police"
          ? `공채 ${publicCount}명 / 경행경채 ${careerCount}명`
          : `공채 ${publicCount}명 / 경채 ${careerTotal}명 (구조 ${careerRescueCount} / 학과 ${careerAcademicCount} / 구급 ${careerEmtCount})`,
    },
    {
      label: "정답표 상태",
      value: answerKeyStatus,
      sub:
        tenantType === "police"
          ? `공채 ${publicAnswerKeyCount} / 경행경채 ${careerAnswerKeyCount} 문항`
          : `공채 ${publicAnswerKeyCount} / 구조 ${careerRescueAnswerKeyCount} / 학과 ${careerAcademicAnswerKeyCount} / 구급 ${careerEmtAnswerKeyCount} 문항`,
    },
    {
      label: "등록 시험 수",
      value: String(totalExams),
      sub: "전체 시험",
    },
  ];

  const baseSystemStatus: DashboardSystemStatusItem[] = [
    {
      label: "정답표 (공채)",
      ok: publicAnswerKeyCount >= publicAnswerKeyRequired,
      value:
        publicAnswerKeyCount >= publicAnswerKeyRequired
          ? `${publicAnswerKeyCount}문항 등록`
          : `${publicAnswerKeyCount}문항 (미완료)`,
      feature: "answers",
    },
    ...(tenantType === "police"
      ? [
          {
            label: "정답표 (경행경채)",
            ok: careerAnswerKeyCount >= 100,
            value:
              careerAnswerKeyCount >= 100
                ? `${careerAnswerKeyCount}문항 등록`
                : `${careerAnswerKeyCount}문항 (미완료)`,
            feature: "answers" as const,
          },
        ]
      : [
          {
            label: "정답표 (구조 경채)",
            ok: careerRescueAnswerKeyCount >= 65,
            value: `${careerRescueAnswerKeyCount}문항${careerRescueAnswerKeyCount >= 65 ? " 등록" : " (미완료)"}`,
            feature: "answers" as const,
          },
          {
            label: "정답표 (학과 경채)",
            ok: careerAcademicAnswerKeyCount >= 65,
            value: `${careerAcademicAnswerKeyCount}문항${careerAcademicAnswerKeyCount >= 65 ? " 등록" : " (미완료)"}`,
            feature: "answers" as const,
          },
          {
            label: "정답표 (구급 경채)",
            ok: careerEmtAnswerKeyCount >= 65,
            value: `${careerEmtAnswerKeyCount}문항${careerEmtAnswerKeyCount >= 65 ? " 등록" : " (미완료)"}`,
            feature: "answers" as const,
          },
        ]),
    {
      label: "모집인원 설정",
      ok: regionsConfigured > 0 && regionsConfigured === regionsTotal,
      value:
        regionsTotal > 0
          ? `${regionsConfigured}/${regionsTotal}개 지역`
          : "설정 없음",
      feature: "regions",
    },
    {
      label: "서비스 상태",
      ok: !isMaintenanceMode,
      value: isMaintenanceMode ? "점검 모드" : "운영 중",
    },
    {
      label: "마지막 제출",
      ok: true,
      value: formatRelativeTime(lastSubmissionAt),
    },
  ];

  const systemStatus = baseSystemStatus.filter(
    (item) => !item.feature || featureState[item.feature]
  );

  const visibleQuickActions = quickActions.filter(
    (action) =>
      (!action.feature || featureState[action.feature]) &&
      (action.feature !== "preRegistrations" || tenantType === "police")
  );
  const tenantQuickActions = visibleQuickActions.map((action) => ({
    ...action,
    href: withTenantPrefix(action.href, tenantType),
  }));

  const showTrendPanel = featureState.stats;
  const showStatusColumn =
    systemStatus.length > 0 || (activeExam !== null && featureState.exams);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">
          시험 운영 상태와 관리자 기능 준비 현황을 한 화면에서 확인합니다.
        </p>
      </header>

      {hasStatsError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          통계 데이터를 불러오지 못했습니다. 데이터베이스 연결 상태를 확인해 주세요.
        </div>
      ) : null}

      {!hasStatsError ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">현재 운영 단계</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{operationStage.label}</h2>
              <p className="mt-1 text-sm text-slate-600">{operationStage.description}</p>
            </div>
            <Link
              href={withTenantPrefix("/admin/site/features", tenantType)}
              className="inline-flex rounded-md border border-service-300 bg-service-50 px-4 py-2 text-sm font-semibold text-service-800 transition hover:bg-service-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-service-400"
            >
              운영 기능 설정
            </Link>
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">사전등록</p>
              <p className="mt-1 font-semibold text-slate-900">{preRegistrationEnabled ? "켜짐" : "꺼짐"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">답안 입력</p>
              <p className="mt-1 font-semibold text-slate-900">{answerInputEnabled ? "켜짐" : "꺼짐"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">최신 표본 집계</p>
              <p className="mt-1 font-semibold text-slate-900">{latestReleaseNumber ? `${latestReleaseNumber}차` : "발표 전"}</p>
            </div>
          </div>
          {operationWarnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">운영 확인이 필요합니다</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {operationWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {!hasStatsError && checklistItems.length > 0 ? (
        <DashboardSetupChecklist items={tenantChecklistItems} />
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {stats.map((stat, index) => {
          const style = statCardStyles[index % statCardStyles.length];
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <p className={`text-xs font-bold uppercase tracking-wider ${style.label}`}>
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums tracking-tight text-slate-900">
                {stat.value}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {!hasStatsError && (showTrendPanel || showStatusColumn) ? (
        <div
          className={`grid gap-5 ${
            showTrendPanel && showStatusColumn ? "lg:grid-cols-[1fr_280px]" : ""
          }`}
        >
          {showTrendPanel ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">최근 제출 추이</h2>
                <span className="rounded-full bg-service-50 px-3 py-1 text-xs font-medium text-service-600">
                  최근 10일
                </span>
              </div>
              <DashboardSubmissionTrendChart data={submissionTrend} />
            </div>
          ) : null}

          {showStatusColumn ? (
            <div className="flex flex-col gap-4">
              {systemStatus.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    시스템 상태
                  </h3>
                  <div className="mt-4 space-y-3">
                    {systemStatus.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">{item.label}</span>
                        <span
                          className={`text-xs font-semibold ${
                            item.ok ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {item.ok ? "정상" : "주의"} {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeExam && featureState.exams ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    활성 시험
                  </h3>
                  <p className="mt-3 text-lg font-bold text-slate-900">
                    {activeExam.year}년 {activeExam.round}차
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{activeExam.name}</p>
                  <Link
                    href={withTenantPrefix("/admin/exams", tenantType)}
                    className="mt-3 inline-block rounded-lg bg-service-50 px-3 py-1.5 text-xs font-medium text-service-600 transition hover:bg-service-100"
                  >
                    시험 관리
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!hasStatsError && featureState.stats && regionBreakdown.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              지역별 제출 현황 (상위 5개)
            </h2>
            <Link
              href={withTenantPrefix("/admin/stats", tenantType)}
              className="text-xs font-medium text-service-600 hover:text-service-700"
            >
              전체 보기
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                  <th className="whitespace-nowrap pb-2 pr-4">지역</th>
                  <th className="whitespace-nowrap pb-2 pr-4 text-right">공채</th>
                  {tenantType === "police" ? (
                    <th className="whitespace-nowrap pb-2 pr-4 text-right">경행경채</th>
                  ) : (
                    <>
                      <th className="whitespace-nowrap pb-2 pr-4 text-right">구조</th>
                      <th className="whitespace-nowrap pb-2 pr-4 text-right">학과</th>
                      <th className="whitespace-nowrap pb-2 pr-4 text-right">구급</th>
                    </>
                  )}
                  <th className="whitespace-nowrap pb-2 text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {regionBreakdown.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-slate-700">{row.name}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{row.publicCount}</td>
                    {tenantType === "police" ? (
                      <td className="py-2 pr-4 text-right text-slate-600">{row.careerCount}</td>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-right text-slate-600">{row.careerRescueCount}</td>
                        <td className="py-2 pr-4 text-right text-slate-600">{row.careerAcademicCount}</td>
                        <td className="py-2 pr-4 text-right text-slate-600">{row.careerEmtCount}</td>
                      </>
                    )}
                    <td className="py-2 text-right font-semibold text-slate-900">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {visibleQuickActions.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">빠른 실행</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {tenantQuickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${action.hoverBg}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold ${action.color} transition group-hover:bg-slate-200`}
                  >
                    {action.num}
                  </span>
                  <p className="text-sm font-semibold text-slate-800">{action.title}</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
