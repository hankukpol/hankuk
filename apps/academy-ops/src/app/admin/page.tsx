import Link from "next/link";
import { AdminRole, ExamType } from "@prisma/client";
import { DashboardActivityFeed } from "@/app/admin/dashboard-activity-feed";
import { DashboardInbox } from "@/components/admin/dashboard-inbox";
import { DashboardInboxPanel } from "@/components/dashboard/dashboard-inbox-panel";
import { TodayTodosPanel } from "@/components/dashboard/today-todos-panel";
import { WeeklyPaymentChart } from "@/components/dashboard/weekly-payment-chart";
import { AdminMemoDashboardPanel } from "@/components/memos/admin-memo-dashboard-panel";
import { Sparkline } from "@/components/ui/sparkline";
import { getDashboardSummary } from "@/lib/analytics/service";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_CATEGORY_LABEL, EXAM_TYPE_LABEL, ROLE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { listDashboardInboxData } from "@/lib/dashboard/inbox";
import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
  getServerErrorLogMessage,
} from "@/lib/error-display";
import { formatDate } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const context = await requireAdminContext(AdminRole.VIEWER);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const todayForExams = new Date();
  todayForExams.setHours(0, 0, 0, 0);

  // 지난 7일 일별 수납 데이터 계산
  const weeklyPaymentData = await (async () => {
    const days: { label: string; dateStr: string; amount: number; count: number }[] = [];
    const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const dEnd = new Date(d);
      dEnd.setHours(23, 59, 59, 999);
      const agg = await getPrisma().payment.aggregate({
        where: { processedAt: { gte: d, lte: dEnd } },
        _sum: { netAmount: true },
        _count: { id: true },
      });
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const dow = DAY_KO[d.getDay()];
      days.push({
        label: `${mm}/${dd}(${dow})`,
        dateStr: d.toISOString().slice(0, 10),
        amount: agg._sum.netAmount ?? 0,
        count: agg._count.id,
      });
    }
    return days;
  })().catch(() => [] as { label: string; dateStr: string; amount: number; count: number }[]);

  const in14Days = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [summaryResult, inboxResult, enrollmentKpi, urgentKpi, upcomingExams, extraKpi, pendingRefundCount, endingCohorts] = await Promise.all([
    getDashboardSummary()
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    listDashboardInboxData({
      includeFailedNotifications: context.adminUser.role !== AdminRole.VIEWER,
    })
      .then((data) => ({ ok: true as const, data }))
      .catch((err: unknown) => ({ ok: false as const, err })),
    getPrisma()
      .$transaction([
        getPrisma().courseEnrollment.count({ where: { status: "ACTIVE" } }),
        getPrisma().courseEnrollment.count({ where: { status: "WAITING" } }),
        getPrisma().courseEnrollment.count({ where: { createdAt: { gte: weekAgo } } }),
        getPrisma().payment.count({
          where: { processedAt: { gte: todayStart, lte: todayEnd } },
        }),
        getPrisma().payment.aggregate({
          where: { processedAt: { gte: todayStart, lte: todayEnd } },
          _sum: { netAmount: true },
        }),
      ])
      .then(([activeCount, waitingCount, newThisWeek, todayCount, todayAgg]) => ({
        activeCount,
        waitingCount,
        newThisWeek,
        todayCount,
        todayNet: todayAgg._sum.netAmount ?? 0,
      }))
      .catch(() => null),
    getPrisma()
      .$transaction([
        getPrisma().courseEnrollment.count({
          where: { status: "ACTIVE", endDate: { gte: todayStart, lte: in7Days } },
        }),
        getPrisma().installment.count({
          where: { paidAt: null, dueDate: { lt: todayStart } },
        }),
        getPrisma().courseEnrollment.count({
          where: { createdAt: { gte: todayStart } },
        }),
      ])
      .then(([expiringCount, overdueInstallments, todayNewEnrollments]) => ({
        expiringCount,
        overdueInstallments,
        todayNewEnrollments,
      }))
      .catch(() => null),
    getPrisma()
      .civilServiceExam.findMany({
        where: {
          isActive: true,
          writtenDate: { gte: todayForExams },
        },
        orderBy: { writtenDate: "asc" },
        take: 3,
        select: {
          id: true,
          name: true,
          examType: true,
          year: true,
          writtenDate: true,
          interviewDate: true,
          resultDate: true,
        },
      })
      .catch(() => [] as never[]),
    getPrisma()
      .$transaction([
        // 오늘 결석 학생 수
        getPrisma().classroomAttendanceLog.count({
          where: { attendType: "ABSENT", attendDate: { gte: todayStart, lte: todayEnd } },
        }),
        // 최근 7일 발행된 공지사항 수
        getPrisma().notice.count({
          where: { isPublished: true, publishedAt: { gte: weekAgo } },
        }),
        // 현재 활성 결제 링크 수
        getPrisma().paymentLink.count({
          where: { status: "ACTIVE", expiresAt: { gte: todayStart } },
        }),
      ])
      .then(([todayAbsentCount, recentNoticeCount, activePaymentLinkCount]) => ({
        todayAbsentCount,
        recentNoticeCount,
        activePaymentLinkCount,
      }))
      .catch(() => null),
    // 결재 대기: PENDING 상태 환불 건수
    getPrisma()
      .refund.count({ where: { status: "PENDING" } })
      .catch(() => 0),
    // 기수 종료 임박: 14일 이내 종료 예정인 활성 기수
    getPrisma()
      .cohort.findMany({
        where: {
          isActive: true,
          endDate: { gte: todayStart, lte: in14Days },
        },
        orderBy: { endDate: "asc" },
        select: {
          id: true,
          name: true,
          endDate: true,
          examCategory: true,
          _count: {
            select: {
              enrollments: {
                where: { status: { in: ["ACTIVE", "PENDING"] } },
              },
            },
          },
        },
      })
      .catch(() => [] as never[]),
  ]);

  // 직원별 오늘 실적: 수납 처리 건수 + 수강 등록 건수
  const todayStaffPerformance = await (async () => {
    const [paymentsByStaff, enrollmentsByStaff, staffList] = await Promise.all([
      getPrisma().payment.groupBy({
        by: ["processedBy"],
        where: { processedAt: { gte: todayStart, lte: todayEnd } },
        _count: { id: true },
        _sum: { netAmount: true },
      }),
      getPrisma().courseEnrollment.groupBy({
        by: ["staffId"],
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
        _count: { id: true },
      }),
      getPrisma().adminUser.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
      }),
    ]);

    // Merge into per-staff rows
    const staffMap = new Map<string, { name: string; role: string; payments: number; paymentNet: number; enrollments: number }>();
    for (const s of staffList) {
      staffMap.set(s.id, { name: s.name, role: s.role, payments: 0, paymentNet: 0, enrollments: 0 });
    }
    for (const p of paymentsByStaff) {
      const entry = staffMap.get(p.processedBy);
      if (entry) {
        entry.payments = p._count.id;
        entry.paymentNet = p._sum.netAmount ?? 0;
      } else {
        staffMap.set(p.processedBy, { name: p.processedBy, role: "", payments: p._count.id, paymentNet: p._sum.netAmount ?? 0, enrollments: 0 });
      }
    }
    for (const e of enrollmentsByStaff) {
      const entry = staffMap.get(e.staffId);
      if (entry) {
        entry.enrollments = e._count.id;
      } else {
        staffMap.set(e.staffId, { name: e.staffId, role: "", payments: 0, paymentNet: 0, enrollments: e._count.id });
      }
    }
    // Only staff with at least 1 activity today
    return Array.from(staffMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .filter((s) => s.payments > 0 || s.enrollments > 0)
      .sort((a, b) => (b.payments + b.enrollments) - (a.payments + a.enrollments));
  })().catch(() => [] as Array<{ id: string; name: string; role: string; payments: number; paymentNet: number; enrollments: number }>);

  // 최근 활동 피드 (병렬 페치)
  const [recentEnrollments, recentPayments, recentAttendance] = await Promise.all([
    getPrisma()
      .courseEnrollment.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          student: { select: { name: true, examNumber: true } },
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
        },
      })
      .catch(() => [] as never[]),
    getPrisma()
      .payment.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
        where: { status: "APPROVED" },
        select: {
          id: true,
          createdAt: true,
          netAmount: true,
          method: true,
          examNumber: true,
          student: { select: { name: true } },
        },
      })
      .catch(() => [] as never[]),
    getPrisma()
      .classroomAttendanceLog.findMany({
        take: 4,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          attendType: true,
          student: { select: { name: true, examNumber: true } },
        },
      })
      .catch(() => [] as never[]),
  ]);

  if (!summaryResult.ok) {
    const err = summaryResult.err;
    const details = getDisplayErrorDetails(err);
    console.error("[AdminDashboard] error:", getServerErrorLogMessage(err));
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-red-700">대시보드 오류</h1>
        <p className="mt-4 text-sm text-slate">
          {getDisplayErrorMessage(err, "대시보드를 불러오는 중 오류가 발생했습니다.")}
        </p>
        {details ? (
          <pre className="mt-4 whitespace-pre-wrap break-all rounded bg-red-50 p-4 text-sm text-red-800">
            {details}
          </pre>
        ) : null}
      </div>
    );
  }

  const summary = summaryResult.data;
  const dashboardInbox = inboxResult.ok ? inboxResult.data : null;

  if (!inboxResult.ok) {
    console.error("[AdminDashboardInbox] error:", getServerErrorLogMessage(inboxResult.err));
  }

  if (!summary) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 대시보드
        </div>
        <h1 className="mt-5 text-3xl font-semibold">관리자 대시보드</h1>
        <p className="mt-4 text-sm leading-7 text-slate">
          아직 시험 기간이 없습니다. 먼저 기간과 회차를 등록해 주세요.
        </p>
        <Link
          href="/admin/periods"
          className="btn-ripple mt-6 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          기간 관리 열기
        </Link>
      </div>
    );
  }

  const totalStudents = summary.studentCounts.gongchae + summary.studentCounts.gyeongchae;
  const totalAlerts =
    summary.statusCounts.dropout + summary.statusCounts.warning2 + summary.statusCounts.warning1;
  const recentScoreWeekCount = summary.weeklyAvgScoreTrend.length;

  const kpiCards = [
    {
      label: "주간 평균 점수",
      value: summary.weeklyAvgScore !== null ? `${summary.weeklyAvgScore.toFixed(1)}점` : "-",
      sub:
        recentScoreWeekCount > 0
          ? `최근 완료된 ${recentScoreWeekCount}주 기준`
          : "최근 주간 데이터가 없습니다.",
      href: "/admin/analytics",
      color: "border-ember/30 bg-ember/5",
      valueColor: "text-ember",
      trend: summary.weeklyAvgScoreTrend,
      trendColor: "#C55A11",
      trendCaption: "최근 주간 점수 추이",
      trendPositiveIsGood: true,
    },
    {
      label: "활성 학생",
      value: `${totalStudents}`,
      sub: `공채 ${summary.studentCounts.gongchae} / 경채 ${summary.studentCounts.gyeongchae}`,
      href: "/admin/students",
      color: "border-forest/30 bg-forest/5",
      valueColor: "text-forest",
    },
    {
      label: "경고 · 탈락",
      value: `${totalAlerts}`,
      sub: `탈락 ${summary.statusCounts.dropout} / 2차 경고 ${summary.statusCounts.warning2} / 1차 경고 ${summary.statusCounts.warning1}`,
      href: "/admin/dropout",
      color: totalAlerts > 0 ? "border-red-300 bg-red-50/50" : "border-ink/10 bg-white",
      valueColor: totalAlerts > 0 ? "text-red-700" : "text-ink",
      trend: summary.alertCountTrend,
      trendColor: "#DC2626",
      trendCaption: "최근 8주 경고 추이",
      trendPositiveIsGood: false,
    },
    {
      label: "검토 대기 사유서",
      value: `${summary.pendingAbsenceCount}`,
      sub:
        context.adminUser.role !== AdminRole.VIEWER
          ? `${summary.pendingNotificationCount}건 알림이 별도로 대기 중`
          : "검토 대기 사유서 현황",
      href: "/admin/absence-notes",
      color:
        summary.pendingAbsenceCount > 0
          ? "border-amber-300 bg-amber-50/50"
          : "border-ink/10 bg-white",
      valueColor: summary.pendingAbsenceCount > 0 ? "text-amber-700" : "text-ink",
    },
    {
      label: "성적 미입력 회차",
      value: `${summary.missingScoredSessionCount}`,
      sub: "활성 기간 내 과거 회차 기준",
      href: "/admin/scores/input",
      color:
        summary.missingScoredSessionCount > 0
          ? "border-ember/30 bg-ember/5"
          : "border-ink/10 bg-white",
      valueColor: summary.missingScoredSessionCount > 0 ? "text-ember" : "text-ink",
    },
    {
      label: "결재 대기",
      value: `${pendingRefundCount}`,
      sub: "승인 대기 중인 환불 요청",
      href: "/admin/approvals",
      color:
        pendingRefundCount > 0
          ? "border-amber-300 bg-amber-50/50"
          : "border-ink/10 bg-white",
      valueColor: pendingRefundCount > 0 ? "text-amber-700" : "text-ink",
    },
  ];

  const quickLinks = [
    { href: "/admin/memos", title: "운영 메모", description: "오늘의 메모 스트림과 작업 보드" },
    { href: "/admin/calendar", title: "통합 캘린더", description: "시험 회차·면담 예약 월간 일정표" },
    { href: "/admin/scores/input", title: "성적 입력", description: "오프라인과 온라인 업로드" },
    { href: "/admin/scores/edit", title: "성적 수정", description: "기록 조회, 수정, 삭제" },
    { href: "/admin/dropout", title: "경고 · 탈락", description: "위험 학생 필터와 안내 발송" },
    { href: "/admin/analytics", title: "분석", description: "일별, 월별, 과목별 분석" },
    { href: "/admin/results/integrated", title: "통합 결과표", description: "기간 전체 석차 출력" },
    { href: "/admin/absence-notes", title: "사유서 검토", description: "대기 중인 사유서 처리" },
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/notifications", title: "알림 센터", description: "대기·실패 알림과 발송 이력" }
      : null,
    { href: "/admin/students", title: "학생 목록", description: "학생 조회, 등록, 수정" },
    { href: "/admin/export", title: "내보내기", description: "성적과 학생 데이터 xlsx 다운로드" },
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/settings/courses", title: "강좌 마스터", description: "강좌 생성, 수정, 기수 관리" }
      : null,
    context.adminUser.role !== AdminRole.VIEWER
      ? { href: "/admin/settings/textbooks", title: "교재 관리", description: "교재 등록, 재고 조정" }
      : null,
  ].filter((item): item is { href: string; title: string; description: string } => item !== null);

  const fallbackAttentionLinks = [
    {
      href: "/admin/absence-notes",
      label: "검토 대기 사유서",
      value: summary.pendingAbsenceCount,
      valueLabel: `${summary.pendingAbsenceCount}`,
      description: "검토 대기 목록 열기",
      className: "border-amber-200 bg-amber-50/70 text-amber-800",
    },
    {
      href: "/admin/notifications",
      label: "대기·실패 알림",
      value: context.adminUser.role !== AdminRole.VIEWER ? summary.pendingNotificationCount : 0,
      valueLabel:
        context.adminUser.role !== AdminRole.VIEWER && summary.pendingNotificationCount === 0
          ? "확인"
          : `${context.adminUser.role !== AdminRole.VIEWER ? summary.pendingNotificationCount : 0}`,
      description: "알림 센터에서 대기·실패 건 확인",
      className: "border-red-200 bg-red-50/70 text-red-800",
      alwaysShow: context.adminUser.role !== AdminRole.VIEWER,
    },
    {
      href: "/admin/scores/input",
      label: "성적 미입력 회차",
      value: summary.missingScoredSessionCount,
      valueLabel: `${summary.missingScoredSessionCount}`,
      description: "성적 입력 화면 열기",
      className: "border-sky-200 bg-sky-50/70 text-sky-800",
    },
  ].filter((item) => item.alwaysShow || item.value > 0);

  function computeExamDDay(date: Date): { label: string; color: string } {
    const diff = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: "종료", color: "bg-ink/10 text-ink" };
    if (diff === 0) return { label: "D-Day", color: "bg-red-100 text-red-700" };
    if (diff <= 14) return { label: `D-${diff}`, color: "bg-red-100 text-red-700" };
    if (diff <= 30) return { label: `D-${diff}`, color: "bg-amber-100 text-amber-700" };
    return { label: `D-${diff}`, color: "bg-forest/10 text-forest" };
  }

  function formatKoreanDate(date: Date | null): string {
    if (!date) return "-";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}년 ${m}월 ${d}일`;
  }

  return (
    <div className="space-y-8 p-6 sm:p-8 lg:p-10">
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-12 대시보드
        </div>

        <h1 className="mt-4 text-3xl font-semibold text-ink">관리자 대시보드</h1>
        <p className="mt-2 text-sm text-slate">
          {summary.activePeriod.name} / {formatDate(summary.activePeriod.startDate)} ~ {formatDate(summary.activePeriod.endDate)} / {summary.currentWeekLabel}
        </p>
      </div>

      {/* 빠른 작업 */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/payments/new"
          className="btn-ripple inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          <span>+</span> 수납 등록
        </Link>
        <Link
          href="/admin/enrollments/new"
          className="btn-ripple inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
        >
          <span>+</span> 수강 등록
        </Link>
        <Link
          href="/admin/students/new"
          className="btn-ripple inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/40 hover:bg-ink/5"
        >
          <span>+</span> 학생 등록
        </Link>
        <Link
          href="/admin/payment-links/new"
          className="btn-ripple inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          <span>+</span> 결제 링크 생성
        </Link>
      </div>

      <AdminMemoDashboardPanel
        currentAdminId={context.adminUser.id}
        currentAdminRole={context.adminUser.role}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`card-lift btn-ripple rounded-[24px] border p-5 transition hover:shadow-md ${card.color}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">{card.label}</p>
            <p className={`count-animated mt-2 text-4xl font-bold ${card.valueColor}`}>{card.value}</p>
            <p className="mt-2 text-xs text-slate">{card.sub}</p>
            {card.trend && card.trend.length > 0 ? (
              <div className="mt-4 rounded-[18px] border border-ink/10 bg-white/70 px-3 py-2">
                <Sparkline
                  data={card.trend}
                  color={card.trendColor}
                  positiveIsGood={card.trendPositiveIsGood}
                />
                <p className="mt-1 text-[11px] text-slate">{card.trendCaption}</p>
              </div>
            ) : null}
          </Link>
        ))}
      </div>

      {/* 수신함 — 클라이언트 실시간 폴링 (60초 간격) */}
      <DashboardInbox />

      {dashboardInbox ? (
        <DashboardInboxPanel
          initialData={dashboardInbox}
          canRetry={context.adminUser.role !== AdminRole.VIEWER}
        />
      ) : (
        <section className="rounded-[28px] border border-red-200 bg-red-50/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-red-800">즉시 처리 필요</h2>
              <p className="mt-2 text-sm leading-7 text-red-700">
                인박스 데이터를 불러오지 못했습니다. 아래 요약 기반 바로가기에서 운영 작업을 계속 진행할 수 있습니다.
              </p>
            </div>
            <div className="inline-flex rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700">
              요약 기반 안내
            </div>
          </div>

          {fallbackAttentionLinks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-red-200 bg-white/80 px-5 py-8 text-sm text-red-700">
              현재 요약 기준으로 바로 처리할 항목은 없습니다.
            </div>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {fallbackAttentionLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[24px] border p-5 transition hover:shadow-sm ${item.className}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold">{item.valueLabel}</p>
                  <p className="mt-2 text-sm">{item.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">오늘 성적 입력 현황</h2>
          <Link
            href="/admin/scores/input"
            className="text-sm font-semibold text-slate underline transition hover:text-ember"
          >
            성적 입력 열기
          </Link>
        </div>

        {summary.todaySessions.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            오늘 예정된 시험이 없습니다.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summary.todaySessions.map((session) => {
              const expectedCount =
                session.examType === ExamType.GONGCHAE
                  ? summary.studentCounts.gongchae
                  : summary.studentCounts.gyeongchae;
              const completionRate =
                expectedCount === 0
                  ? 0
                  : Math.round((session._count.scores / expectedCount) * 1000) / 10;
              const isComplete = completionRate >= 100;

              return (
                <article
                  key={session.id}
                  className={`card-lift rounded-[24px] border p-5 ${
                    isComplete ? "border-forest/30 bg-forest/5" : "border-ink/10 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold">
                      {EXAM_TYPE_LABEL[session.examType]}
                    </span>
                    <span className={`text-sm font-bold ${isComplete ? "text-forest" : "text-ink"}`}>
                      {completionRate.toFixed(1)}%
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold">{SUBJECT_LABEL[session.subject]}</h3>
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isComplete ? "bg-forest" : "bg-ember"
                        }`}
                        style={{ width: `${Math.min(completionRate, 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate">
                      <span>
                        <strong className="text-ink">{session._count.scores}</strong> 입력 완료
                      </span>
                      <span>{expectedCount} 대상 학생</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-mist/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">수강관리 현황</h2>
            <p className="mt-1 text-xs text-slate">오늘 기준 실시간 수강·수납 현황</p>
          </div>
          <Link
            href="/admin/enrollments"
            className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
          >
            수강 목록 열기
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-forest/20 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 수강생</p>
            <p className="count-animated mt-2 text-4xl font-bold text-forest">
              {enrollmentKpi ? enrollmentKpi.activeCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">현재 수강 중인 전체 학생</p>
          </Link>
          <Link
            href="/admin/payments"
            className="card-lift rounded-[20px] border border-ember/20 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">오늘 수납</p>
            <p className="count-animated mt-2 text-4xl font-bold text-ember">
              {enrollmentKpi ? enrollmentKpi.todayCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {enrollmentKpi
                ? `합계 ${enrollmentKpi.todayNet.toLocaleString()}원`
                : "오늘 수납 건수"}
            </p>
          </Link>
          <Link
            href="/admin/enrollments"
            className={`card-lift rounded-[20px] border bg-white p-5 transition hover:shadow-md ${
              enrollmentKpi && enrollmentKpi.waitingCount > 0
                ? "border-amber-200"
                : "border-ink/10"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">대기자</p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                enrollmentKpi && enrollmentKpi.waitingCount > 0 ? "text-amber-600" : "text-ink"
              }`}
            >
              {enrollmentKpi ? enrollmentKpi.waitingCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">등록 대기 중인 학생 수</p>
          </Link>
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-ink/10 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">이번 주 신규</p>
            <p className="count-animated mt-2 text-4xl font-bold text-ink">
              {enrollmentKpi ? enrollmentKpi.newThisWeek.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">최근 7일 신규 수강 등록</p>
          </Link>
        </div>

        {/* 2행: 출결·공지·결제링크 */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Link
            href="/admin/attendance"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              extraKpi && extraKpi.todayAbsentCount > 0
                ? "border-red-200 bg-red-50"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">오늘 결석</p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                extraKpi && extraKpi.todayAbsentCount > 0 ? "text-red-700" : "text-ink"
              }`}
            >
              {extraKpi ? extraKpi.todayAbsentCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">오늘 결석 처리된 학생 수</p>
          </Link>
          <Link
            href="/admin/notices"
            className="card-lift rounded-[20px] border border-ink/10 bg-white p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">최근 공지</p>
            <p className="count-animated mt-2 text-4xl font-bold text-ink">
              {extraKpi ? extraKpi.recentNoticeCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">최근 7일 발행된 공지사항</p>
          </Link>
          <Link
            href="/admin/payment-links"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              extraKpi && extraKpi.activePaymentLinkCount > 0
                ? "border-forest/20 bg-forest/5"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">활성 결제 링크</p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                extraKpi && extraKpi.activePaymentLinkCount > 0 ? "text-forest" : "text-ink"
              }`}
            >
              {extraKpi ? extraKpi.activePaymentLinkCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">현재 유효한 온라인 결제 링크</p>
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">오늘 처리 필요</h2>
            <p className="mt-1 text-xs text-slate">만료 예정·미납·신규 등록 현황</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {/* 만료 예정 수강생 */}
          <Link
            href="/admin/enrollments/expiring?days=7"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              urgentKpi && urgentKpi.expiringCount > 0
                ? "border-red-200 bg-red-50"
                : "border-forest/20 bg-forest/5"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              만료 예정 수강생
            </p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                urgentKpi && urgentKpi.expiringCount > 0 ? "text-red-700" : "text-forest"
              }`}
            >
              {urgentKpi ? urgentKpi.expiringCount.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {urgentKpi && urgentKpi.expiringCount > 0
                ? "7일 이내 수강 만료 예정"
                : "7일 이내 만료 없음"}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate underline">목록 보기 →</p>
          </Link>

          {/* 미납 분할납부 */}
          <Link
            href="/admin/payments/unpaid"
            className={`card-lift rounded-[20px] border p-5 transition hover:shadow-md ${
              urgentKpi && urgentKpi.overdueInstallments > 0
                ? "border-red-200 bg-red-50"
                : "border-ink/10 bg-white"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              미납 분할납부
            </p>
            <p
              className={`count-animated mt-2 text-4xl font-bold ${
                urgentKpi && urgentKpi.overdueInstallments > 0 ? "text-red-700" : "text-ink"
              }`}
            >
              {urgentKpi ? urgentKpi.overdueInstallments.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">
              {urgentKpi && urgentKpi.overdueInstallments > 0
                ? "납부 기한 초과 미납 건"
                : "미납 분할납부 없음"}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate underline">미납 목록 →</p>
          </Link>

          {/* 오늘 신규 등록 */}
          <Link
            href="/admin/enrollments"
            className="card-lift rounded-[20px] border border-forest/20 bg-forest/5 p-5 transition hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">
              오늘 신규 등록
            </p>
            <p className="count-animated mt-2 text-4xl font-bold text-forest">
              {urgentKpi ? urgentKpi.todayNewEnrollments.toLocaleString() : "—"}
            </p>
            <p className="mt-2 text-xs text-slate">오늘 새로 등록된 수강 건수</p>
            <p className="mt-3 text-xs font-semibold text-slate underline">전체 목록 →</p>
          </Link>
        </div>
      </section>

      {/* 기수 종료 임박 */}
      {endingCohorts.length > 0 && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">기수 종료 임박</h2>
              <p className="mt-1 text-xs text-amber-700">14일 이내 종료 예정인 활성 기수 — 수료 처리가 필요합니다</p>
            </div>
            <Link
              href="/admin/cohorts"
              className="inline-flex rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              기수 현황 대시보드
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {endingCohorts.map((cohort) => {
              const endDate = new Date(cohort.endDate);
              const diffDays = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const dDayLabel = diffDays <= 0 ? "D-Day" : `D-${diffDays}`;
              const dDayColor = diffDays <= 0 ? "bg-red-100 text-red-700" : diffDays <= 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
              return (
                <Link
                  key={cohort.id}
                  href={`/admin/settings/cohorts/${cohort.id}/graduation`}
                  className="flex items-start justify-between gap-3 rounded-[20px] border border-amber-200 bg-white p-4 transition hover:border-amber-400 hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{cohort.name}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? cohort.examCategory}
                      {" · "}
                      종료 {endDate.toLocaleDateString("ko-KR")}
                    </p>
                    <p className="mt-1 text-xs text-slate">
                      재원생 <strong className="text-ink">{cohort._count.enrollments}</strong>명
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dDayColor}`}>
                      {dDayLabel}
                    </span>
                    <span className="text-xs font-semibold text-amber-700 underline">수료 처리 →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 오늘의 할 일 (클라이언트 컴포넌트) */}
      <TodayTodosPanel />

      {/* 주간 수납 추이 */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">이번 주 수납 추이</h2>
            <p className="mt-1 text-xs text-slate">최근 7일 일별 수납 금액</p>
          </div>
          <Link
            href="/admin/payments"
            className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
          >
            수납 목록
          </Link>
        </div>
        <div className="mt-5">
          <WeeklyPaymentChart data={weeklyPaymentData} />
        </div>
        {weeklyPaymentData.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {weeklyPaymentData.map((d) => (
              <div key={d.dateStr} className="text-center">
                <p className="text-[10px] text-slate">{d.label}</p>
                <p className="text-xs font-semibold text-ink">
                  {d.amount > 0 ? `${(d.amount / 10000).toFixed(0)}만` : "-"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">시험 일정</h2>
            <p className="mt-1 text-xs text-slate">예정된 공무원 시험 D-day</p>
          </div>
          <Link
            href="/admin/settings/civil-exams"
            className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
          >
            시험 일정 관리
          </Link>
        </div>
        {upcomingExams.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-6 text-sm text-slate">
            예정된 시험이 없습니다.
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            {upcomingExams.map((exam) => {
              const dday = exam.writtenDate ? computeExamDDay(exam.writtenDate) : null;
              return (
                <div
                  key={exam.id}
                  className="flex min-w-[200px] flex-1 items-center gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{exam.name}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {EXAM_TYPE_LABEL[exam.examType]} / {exam.year}년
                    </p>
                    <p className="mt-0.5 text-xs text-slate">
                      필기 {exam.writtenDate ? formatKoreanDate(exam.writtenDate) : "-"}
                    </p>
                  </div>
                  {dday ? (
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${dday.color}`}>
                      {dday.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 최근 활동 피드 */}
      <DashboardActivityFeed
        data={{
          recentEnrollments,
          recentPayments,
          recentAttendance,
        }}
      />

      {/* 직원별 오늘 실적 */}
      {todayStaffPerformance.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">직원별 오늘 실적</h2>
              <p className="mt-1 text-xs text-slate">오늘 수납·등록 처리 건수 (활동 있는 직원만 표시)</p>
            </div>
            <Link
              href="/admin/dashboard/staff-performance"
              className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/20"
            >
              자세히 보기 →
            </Link>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-4">직원명</th>
                  <th className="pb-3 pr-4">역할</th>
                  <th className="pb-3 pr-4 text-right">수납 처리</th>
                  <th className="pb-3 pr-4 text-right">수납 금액</th>
                  <th className="pb-3 text-right">수강 등록</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {todayStaffPerformance.map((s) => (
                  <tr key={s.id} className="hover:bg-mist/50">
                    <td className="py-3 pr-4 font-medium text-ink">{s.name}</td>
                    <td className="py-3 pr-4 text-slate text-xs">
                      {s.role ? (ROLE_LABEL[s.role as keyof typeof ROLE_LABEL] ?? s.role) : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {s.payments > 0 ? (
                        <span className="font-semibold text-ember">{s.payments}건</span>
                      ) : (
                        <span className="text-slate">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs text-slate">
                      {s.paymentNet > 0 ? `${s.paymentNet.toLocaleString()}원` : "-"}
                    </td>
                    <td className="py-3 text-right">
                      {s.enrollments > 0 ? (
                        <span className="font-semibold text-forest">{s.enrollments}건</span>
                      ) : (
                        <span className="text-slate">-</span>
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
        <h2 className="text-lg font-semibold">바로가기</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card-lift btn-ripple flex items-start justify-between rounded-[20px] border border-ink/10 p-4 transition hover:border-forest/30 hover:bg-forest/5"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{link.title}</p>
                <p className="mt-1 text-xs text-slate">{link.description}</p>
              </div>
              <span className="ml-2 mt-0.5 shrink-0 text-slate">-&gt;</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}