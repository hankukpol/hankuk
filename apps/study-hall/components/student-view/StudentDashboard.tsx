import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ShieldAlert,
  Target,
} from "lucide-react";

import { PointCategoryBadge, PointValueBadge } from "@/components/points/PointBadges";
import { AttendanceCalendar } from "@/components/student-view/AttendanceCalendar";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalEmptyState,
  PortalMetricCard,
  PortalMiniTile,
  PortalSectionHeader,
  portalCardClass,
  portalInsetClass,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { getWarningStageLabel, toDemeritPoints } from "@/lib/student-meta";
import type { StudentDashboardData } from "@/lib/services/student-dashboard.service";

type StudentDashboardProps = {
  data: StudentDashboardData;
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("ko-KR");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRatio(current: number, total: number) {
  return `${current}/${total}`;
}

function formatStudyDuration(summary: StudentDashboardData["summary"]) {
  if (summary.monthlyStudyMinutes === 0) {
    return "0분";
  }

  if (summary.monthlyStudyHours > 0) {
    return `${summary.monthlyStudyHours}시간 ${summary.monthlyStudyMinutesRemainder}분`;
  }

  return `${summary.monthlyStudyMinutesRemainder}분`;
}

function getAnnouncementDate(
  announcement: StudentDashboardData["recentAnnouncements"][number],
) {
  return announcement.publishedAt ?? announcement.createdAt;
}

function getPreviewText(content: string, maxLength = 84) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

export function StudentDashboard({ data }: StudentDashboardProps) {
  const attendanceEnabled = data.featureFlags.attendanceManagement;
  const announcementsEnabled = data.featureFlags.announcements;
  const pointsEnabled = data.featureFlags.pointManagement;
  const examsEnabled = data.featureFlags.examManagement;
  const examScheduleEnabled = data.featureFlags.examScheduleManagement;

  return (
    <StudentPortalFrame
      division={data.division}
      student={data.student}
      current="dashboard"
      attendanceEnabled={attendanceEnabled}
      announcementsEnabled={announcementsEnabled}
      pointsEnabled={pointsEnabled}
      examsEnabled={examsEnabled}
      title={`${data.student.name} 학생 포탈`}
      description={`${data.division.fullName} 학생용 모바일 포탈입니다. 공지, 출석, 상벌점, 성적을 빠르게 확인할 수 있습니다.`}
    >
      {examScheduleEnabled && data.upcomingExamSchedule ? (
        <section className={`${portalSectionClass} py-3.5`}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
              style={{
                backgroundColor: "var(--division-color)",
                color: "var(--division-on-accent)",
              }}
            >
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[12px] font-bold"
                style={{ color: "var(--division-color)" }}
              >
                D-DAY
              </p>
              <h2 className="mt-0.5 truncate text-[16px] font-bold text-[var(--foreground)]">
                {data.upcomingExamSchedule.name}
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                {data.upcomingExamSchedule.examDate}
              </p>
            </div>
            <div
              className="rounded-[10px] px-3 py-1.5 text-[13px] font-bold"
              style={{
                backgroundColor:
                  data.upcomingExamSchedule.dDayValue === 0 ? "#fee2e2" : "white",
                color:
                  data.upcomingExamSchedule.dDayValue === 0
                    ? "#b91c1c"
                    : "var(--division-color)",
                border:
                  "1px solid " +
                  (data.upcomingExamSchedule.dDayValue === 0
                    ? "#fecaca"
                    : "var(--division-color-light)"),
              }}
            >
              {data.upcomingExamSchedule.dDayLabel}
            </div>
          </div>
        </section>
      ) : null}

      {data.enrollment ? (() => {
        const { daysRemaining, expirationWarningDays } = data.enrollment;
        const isExpired = daysRemaining <= 0;
        const isCritical = daysRemaining <= 7;
        const isWarning = daysRemaining <= expirationWarningDays;

        const bgColor = isCritical ? "#fef2f2" : isWarning ? "#fffbeb" : "#f0fdf4";
        const fgColor = isCritical ? "#b91c1c" : isWarning ? "#b45309" : "#15803d";
        const borderColor = isCritical ? "#fecaca" : isWarning ? "#fde68a" : "#bbf7d0";

        const dDayLabel = isExpired
          ? daysRemaining === 0 ? "오늘 만료" : `${Math.abs(daysRemaining)}일 초과`
          : `D-${daysRemaining}`;

        return (
          <section className={`${portalSectionClass} py-3.5`}>
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: bgColor, color: fgColor }}
              >
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold" style={{ color: fgColor }}>
                  수강 기간
                </p>
                <h2 className="mt-0.5 truncate text-[16px] font-bold text-[var(--foreground)]">
                  {formatDate(data.enrollment.courseStartDate)} ~ {formatDate(data.enrollment.courseEndDate)}
                </h2>
              </div>
              <div
                className="rounded-[10px] px-3 py-1.5 text-[13px] font-bold"
                style={{
                  backgroundColor: bgColor,
                  color: fgColor,
                  border: `1px solid ${borderColor}`,
                }}
              >
                {dDayLabel}
              </div>
            </div>
          </section>
        );
      })() : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={attendanceEnabled ? "" : "hidden"}>
          <PortalMetricCard
          label="이번 달 출석률"
          value={`${data.summary.monthlyAttendanceRate}%`}
          caption={`${formatRatio(data.summary.monthlyAttendedCount, data.summary.monthlyExpectedCount)} 교시 기준`}
          />
        </div>
        <div className={attendanceEnabled ? "" : "hidden"}>
          <PortalMetricCard
          label="이번 주 출석"
          value={formatRatio(data.summary.weeklyAttendedCount, data.summary.weeklyExpectedCount)}
          caption="필수 교시 종료분 반영"
          />
        </div>
        <PortalMetricCard
          label="월간 학습 시간"
          value={formatStudyDuration(data.summary)}
          caption="입퇴실 기록 기준 누적 시간"
        />
        <PortalMetricCard
          label="현재 경고 단계"
          value={getWarningStageLabel(data.student.warningStage)}
          caption={`누적 벌점 ${toDemeritPoints(data.student.netPoints)}점 기준`}
          valueToneClassName="text-rose-600"
        />
      </section>

      {announcementsEnabled || attendanceEnabled ? (
        <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
          {announcementsEnabled ? (
            <section className={portalSectionClass}>
          <PortalSectionHeader
            title="공지사항"
            icon={<BellRing className="h-5 w-5" />}
            action={
              <Link
                href={`/${data.division.slug}/student/announcements`}
                className="inline-flex items-center gap-1 text-[13px] font-medium transition hover:opacity-70"
                style={{ color: "var(--division-color)" }}
              >
                더보기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />

          {data.recentAnnouncements.length > 0 ? (
            <div className="mt-3 grid gap-2.5">
              {data.recentAnnouncements.slice(0, 3).map((announcement) => (
                <article key={announcement.id} className={`${portalCardClass} p-3.5`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-[10px] border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--foreground)]">
                      {announcement.divisionName || "전체 공지"}
                    </span>
                    {announcement.isPinned ? (
                      <span className="inline-flex rounded-[10px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                        중요
                      </span>
                    ) : null}
                    <span className="text-[11px] text-[var(--muted)]">
                      {formatDateTime(getAnnouncementDate(announcement))}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-[15px] font-semibold text-[var(--foreground)]">
                    {announcement.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--muted)]">
                    {getPreviewText(announcement.content)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <PortalEmptyState
                title="등록된 공지사항이 없습니다."
                description="관리자 공지가 등록되면 여기에서 바로 확인할 수 있습니다."
              />
            </div>
          )}
            </section>
          ) : null}

        {attendanceEnabled ? (
          <section className={portalSectionClass}>
          <PortalSectionHeader
            title="오늘의 출석"
            icon={<ClipboardList className="h-5 w-5" />}
            action={
              <Link
                href={`/${data.division.slug}/student/attendance`}
                className="inline-flex items-center gap-1 text-[13px] font-medium transition hover:opacity-70"
                style={{ color: "var(--division-color)" }}
              >
                전체
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="mt-3 min-w-0">
            <AttendanceCalendar
              weeklyAttendance={data.weeklyAttendance}
              maxDates={1}
              showFootnote={false}
            />
          </div>
          </section>
        ) : null}
        </div>
      ) : null}

      {pointsEnabled || examsEnabled ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {pointsEnabled ? (
            <section className={portalSectionClass}>
          <PortalSectionHeader
            title="최근 상벌점 기록"
            icon={<ShieldAlert className="h-5 w-5" />}
          />

          {data.recentPoints.length > 0 ? (
            <div className="mt-3 grid gap-2.5">
              {data.recentPoints.map((record) => (
                <article key={record.id} className={portalInsetClass}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <PointCategoryBadge category={record.category} />
                        <PointValueBadge points={record.points} />
                      </div>
                      <p className="mt-2 text-[15px] font-semibold text-[var(--foreground)]">
                        {record.ruleName || "직접 기록"}
                      </p>
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">
                      {formatDateTime(record.date)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-[1.5] text-[var(--muted)]">
                    {record.notes || "기록 메모가 없습니다."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <PortalEmptyState
                title="최근 상벌점 기록이 없습니다."
                description="등록된 상점 또는 벌점 이력이 아직 없습니다."
              />
            </div>
          )}
            </section>
          ) : null}

          {examsEnabled ? (
            <section className={portalSectionClass}>
          <PortalSectionHeader
            title="최근 모의고사"
            icon={<Target className="h-5 w-5" />}
          />

          {data.latestExam ? (
            <div className="mt-3 space-y-2.5">
              <div className={portalInsetClass}>
                <p className="text-[13px] text-[var(--muted)]">{data.latestExam.examTypeName}</p>
                <h3 className="mt-1.5 text-[22px] font-bold tracking-tight text-[var(--foreground)] md:text-[26px]">
                  {data.latestExam.examRound}회차
                </h3>
                <p className="mt-1.5 text-[13px] text-[var(--muted)]">
                  시험일 {formatDate(data.latestExam.examDate)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <PortalMiniTile
                  label="총점"
                  title={data.latestExam.totalScore ?? "-"}
                  className="bg-white"
                />
                <PortalMiniTile
                  label="반 내 석차"
                  title={data.latestExam.rankInClass ? `${data.latestExam.rankInClass}등` : "-"}
                  className="bg-white"
                />
              </div>

              <div className={portalInsetClass}>
                <p className="text-[13px] leading-[1.5] text-[var(--muted)]">
                  {data.latestExam.notes || "시험 메모가 없습니다."}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <PortalEmptyState
                title="모의고사 기록이 없습니다."
                description="최근 시험 결과가 등록되면 이 영역에 표시됩니다."
              />
            </div>
          )}
            </section>
          ) : null}
        </div>
      ) : null}
    </StudentPortalFrame>
  );
}
